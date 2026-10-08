import { comboTransactionReadOnly } from './combo-settings.ts';
import {
	comboOutcomes,
	readComboSource,
	comboSourceToken,
	readComboFacts,
	type ComboDefinition
} from './combo.ts';
import type { ComboEvidence } from '@spellbook/contracts/combo.ts';
import { queueWholeDeckEvaluation } from './jobs.ts';
import { categoryCheckpoint, categoryJson } from './work.ts';
import { mutationFingerprint } from '../decks/request-fingerprint.ts';
import { sql } from 'drizzle-orm';
import type { Transaction } from '../db/client.ts';
import type {
	CategoryEvidence,
	EntryDefinition,
	EntryCategoryDecision
} from '@spellbook/contracts/categories.ts';
import { evaluatePrimary, starterDefinitions, orderCategoryDefinitions } from './rules.ts';
import { readLibrary, assertUniqueLocalCategoryNames } from './library.ts';
import { ruleRoots } from './library-rules.ts';
import type { DefinitionVersion, EntryRule } from '@spellbook/contracts/category-library.ts';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export type CategorySourceTokens = {
	catalogGenerationId: string | null;
	oraclePublicationId: string | null;
	policy: string;
	combo?: import('@spellbook/contracts/combo.ts').ComboSourceToken;
};
type Fact = {
	printing_id: string;
	raw_oracle_id: string | null;
	types: string[] | null;
	keywords: string[] | null;
	transform_version: number | null;
	schema_version: number | null;
	catalog_generation_id: string | null;
	oracle_publication_id: string | null;
	source_time: string | null;
	payload_digest: string | null;
	parser_version: number | null;
	roots: Record<string, string[] | null>;
};
type CanonicalIdentity =
	| {
			kind: 'Known';
			oracleId: string;
			printingId: string;
			transformVersion: number;
			catalogGenerationId: string;
	  }
	| {
			kind: 'Unknown';
			reason: 'MissingRawOracle' | 'UnprovenCatalogPublication';
	  };
