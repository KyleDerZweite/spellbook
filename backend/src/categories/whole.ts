import { sql } from 'drizzle-orm';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import type { DefinitionVersion, DeckRule } from '@spellbook/contracts/category-library.ts';
import type {
	DeckWholeCategories,
	WholeCategory,
	WholeCategoryDecision,
	WholeCategoryEvidence,
	WholeCategoryAcknowledgement,
	WholeCategoriesApplication
} from '@spellbook/contracts/whole-categories.ts';
import type { Database, Transaction } from '../db/client.ts';
import type { createLocalAuth } from '../auth/local.ts';
import { categoryTransaction, categoryCheckpoint, categoryJson } from './work.ts';
import {
	categoryUuid,
	categoryRevision,
	categoryName,
	categoryReceipt,
	storeCategoryReceipt,
	strictCategoryFields,
	LibraryConflict
} from './library.ts';
import { lockOwnedCategoryDeck } from './changes.ts';
import { CategoryNotFound } from './errors.ts';
import { mutationFingerprint } from '../decks/request-fingerprint.ts';
import {
	readEntryCategoryFacts,
	adoptCustomDefinition,
	readCategoryComposition,
	comboComposition
} from './persistence.ts';
import { readComboFacts, type ComboDefinition } from './combo.ts';
import { evaluateDeckRule, collectDeckRulePredicates } from './deck-rules.ts';
import { advanceDeckLibraryRevision } from '../decks/directory-revision.ts';
import { publishCategoryChange } from './notification.ts';
import { touchWholeDeckJob } from './jobs.ts';
import { ValidationError } from '../mtg/validation.ts';

