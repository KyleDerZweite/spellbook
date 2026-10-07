import type { CardDocument } from '@spellbook/contracts/catalog.ts';
import type { ParsedDecklistRole } from './decklist';

export interface LegalityLine {
	quantity: number;
	role: ParsedDecklistRole;
	card: CardDocument;
}

export type { LegalityWarning } from '@spellbook/contracts/decks.ts';
import type { LegalityWarning } from '@spellbook/contracts/decks.ts';

const CONSTRUCTED_FORMATS = new Set([
	'standard',
	'pioneer',
	'modern',
	'legacy',
	'vintage',
	'pauper'
]);
const BASIC_LANDS = new Set(['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes']);

export function generateLegalityWarnings(lines: LegalityLine[], format = ''): LegalityWarning[] {
	const warnings: LegalityWarning[] = [];
	const normalizedFormat = format.trim().toLowerCase();
	const mainCount = sumRoles(lines, ['main']);
	const sideboardCount = sumRoles(lines, ['sideboard']);

	if (CONSTRUCTED_FORMATS.has(normalizedFormat) && mainCount < 60) {
		warnings.push({
			code: 'main_under_60',
			message: 'Main deck has fewer than 60 cards.'
		});
	}
	if (
		CONSTRUCTED_FORMATS.has(normalizedFormat) &&
		sideboardCount + sumRoles(lines, ['companion']) > 15
	) {
		warnings.push({
			code: 'sideboard_over_15',
			message: 'Sideboard has more than 15 cards.'
		});
	}

	const copyCounts = new Map<string, { card: CardDocument; quantity: number }>();
	const includedRoles =
		normalizedFormat === 'commander' ? ['main', 'commander'] : ['main', 'sideboard', 'companion'];
	for (const line of lines.filter((line) => includedRoles.includes(line.role))) {
		const key = line.card.oracle_id || line.card.name.toLowerCase();
		const current = copyCounts.get(key) ?? { card: line.card, quantity: 0 };
		current.quantity += line.quantity;
		copyCounts.set(key, current);
	}
	for (const { card, quantity } of copyCounts.values()) {
		const legality = card.legalities?.[normalizedFormat];
		const basic = card.type_line.includes('Basic') || BASIC_LANDS.has(card.name.toLowerCase());
		const unlimited = /deck can have any number of cards named/i.test(card.oracle_text);
		const copyLimit = legality === 'restricted' || normalizedFormat === 'commander' ? 1 : 4;
		const numberedException = card.oracle_text.match(
			/deck can have up to (seven|nine) cards named/i
		);
		const limit = numberedException
			? numberedException[1].toLowerCase() === 'seven'
				? 7
				: 9
			: copyLimit;
		if (
			(CONSTRUCTED_FORMATS.has(normalizedFormat) || normalizedFormat === 'commander') &&
			!basic &&
			!unlimited &&
			quantity > limit
		) {
			warnings.push({
				code:
					legality === 'restricted'
						? 'restricted_copies'
						: normalizedFormat === 'commander'
							? 'commander_singleton'
							: 'too_many_copies',
				message: `${card.name} exceeds the ${limit}-copy limit in ${format}.`,
				cardName: card.name
			});
		}
	}
	const checkedCards = new Set<string>();
	for (const { card, role } of lines) {
		if (role === 'maybeboard' || checkedCards.has(card.oracle_id)) continue;
		checkedCards.add(card.oracle_id);
		const legality = card.legalities?.[normalizedFormat];
		if (normalizedFormat && legality && legality !== 'legal' && legality !== 'restricted') {
			warnings.push({
				code: 'format_illegal',
				message: `${card.name} is ${legality} in ${format}.`,
				cardName: card.name
			});
		}
	}

	if (normalizedFormat === 'commander') {
		const committedTotal = sumRoles(lines, ['main', 'commander']);
		const commanderCount = sumRoles(lines, ['commander']);
		if (committedTotal !== 100) {
			warnings.push({
				code: 'commander_size',
				message: 'Commander main deck and commanders should contain exactly 100 cards.'
			});
		}
		if (commanderCount !== 1 && commanderCount !== 2) {
			warnings.push({
				code: 'commander_count',
				message: 'Commander decks should have 1 or 2 commander cards.'
			});
		}
	}

	return warnings;
}

function sumRoles(lines: LegalityLine[], roles: ParsedDecklistRole[]): number {
	return lines
		.filter((line) => roles.includes(line.role))
		.reduce((sum, line) => sum + line.quantity, 0);
}