function provenTransform(fact: Fact) {
	return (
		fact.catalog_generation_id !== null &&
		fact.transform_version !== null &&
		fact.transform_version >= 2 &&
		fact.transform_version === fact.schema_version
	);
}
function canonicalIdentity(fact: Fact): CanonicalIdentity {
	if (!provenTransform(fact)) return { kind: 'Unknown', reason: 'UnprovenCatalogPublication' };
	if (!fact.raw_oracle_id || !uuid.test(fact.raw_oracle_id))
		return { kind: 'Unknown', reason: 'MissingRawOracle' };
	return {
		kind: 'Known',
		oracleId: fact.raw_oracle_id,
		printingId: fact.printing_id,
		transformVersion: fact.transform_version!,
		catalogGenerationId: fact.catalog_generation_id!
	};
}
export async function readEntryCategoryFacts(
	tx: Transaction,
	printingIds: string[],
	definitions: EntryDefinition[],
	comboDefinitions: ComboDefinition[] = definitions
		.filter((d) => d.rule)
		.map((d) => ({
			id: d.id,
			roles: d.definitionSnapshot?.roles ?? ['main'],
			rule: d.rule!
		}))
) {
	const applicableCombo = comboDefinitions.some((d) => comboOutcomes(d.rule).length > 0);
	if (applicableCombo && !comboTransactionReadOnly(tx)) {
		await tx.execute(sql`SELECT id FROM catalog_state WHERE id=1 FOR SHARE`);
		await tx.execute(sql`SELECT id FROM oracle_tag_state WHERE id=1 FOR SHARE`);
		await tx.execute(sql`SELECT id FROM combo_state WHERE id=1 FOR SHARE`);
	}
	const comboSource = applicableCombo ? await readComboSource(tx) : null;
	const ids = [...new Set(printingIds.filter((id) => uuid.test(id)))];
	const roots = [
		...new Set(
			definitions.flatMap((d) => (d.rule ? ruleRoots(d.rule) : d.rootId ? [d.rootId] : []))
		)
	];
	// Estimate requested fact cells before SQL and check the complete decoded response before evaluation.
	categoryCheckpoint(tx, Math.max(ids.length, 1) * Math.max(roots.length, 1) * 128);
	const result = await tx.execute(sql`WITH source AS (
 SELECT cs.active_generation AS catalog_generation_id, g.schema_version, os.active_publication AS oracle_publication_id,
 op.source_updated_at::text AS source_time,op.payload_digest,op.parser_version
 FROM catalog_state cs LEFT JOIN catalog_generations g ON g.id=cs.active_generation
 CROSS JOIN oracle_tag_state os LEFT JOIN oracle_tag_publications op ON op.id=os.active_publication WHERE cs.id=1 AND os.id=1),
 requests AS (SELECT unnest(${'{' + ids.join(',') + '}'}::uuid[]) AS printing_id)
 SELECT r.printing_id::text,f.raw_oracle_id::text,f.types,f.keywords,f.transform_version,s.*,
 COALESCE((SELECT jsonb_object_agg(root.id::text,CASE WHEN t.id IS NULL THEN NULL ELSE
 COALESCE((SELECT jsonb_agg(DISTINCT m.tag_id::text) FROM oracle_tag_closure c JOIN oracle_tag_memberships m
 ON m.publication_id=c.publication_id AND m.tag_id=c.descendant_id WHERE c.publication_id=s.oracle_publication_id
 AND c.ancestor_id=root.id AND m.oracle_id=f.raw_oracle_id),'[]'::jsonb) END)
 FROM unnest(${'{' + roots.join(',') + '}'}::uuid[]) root(id) LEFT JOIN oracle_tags t ON t.publication_id=s.oracle_publication_id AND t.id=root.id),'{}'::jsonb) AS roots
 FROM source s LEFT JOIN requests r ON true LEFT JOIN catalog_oracle_facts f ON f.generation_id=s.catalog_generation_id AND f.printing_id=r.printing_id`);
	categoryJson(tx, result.rows);
	const facts = new Map(
		(result.rows as Fact[])
			.filter((row) => row.printing_id !== null)
			.map((row) => [
				row.printing_id,
				{
					...row,
					types: provenTransform(row) ? row.types : null,
					keywords: provenTransform(row) && row.transform_version! >= 3 ? row.keywords : null,
					canonicalIdentity: canonicalIdentity(row)
				}
			])
	);
	const first = result.rows[0] as Fact | undefined;
	const tokens: CategorySourceTokens = {
		catalogGenerationId: first?.catalog_generation_id ?? null,
		oraclePublicationId: first?.oracle_publication_id ?? null,
		policy: mutationFingerprint(definitions),
		...(comboSource ? { combo: comboSourceToken(comboSource) } : {})
	};
	return { facts, tokens, source: first, comboSource };
}
export async function adoptedDefinitions(
	tx: Transaction,
	deckId: string
): Promise<EntryDefinition[] | null> {
	const result = await tx.execute(
		sql`SELECT definitions FROM deck_category_bundles WHERE deck_id=${deckId}::uuid`
	);
	return result.rows.length ? (result.rows[0].definitions as EntryDefinition[]) : null;
}
export async function ensureEntryCategoryInitialization(tx: Transaction, deckId: string) {
	let definitions = await adoptedDefinitions(tx, deckId);
	if (!definitions) {
		const owner = await tx.execute(sql`SELECT account_id FROM decks WHERE id=${deckId}::uuid`);
		const library = await readLibrary(tx, String(owner.rows[0].account_id), true);
		definitions = [
			...library.definitions
				.filter((d) => !d.archived && d.current.scope === 'entry')
				.map((d) => adoptCustomDefinition(d.current)),
			...starterDefinitions.map((d) => ({
				...d,
				originId: d.id,
				id: crypto.randomUUID()
			}))
		];
		assertUniqueLocalCategoryNames(definitions);
		await tx.execute(
			sql`INSERT INTO deck_category_bundles(deck_id,definitions,whole_deck_definitions,library_revision) VALUES(${deckId}::uuid,${JSON.stringify(definitions)}::jsonb,${JSON.stringify(library.definitions.filter((d) => !d.archived && d.current.scope === 'deck').map((d) => d.current))}::jsonb,${library.revision}::bigint)`
		);
		await tx.execute(
			sql`INSERT INTO deck_whole_categories(deck_id,version_id,origin_id,definition_snapshot,name,display_order) SELECT deck_id,(v->>'id')::uuid,(v->>'originId')::uuid,v,v->>'name',(v->>'displayOrder')::integer FROM deck_category_bundles CROSS JOIN LATERAL jsonb_array_elements(whole_deck_definitions) v WHERE deck_id=${deckId}::uuid`
		);
		await queueWholeDeckEvaluation(tx, deckId);
	}
	const entries = await tx.execute(
		sql`SELECT c.id,c.catalog_card_id FROM deck_cards c LEFT JOIN deck_entry_category_decisions d ON d.entry_id=c.id WHERE c.deck_id=${deckId}::uuid AND c.role='main' AND d.entry_id IS NULL`
	);
	if (!entries.rows.length) return [] as string[];
	const composition = await readCategoryComposition(tx, deckId);
	const { facts, comboSource } = await readEntryCategoryFacts(
		tx,
		composition.map((e) => e.printingId),
		definitions
	);
	const comboDefinitions = entryComboDefinitions(definitions);
	const combos = comboSource
		? await readComboFacts(tx, comboComposition(composition, facts), comboDefinitions, comboSource)
		: null;
	const changed: string[] = [],
		prepared = prepareCategoryEvaluation(definitions);
	for (const row of entries.rows) {
		const printingId = String(row.catalog_card_id),
			fact = facts.get(printingId);
		const outcome = evaluateCategoryFact(
			definitions,
			printingId,
			fact,
			prepared,
			combos ? { entryId: String(row.id), combos } : undefined
		);
		await tx.execute(
			sql`INSERT INTO deck_entry_category_decisions(entry_id,deck_id,category_id,state,evidence,definition_snapshot) VALUES(${row.id}::uuid,${deckId}::uuid,${outcome.categoryId}::uuid,${outcome.state},${JSON.stringify(outcome.evidence)}::jsonb,${outcome.definitionSnapshot ? JSON.stringify(outcome.definitionSnapshot) : null}::jsonb)`
		);
		changed.push(String(row.id));
	}
	await tx.execute(
		sql`UPDATE deck_category_bundles SET decision_revision=decision_revision+1 WHERE deck_id=${deckId}::uuid`
	);
	return changed;
}
export function prepareCategoryEvaluation(definitions: EntryDefinition[]) {
	return {
		ordered: orderCategoryDefinitions(definitions),
		byId: new Map(definitions.map((d) => [d.id, d]))
	};
}
export function evaluateCategoryFact(
	definitions: EntryDefinition[],
	printingId: string,
	fact: (Fact & { canonicalIdentity: CanonicalIdentity }) | undefined,
	prepared?: ReturnType<typeof prepareCategoryEvaluation>,
	combo?: {
		entryId: string;
		combos: Awaited<ReturnType<typeof readComboFacts>>;
	}
) {
	const canonical = fact?.canonicalIdentity.kind === 'Known';
	const outcome = evaluatePrimary(
		prepared?.ordered ?? definitions,
		{
			types: fact?.types ?? null,
			keywords: fact?.keywords ?? null,
			canonical,
			comboForDefinition: combo
				? (definition) =>
						Object.fromEntries(
							combo.combos
								.forDefinition({
									id: definition.id,
									roles: definition.definitionSnapshot?.roles ?? ['main'],
									rule: definition.rule!
								})
								.map((e) => [e.outcomeId, e.participants[combo.entryId] ?? 'Unknown'])
						)
				: undefined,
			oracleId: canonical ? fact!.raw_oracle_id : null,
			roots: Object.fromEntries(
				Object.entries(fact?.roots ?? {}).map(([key, value]) => [key, value ?? undefined])
			)
		},
		!!prepared
	);
	const definition = prepared
		? prepared.byId.get(outcome.definitionId ?? '')
		: definitions.find((d) => d.id === outcome.definitionId);
	const evidence: CategoryEvidence = {
		predicates: outcome.predicates.map((predicate) => {
			const evaluated = prepared
				? prepared.byId.get(predicate.definitionId ?? '')
				: definitions.find((d) => d.id === predicate.definitionId);
			return {
				...predicate,
				...(evaluated
					? {
							definitionName: evaluated.name,
							definitionVersion: evaluated.version
						}
					: {})
			};
		}),
		catalogGenerationId: fact?.catalog_generation_id ?? null,
		oraclePublicationId: fact?.oracle_publication_id ?? null,
		sourceTime: fact?.source_time ? new Date(fact.source_time).toISOString() : null,
		payloadDigest: fact?.payload_digest ?? null,
		parserVersion: fact?.parser_version ?? null,
		printingId,
		rawOracleId: canonical ? fact!.raw_oracle_id : null,
		types: fact?.types ?? null,
		transformVersion: fact?.transform_version ?? null,
		...(combo &&
		entryComboDefinitions(
			definitions.filter((d) => outcome.predicates.some((p) => p.definitionId === d.id))
		).length
			? {
					combo: combinedComboEvidence(
						combo.combos,
						definitions.filter((d) => outcome.predicates.some((p) => p.definitionId === d.id))
					)
				}
			: {})
	};
	return {
		state: outcome.state,
		categoryId: definition?.id ?? null,
		evidence,
		definitionSnapshot: definition?.definitionSnapshot ?? definition ?? null
	};
}
export async function readDecisions(
	tx: Transaction,
	deckId: string
): Promise<EntryCategoryDecision[]> {
	const result = await tx.execute(
		sql`SELECT entry_id,category_id,state,revision::text,evidence,definition_snapshot,previous_evaluation FROM deck_entry_category_decisions WHERE deck_id=${deckId}::uuid ORDER BY entry_id`
	);
	return result.rows.map((row) => ({
		entryId: String(row.entry_id),
		categoryId: row.category_id as string | null,
		state: row.state as EntryCategoryDecision['state'],
		revision: String(row.revision),
		evidence: row.evidence as CategoryEvidence | null,
		definitionSnapshot: row.definition_snapshot as EntryCategoryDecision['definitionSnapshot'],
		previousEvaluation: row.previous_evaluation as CategoryEvidence | null
	}));
}
export function adoptCustomDefinition(
	version: DefinitionVersion,
	localId: string = crypto.randomUUID()
): EntryDefinition {
	return {
		id: localId,
		origin: 'custom',
		originId: version.originId,
		definitionVersionId: version.id,
		definitionSnapshot: version,
		name: version.name,
		meaning: version.meaning,
		rule: version.rule as EntryRule,
		version: version.version,
		priority: version.priority,
		displayOrder: version.displayOrder,
		policyVersion: 1,
		mappingVersion: 1,
		rootId: null,
		descendants: true,
		excludeLand: false,
		automaticEligible: version.roles.includes('main')
	};
}