export async function readWholeCategories(
	tx: Transaction,
	deckId: string
): Promise<WholeCategory[]> {
	const rows = await tx.execute(
		sql`SELECT c.*,d.state,d.manual,d.truth,d.attempted_truth,d.revision::text,d.evidence,d.previous_evaluation FROM deck_whole_categories c LEFT JOIN deck_whole_category_decisions d USING(deck_id,version_id) WHERE c.deck_id=${deckId}::uuid ORDER BY c.display_order,c.name,c.version_id`
	);
	categoryJson(tx, rows.rows);
	return rows.rows.map((r) => ({
		versionId: String(r.version_id),
		originId: String(r.origin_id),
		definition: r.definition_snapshot as DefinitionVersion,
		name: String(r.name),
		displayOrder: Number(r.display_order),
		suppressed: Boolean(r.suppressed),
		automaticActive: Boolean(r.automatic_active),
		decision: r.state
			? {
					versionId: String(r.version_id),
					state: r.state as WholeCategoryDecision['state'],
					manual: r.manual as WholeCategoryDecision['manual'],
					truth: r.truth as WholeCategoryDecision['truth'],
					attemptedTruth: r.attempted_truth as WholeCategoryDecision['attemptedTruth'],
					revision: String(r.revision),
					evidence: r.evidence as WholeCategoryEvidence | null,
					previousEvaluation: r.previous_evaluation as WholeCategoryEvidence | null
				}
			: null
	}));
}
export async function storeWholeCategories(
	tx: Transaction,
	deckId: string,
	categories: WholeCategory[]
) {
	const ids = categories.map((c) => c.versionId);
	await tx.execute(
		sql`DELETE FROM deck_whole_categories WHERE deck_id=${deckId}::uuid AND NOT(version_id=ANY(${'{' + ids.join(',') + '}'}::uuid[]))`
	);
	for (const c of categories) {
		categoryCheckpoint(tx);
		await tx.execute(
			sql`INSERT INTO deck_whole_categories(deck_id,version_id,origin_id,definition_snapshot,name,display_order,suppressed,automatic_active) VALUES(${deckId}::uuid,${c.versionId}::uuid,${c.originId}::uuid,${categoryJson(tx, c.definition)}::jsonb,${c.name},${c.displayOrder},${c.suppressed},${c.automaticActive}) ON CONFLICT(deck_id,version_id) DO UPDATE SET definition_snapshot=EXCLUDED.definition_snapshot,name=EXCLUDED.name,display_order=EXCLUDED.display_order,suppressed=EXCLUDED.suppressed,automatic_active=EXCLUDED.automatic_active`
		);
		const d = c.decision;
		if (d)
			await tx.execute(
				sql`INSERT INTO deck_whole_category_decisions(deck_id,version_id,state,manual,truth,attempted_truth,revision,evidence,previous_evaluation) VALUES(${deckId}::uuid,${d.versionId}::uuid,${d.state},${d.manual},${d.truth},${d.attemptedTruth},${d.revision}::bigint,${d.evidence ? categoryJson(tx, d.evidence) : null}::jsonb,${d.previousEvaluation ? categoryJson(tx, d.previousEvaluation) : null}::jsonb) ON CONFLICT(deck_id,version_id) DO UPDATE SET state=EXCLUDED.state,manual=EXCLUDED.manual,truth=EXCLUDED.truth,attempted_truth=EXCLUDED.attempted_truth,revision=EXCLUDED.revision,evidence=EXCLUDED.evidence,previous_evaluation=EXCLUDED.previous_evaluation`
			);
		else
			await tx.execute(
				sql`DELETE FROM deck_whole_category_decisions WHERE deck_id=${deckId}::uuid AND version_id=${c.versionId}::uuid`
			);
	}
}
export function wholeSemantics(c: WholeCategory) {
	return {
		...c,
		decision: c.decision ? { ...c.decision, revision: null } : null
	};
}
export async function evaluateWholeCategories(
	tx: Transaction,
	deckId: string,
	compositionRevision: string,
	categories: WholeCategory[]
) {
	const composition = await readCategoryComposition(tx, deckId);
	const comboDefinitions: ComboDefinition[] = categories
		.filter((c) => !c.suppressed && c.automaticActive && c.decision?.state !== 'Manual')
		.map((c) => ({
			id: c.versionId,
			roles: c.definition.roles,
			rule: c.definition.rule
		}));
	const factDefinitions = categories
		.filter((c) => !c.suppressed && c.automaticActive)
		.flatMap((c) =>
			collectDeckRulePredicates(c.definition.rule as DeckRule).map((predicate) => ({
				...adoptCustomDefinition(c.definition),
				rule: predicate
			}))
		);
	const { facts, tokens, source, comboSource } = await readEntryCategoryFacts(
		tx,
		composition.map((e) => e.printingId),
		factDefinitions,
		comboDefinitions
	);
	const combos = comboSource
		? await readComboFacts(tx, comboComposition(composition, facts), comboDefinitions, comboSource)
		: null;
	const inputs = composition.map((r) => {
		const fact = facts.get(r.printingId);
		return {
			entryId: r.entryId,
			printingId: r.printingId,
			role: r.role as DefinitionVersion['roles'][number],
			quantity: r.quantity,
			facts: {
				types: fact?.types ?? null,
				keywords: fact?.keywords ?? null,
				oracleId: fact?.canonicalIdentity.kind === 'Known' ? fact.raw_oracle_id : null,
				roots: Object.fromEntries(
					Object.entries(fact?.roots ?? {}).map(([k, v]) => [k, v ?? undefined])
				)
			}
		};
	});
	const first = source;
	const next = categories.map((c) => {
		categoryCheckpoint(tx);
		if (c.suppressed || !c.automaticActive || c.decision?.state === 'Manual') return c;
		const definition = {
			id: c.versionId,
			roles: c.definition.roles,
			rule: c.definition.rule
		};
		const comboEvaluations = combos?.forDefinition(definition) ?? [];
		const evaluated = evaluateDeckRule(
			c.definition.rule as DeckRule,
			inputs.map((e) => ({
				...e,
				facts: {
					...e.facts,
					comboParticipants: Object.fromEntries(
						comboEvaluations.map((v) => [v.outcomeId, v.participants[e.entryId] ?? 'Unknown'])
					)
				}
			})),
			c.definition.roles,
			Object.fromEntries(comboEvaluations.map((v) => [v.outcomeId, v.truth]))
		);
		const evidence: WholeCategoryEvidence = {
			...(comboEvaluations.length ? { combo: combos!.evidence(definition) } : {}),
			definitionVersionId: c.versionId,
			rule: c.definition.rule,
			roles: c.definition.roles,
			compositionRevision,
			attemptedTruth: evaluated.truth,
			bounds: evaluated.evidence,
			catalogGenerationId: tokens.catalogGenerationId,
			oraclePublicationId: tokens.oraclePublicationId,
			sourceTime: first?.source_time ? new Date(first.source_time).toISOString() : null,
			payloadDigest: first?.payload_digest ?? null,
			parserVersion: first?.parser_version ?? null,
			transformVersions: [
				...new Set(
					[...facts.values()].flatMap((f) =>
						f.transform_version === null ? [] : [f.transform_version]
					)
				)
			].sort((a, b) => a - b)
		};
		const old = c.decision;
		const decision: WholeCategoryDecision = {
			versionId: c.versionId,
			state: evaluated.truth === 'Unknown' ? 'Pending' : 'Automatic',
			manual: null,
			truth: evaluated.truth === 'Unknown' ? (old?.truth ?? null) : evaluated.truth,
			attemptedTruth: evaluated.truth,
			revision: old?.revision ?? '0',
			evidence: evaluated.truth === 'Unknown' ? (old?.evidence ?? null) : evidence,
			previousEvaluation: evaluated.truth === 'Unknown' ? evidence : null
		};
		const after = { ...c, decision };
		if (mutationFingerprint(wholeSemantics(c)) !== mutationFingerprint(wholeSemantics(after)))
			decision.revision = (BigInt(old?.revision ?? '0') + 1n).toString();
		return after;
	});
	return {
		categories: next,
		sources: tokens,
		factDefinitions,
		changed:
			mutationFingerprint(categories.map(wholeSemantics)) !==
			mutationFingerprint(next.map(wholeSemantics))
	};
}
export async function evaluateWholeDeck(
	tx: Transaction,
	deckId: string,
	compositionRevision: string
) {
	const categories = await readWholeCategories(tx, deckId),
		result = await evaluateWholeCategories(tx, deckId, compositionRevision, categories);
	if (result.changed) {
		await storeWholeCategories(tx, deckId, result.categories);
		await tx.execute(
			sql`UPDATE deck_category_bundles SET decision_revision=decision_revision+1 WHERE deck_id=${deckId}::uuid`
		);
		const owner = (await tx.execute(sql`SELECT account_id FROM decks WHERE id=${deckId}::uuid`))
			.rows[0];
		await advanceDeckLibraryRevision(tx, String(owner.account_id));
		await publishCategoryChange(tx, String(owner.account_id));
	}
	return { changed: result.changed };
}

