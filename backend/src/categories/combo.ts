import { sql } from 'drizzle-orm';
import type { Transaction } from '../db/client.ts';
import type { CategoryRole, DeckRule, EntryRule } from '@spellbook/contracts/category-library.ts';
import type {
	ComboCompositionEntry,
	ComboEvaluation,
	ComboEvidence,
	ComboSource,
	ComboSourceToken,
	ComboVariant
} from '@spellbook/contracts/combo.ts';
import { categoryCheckpoint, categoryJson } from './work.ts';
import { comboAdapterEnabled } from './combo-settings.ts';
import { evaluateComboVariants } from './combo-matcher.ts';

export type ComboDefinition = {
	id: string;
	roles: CategoryRole[];
	rule: EntryRule | DeckRule;
};
export function comboOutcomes(rule: EntryRule | DeckRule): string[] {
	if (rule.op === 'comboParticipant' || rule.op === 'comboOutcome') return [rule.outcomeId];
	if (rule.op === 'all' || rule.op === 'any')
		return [...new Set(rule.children.flatMap(comboOutcomes))];
	if (rule.op === 'not') return comboOutcomes(rule.child);
	if ('predicate' in rule) return comboOutcomes(rule.predicate);
	return [];
}
export async function readComboSource(tx: Transaction): Promise<ComboSource> {
	const enabled = comboAdapterEnabled(tx);
	const row = (
		await tx.execute(
			sql`SELECT s.active_publication::text,s.refresh_status,p.source_updated_at::text,p.source_version,p.payload_digest,p.decoded_digest,p.parser_version,p.policy_version FROM combo_state s LEFT JOIN combo_publications p ON p.id=s.active_publication WHERE s.id=1`
		)
	).rows[0];
	return {
		enabled,
		publicationId: (row?.active_publication as string | null) ?? null,
		policyVersion: 'ingredients-v1',
		availability: !enabled
			? 'Disabled'
			: row?.active_publication && row.policy_version === 'ingredients-v1'
				? 'Available'
				: 'Unavailable',
		refreshStatus: (row?.refresh_status as ComboSource['refreshStatus']) ?? {
			kind: 'NeverAttempted'
		},
		sourceTime: row?.source_updated_at
			? new Date(String(row.source_updated_at)).toISOString()
			: null,
		sourceVersion: (row?.source_version as string | null) ?? null,
		payloadDigest: (row?.payload_digest as string | null) ?? null,
		decodedDigest: (row?.decoded_digest as string | null) ?? null,
		parserVersion: row?.parser_version == null ? null : Number(row.parser_version)
	};
}
export function comboSourceToken(source: ComboSource): ComboSourceToken {
	return {
		enabled: source.enabled,
		publicationId: source.publicationId,
		policyVersion: source.policyVersion
	};
}
function groupKey(roles: readonly CategoryRole[]) {
	return [...new Set(roles)].sort().join(',');
}
export async function readComboFacts(
	tx: Transaction,
	entries: ComboCompositionEntry[],
	definitions: ComboDefinition[],
	source: ComboSource
) {
	const groups = new Map<string, { roles: CategoryRole[]; outcomes: Set<string> }>();
	for (const definition of definitions) {
		const outcomes = comboOutcomes(definition.rule);
		if (!outcomes.length) continue;
		const key = groupKey(definition.roles);
		let group = groups.get(key);
		if (!group)
			groups.set(
				key,
				(group = {
					roles: [...new Set(definition.roles)].sort(),
					outcomes: new Set()
				})
			);
		for (const outcome of outcomes) group.outcomes.add(outcome);
	}
	const evaluations = new Map<string, ComboEvaluation>();
	let bytes = 0;
	for (const [key, group] of groups) {
		const eligible = entries.filter((e) => group.roles.includes(e.role));
		const known = new Map<string, { total: bigint; commander: bigint }>();
		let unknown = 0n,
			unknownCommander = 0n;
		for (const entry of eligible) {
			const qty = BigInt(entry.quantity);
			if (entry.oracleId) {
				let available = known.get(entry.oracleId);
				if (!available) known.set(entry.oracleId, (available = { total: 0n, commander: 0n }));
				available.total += qty;
				if (entry.role === 'commander') available.commander += qty;
			} else {
				unknown += qty;
				if (entry.role === 'commander') unknownCommander += qty;
			}
		}
		const available = JSON.stringify(
			[...known].map(([id, v]) => ({
				id,
				total: v.total.toString(),
				commander: v.commander.toString()
			}))
		);
		for (const outcomeId of [...group.outcomes].sort()) {
			categoryCheckpoint(tx);
			const publicationId = source.availability === 'Available' ? source.publicationId : null;
			const present = publicationId
				? (
						await tx.execute(
							sql`SELECT 1 FROM combo_outcomes WHERE publication_id=${publicationId}::uuid AND id=${outcomeId}`
						)
					).rows.length > 0
				: false;
			const variants: ComboVariant[] = [];
			if (present) {
				let after = '';
				while (true) {
					// Every pruned candidate has a mandatory known-identity deficit even at the possible upper bound.
					const page =
						await tx.execute(sql`WITH available AS (SELECT * FROM jsonb_to_recordset(${available}::jsonb) AS a(id text,total numeric,commander numeric))
 SELECT v.id,v.document FROM combo_variant_outcomes o JOIN combo_variants v ON v.publication_id=o.publication_id AND v.id=o.variant_id
 WHERE o.publication_id=${publicationId}::uuid AND o.outcome_id=${outcomeId} AND v.id>${after}
 AND NOT EXISTS (SELECT i.oracle_id FROM combo_variant_ingredients i LEFT JOIN available a ON a.id=i.oracle_id::text
 WHERE i.publication_id=v.publication_id AND i.variant_id=v.id AND i.oracle_id IS NOT NULL
 GROUP BY i.oracle_id,a.total,a.commander HAVING sum(i.quantity)>coalesce(a.total,0)+${unknown.toString()}::numeric
 OR coalesce(sum(i.quantity) FILTER (WHERE i.must_be_commander),0)>coalesce(a.commander,0)+${unknownCommander.toString()}::numeric)
 ORDER BY v.id LIMIT 100`);
					const json = categoryJson(tx, page.rows);
					bytes += Buffer.byteLength(json);
					categoryCheckpoint(tx, bytes);
					variants.push(...page.rows.map((r) => r.document as ComboVariant));
					if (page.rows.length < 100) break;
					after = String(page.rows.at(-1)!.id);
				}
			}
			const evaluated = evaluateComboVariants({
				entries,
				roles: group.roles,
				outcomeId,
				publication:
					publicationId && source.parserVersion !== null
						? {
								publicationId,
								parserVersion: source.parserVersion,
								complete: true,
								outcomePresent: present
							}
						: null,
				variants
			});
			evaluations.set(`${key}:${outcomeId}`, evaluated);
		}
	}
	return {
		forDefinition(definition: ComboDefinition) {
			return comboOutcomes(definition.rule).map((id) =>
				evaluations.get(`${groupKey(definition.roles)}:${id}`)!
			);
		},
		evidence(definition: ComboDefinition): ComboEvidence {
			return {
				source,
				evaluations: this.forDefinition(definition).map(
					({ participants: _participants, ...rest }) => rest
				)
			};
		}
	};
}