export function entryComboDefinitions(definitions: EntryDefinition[]): ComboDefinition[] {
	return definitions
		.filter((d) => d.rule && comboOutcomes(d.rule).length)
		.map((d) => ({
			id: d.id,
			roles: d.definitionSnapshot?.roles ?? ['main'],
			rule: d.rule!
		}));
}
export async function readCategoryComposition(tx: Transaction, deckId: string) {
	const result = await tx.execute(
		sql`SELECT id::text,catalog_card_id,role,quantity FROM deck_cards WHERE deck_id=${deckId}::uuid ORDER BY id`
	);
	categoryJson(tx, result.rows);
	return result.rows.map((r) => ({
		entryId: String(r.id),
		printingId: String(r.catalog_card_id),
		role: r.role as DefinitionVersion['roles'][number],
		quantity: Number(r.quantity)
	}));
}
export function comboComposition(
	composition: Awaited<ReturnType<typeof readCategoryComposition>>,
	facts: Awaited<ReturnType<typeof readEntryCategoryFacts>>['facts']
) {
	return composition.map((entry) => ({
		...entry,
		oracleId:
			facts.get(entry.printingId)?.canonicalIdentity.kind === 'Known'
				? facts.get(entry.printingId)!.raw_oracle_id
				: null
	}));
}
function combinedComboEvidence(
	combos: Awaited<ReturnType<typeof readComboFacts>>,
	definitions: EntryDefinition[]
): ComboEvidence {
	const evidence = entryComboDefinitions(definitions).map((d) => combos.evidence(d));
	return {
		source: evidence[0]!.source,
		evaluations: evidence.flatMap((e) => e.evaluations)
	};
}