export function createWholeCategories(
	db: Database,
	auth: Pick<ReturnType<typeof createLocalAuth>, 'requireActor' | 'requireActorForWrite'>
): WholeCategoriesApplication {
	async function mutate(
		actor: AuthUser,
		value: Record<string, unknown>,
		kind: 'manual' | 'rename' | 'remove'
	): Promise<WholeCategoryAcknowledgement> {
		const deckId = categoryUuid(value.deckId),
			versionId = categoryUuid(value.versionId),
			requestId = categoryUuid(value.requestId),
			expected = categoryRevision(value.expectedDecisionRevision);
		const name = kind === 'rename' ? categoryName(value.name) : null;
		if (kind === 'manual' && value.manual !== 'Include' && value.manual !== 'Exclude')
			throw new ValidationError('Select Include or Exclude');
		const hash = mutationFingerprint({
			kind: 'category.whole.' + kind,
			deckId,
			versionId,
			expected,
			name,
			manual: kind === 'manual' ? value.manual : null
		});
		return categoryTransaction(db, async (tx) => {
			const { accountId } = await auth.requireActor(actor, tx);
			await tx.execute(
				sql`SELECT account_id FROM user_profiles WHERE account_id=${accountId} FOR UPDATE`
			);
			await auth.requireActorForWrite(actor, tx);
			const replay = await categoryReceipt(tx, accountId, requestId, hash);
			if (replay) return replay as WholeCategoryAcknowledgement;
			await lockOwnedCategoryDeck(tx, accountId, deckId);
			const bundle = (
				await tx.execute(
					sql`SELECT decision_revision::text FROM deck_category_bundles WHERE deck_id=${deckId}::uuid FOR UPDATE`
				)
			).rows[0];
			if (!bundle) throw new CategoryNotFound();
			if (String(bundle.decision_revision) !== expected) throw new LibraryConflict();
			const categories = await readWholeCategories(tx, deckId),
				c = categories.find((c) => c.versionId === versionId);
			if (!c) throw new CategoryNotFound();
			const original = mutationFingerprint(wholeSemantics(c));
			if (kind === 'rename') {
				if (
					categories.some(
						(other) =>
							other.originId !== c.originId &&
							!other.suppressed &&
							other.name.normalize('NFC').toLocaleLowerCase('en') === name!.toLocaleLowerCase('en')
					)
				)
					throw new ValidationError('A local category already uses this name');
				c.name = name!;
			} else if (kind === 'remove') {
				for (const other of categories.filter((other) => other.originId === c.originId))
					other.suppressed = true;
			} else {
				const old = c.decision;
				c.decision = {
					versionId,
					state: 'Manual',
					manual: value.manual as 'Include' | 'Exclude',
					truth: old?.truth ?? null,
					attemptedTruth: old?.attemptedTruth ?? null,
					revision: old?.revision ?? '0',
					evidence: null,
					previousEvaluation: old?.evidence ?? old?.previousEvaluation ?? null
				};
			}
			const changed = original !== mutationFingerprint(wholeSemantics(c));
			if (changed) {
				if (c.decision) c.decision.revision = (BigInt(c.decision.revision) + 1n).toString();
				await storeWholeCategories(tx, deckId, categories);
				await tx.execute(
					sql`UPDATE deck_category_bundles SET decision_revision=decision_revision+1 WHERE deck_id=${deckId}::uuid`
				);
				await touchWholeDeckJob(tx, deckId);
				await advanceDeckLibraryRevision(tx, accountId);
				await publishCategoryChange(tx, accountId);
			}
			const ack: WholeCategoryAcknowledgement = {
				requestId,
				deckId,
				scope: 'deck',
				decisionRevision: changed ? (BigInt(expected) + 1n).toString() : expected,
				versionIds: changed ? [versionId] : [],
				changed
			};
			await storeCategoryReceipt(tx, accountId, requestId, hash, ack);
			return ack;
		});
	}
	return {
		getDeckWholeCategories: (actor, id) =>
			categoryTransaction(
				db,
				async (tx) => {
					const deckId = categoryUuid(id),
						{ accountId } = await auth.requireActor(actor, tx);
					const owner = await tx.execute(
						sql`SELECT id FROM decks WHERE id=${deckId}::uuid AND account_id=${accountId}`
					);
					if (!owner.rows.length) throw new CategoryNotFound();
					const bundle = (
						await tx.execute(
							sql`SELECT decision_revision::text FROM deck_category_bundles WHERE deck_id=${deckId}::uuid`
						)
					).rows[0];
					return {
						deckId,
						initialized: !!bundle,
						decisionRevision: String(bundle?.decision_revision ?? '0'),
						categories: await readWholeCategories(tx, deckId)
					} satisfies DeckWholeCategories;
				},
				{ isolationLevel: 'repeatable read', accessMode: 'read only' }
			),
		setWholeCategory: (actor, v) =>
			mutate(
				actor,
				strictCategoryFields(v, [
					'requestId',
					'deckId',
					'versionId',
					'manual',
					'expectedDecisionRevision'
				]),
				'manual'
			),
		renameWholeCategory: (actor, v) =>
			mutate(
				actor,
				strictCategoryFields(v, [
					'requestId',
					'deckId',
					'versionId',
					'name',
					'expectedDecisionRevision'
				]),
				'rename'
			),
		removeWholeCategory: (actor, v) =>
			mutate(
				actor,
				strictCategoryFields(v, ['requestId', 'deckId', 'versionId', 'expectedDecisionRevision']),
				'remove'
			)
	};
}
