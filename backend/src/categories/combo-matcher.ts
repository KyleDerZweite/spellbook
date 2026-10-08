import type { CategoryRole, Truth } from '@spellbook/contracts/category-library.ts';
import type {
	ComboCompositionEntry,
	ComboEvaluation,
	ComboProof,
	ComboVariant
} from '@spellbook/contracts/combo.ts';

export type ComboMatcherInput = {
	entries: readonly ComboCompositionEntry[];
	roles: readonly CategoryRole[];
	outcomeId: string;
	publication: {
		publicationId: string;
		parserVersion: number;
		complete: boolean;
		outcomePresent: boolean;
	} | null;
	variants: readonly ComboVariant[];
};

const roleOrder: CategoryRole[] = ['main', 'sideboard', 'commander', 'companion'];
const oracleIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const zones = new Set(['H', 'B', 'C', 'E', 'G', 'L']);
type Quantities = { total: bigint; commander: bigint };
const empty = (): Quantities => ({ total: 0n, commander: 0n });
const validOracle = (id: string | null): id is string => id !== null && oracleIdPattern.test(id);

/** Candidates may exclude only variants already disproved by mandatory deficits. */
export function evaluateComboVariants(input: ComboMatcherInput): ComboEvaluation {
	const roles = roleOrder.filter((role) => input.roles.includes(role));
	const participants: Record<string, Truth> = {};
	const available = new Map<string, Quantities>();
	const unknown = empty();
	let total = 0n,
		commanderTotal = 0n;
	for (const entry of input.entries) {
		if (!Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 2147483647)
			throw new Error('Combo matcher integrity: quantity must be a positive PostgreSQL integer');
		participants[entry.entryId] = 'False';
		if (!roles.includes(entry.role)) continue;
		const quantity = BigInt(entry.quantity);
		total += quantity;
		if (entry.role === 'commander') commanderTotal += quantity;
		const amounts = validOracle(entry.oracleId)
			? (available.get(entry.oracleId) ?? empty())
			: unknown;
		amounts.total += quantity;
		if (entry.role === 'commander') amounts.commander += quantity;
		if (validOracle(entry.oracleId)) available.set(entry.oracleId, amounts);
	}
	const result: ComboEvaluation = {
		outcomeId: input.outcomeId,
		roles,
		truth: 'Unknown',
		participants,
		participantProofs: {},
		proof: null
	};
	const publication = input.publication;
	if (!publication?.complete || !publication.outcomePresent) {
		for (const entry of input.entries)
			if (roles.includes(entry.role)) participants[entry.entryId] = 'Unknown';
		return result;
	}
	result.truth = 'False';
	for (const variant of [...input.variants].sort((a, b) => a.id.localeCompare(b.id))) {
		if (!variant.outcomeIds.includes(input.outcomeId)) continue;
		const truth = evaluateVariant(variant, available, unknown, total, commanderTotal);
		if (truth === 'False') continue;
		let proof: ComboProof | null = null;
		if (truth === 'True') {
			result.truth = 'True';
			proof = {
				variant,
				publicationId: publication.publicationId,
				outcomeId: input.outcomeId,
				roles,
				policyVersion: 'ingredients-v1',
				parserVersion: publication.parserVersion
			};
			result.proof ??= proof;
		} else if (result.truth !== 'True') result.truth = 'Unknown';
		for (const entry of input.entries) {
			if (!roles.includes(entry.role) || participants[entry.entryId] === 'True') continue;
			const compatible = variant.ingredients.some(
				(ingredient) =>
					(!ingredient.mustBeCommander || entry.role === 'commander') &&
					(!validOracle(entry.oracleId) ||
						!validOracle(ingredient.oracleId) ||
						ingredient.oracleId === entry.oracleId)
			);
			if (compatible) {
				participants[entry.entryId] =
					truth === 'True' && validOracle(entry.oracleId) ? 'True' : 'Unknown';
				if (participants[entry.entryId] === 'True' && proof)
					result.participantProofs[entry.entryId] = proof;
			} else if (uncertainIngredientIdentities(variant)) participants[entry.entryId] = 'Unknown';
		}
	}
	return result;
}

// These provider reasons constrain known ingredients without introducing another identity.
const identityPreservingReasons = new Set(['used-face', 'card-state', 'status', 'zones']);
function uncertainIngredientIdentities(variant: ComboVariant) {
	return (
		variant.templates.length > 0 ||
		variant.ingredients.length === 0 ||
		variant.ingredients.some((ingredient) => !validOracle(ingredient.oracleId)) ||
		variant.unsupportedReasons.some((reason) => !identityPreservingReasons.has(reason))
	);
}

function evaluateVariant(
	variant: ComboVariant,
	available: ReadonlyMap<string, Quantities>,
	unknown: Quantities,
	availableTotal: bigint,
	availableCommanderTotal: bigint
): Truth {
	let supported =
		variant.status === 'OK' &&
		variant.ingredients.length > 0 &&
		variant.templates.length === 0 &&
		variant.unsupportedReasons.length === 0;
	const required = new Map<string, Quantities>();
	let requiredTotal = 0n,
		requiredCommanderTotal = 0n;
	for (const ingredient of variant.ingredients) {
		if (!/^[1-9][0-9]*$/.test(ingredient.quantity)) {
			supported = false;
			continue;
		}
		const quantity = BigInt(ingredient.quantity);
		requiredTotal += quantity;
		if (ingredient.mustBeCommander) requiredCommanderTotal += quantity;
		if (!validOracle(ingredient.oracleId)) supported = false;
		else {
			const amounts = required.get(ingredient.oracleId) ?? empty();
			amounts.total += quantity;
			if (ingredient.mustBeCommander) amounts.commander += quantity;
			required.set(ingredient.oracleId, amounts);
		}
		if (
			ingredient.usedFace !== null ||
			!ingredient.zones.length ||
			ingredient.zones.some((zone) => !zones.has(zone)) ||
			Object.values(ingredient.states).some((state) => state !== '')
		)
			supported = false;
	}
	if (requiredTotal > availableTotal || requiredCommanderTotal > availableCommanderTotal)
		return 'False';
	let totalDeficit = 0n,
		commanderDeficit = 0n;
	for (const [oracleId, amounts] of required) {
		const held = available.get(oracleId) ?? empty();
		const ordinaryShortage = amounts.total > held.total ? amounts.total - held.total : 0n;
		const commanderShortage =
			amounts.commander > held.commander ? amounts.commander - held.commander : 0n;
		// Unknown Commander copies also consume the total unknown-copy allowance.
		totalDeficit += ordinaryShortage > commanderShortage ? ordinaryShortage : commanderShortage;
		commanderDeficit += commanderShortage;
	}
	if (totalDeficit > unknown.total || commanderDeficit > unknown.commander) return 'False';
	return supported && totalDeficit === 0n ? 'True' : 'Unknown';
}
