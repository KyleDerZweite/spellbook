import { sql } from 'drizzle-orm';
import type { Transaction } from '../db/client.ts';
import type { CategoryMergeInput, CategoryMergePreview } from '@spellbook/contracts/categories.ts';
import { mutationFingerprint } from '../decks/request-fingerprint.ts';
import { adoptedDefinitions, readDecisions, readEntryCategoryFacts } from './persistence.ts';
import { ValidationError } from '../mtg/validation.ts';
import { CategoryNotFound } from './errors.ts';
export class CategoryMergeConflict extends Error {
	readonly kind = 'CategoryMergeConflict';
	constructor(readonly preview: CategoryMergePreview) {
		super('Review the destination category and resulting quantity before merging.');
	}
}
export async function readCategoryMergePreview(
	tx: Transaction,
	input: CategoryMergeInput
): Promise<CategoryMergePreview> {
	const source = await tx.execute(
		sql`SELECT id FROM deck_cards WHERE deck_id=${input.deckId}::uuid AND id=${input.entryId}::uuid`
	);
	if (!source.rows.length) throw new CategoryNotFound();
	const destination = await tx.execute(
		sql`SELECT id,quantity FROM deck_cards WHERE deck_id=${input.deckId}::uuid AND catalog_card_id=${input.catalogCardId} AND role=${input.role} AND id<>${input.entryId}::uuid`
	);
	const revisions = await tx.execute(
		sql`SELECT d.composition_revision::text,b.decision_revision::text FROM decks d LEFT JOIN deck_category_bundles b ON b.deck_id=d.id WHERE d.id=${input.deckId}::uuid`
	);
	const definitions = (await adoptedDefinitions(tx, input.deckId)) ?? [];
	const decisions = await readDecisions(tx, input.deckId);
	const sourceDecision = decisions.find((d) => d.entryId === input.entryId) ?? null;
	const destinationId = destination.rows[0]?.id as string | undefined;
	const destinationDecision = decisions.find((d) => d.entryId === destinationId) ?? null;
	const { tokens } = await readEntryCategoryFacts(tx, [input.catalogCardId], definitions);
	const resultingQuantity =
		input.quantity + (destination.rows.length ? Number(destination.rows[0].quantity) : 0);
	if (
		!Number.isSafeInteger(resultingQuantity) ||
		resultingQuantity < 1 ||
		resultingQuantity > 2147483647
	)
		throw new ValidationError('Merged quantity exceeds the entry quantity range');
	const meaning = (decision: typeof sourceDecision) =>
		decision
			? { categoryId: decision.categoryId, state: decision.state, evidence: decision.evidence }
			: null;
	const required =
		!!destinationId &&
		JSON.stringify(meaning(sourceDecision)) !== JSON.stringify(meaning(destinationDecision));
	const consequence = mutationFingerprint({
		input,
		compositionRevision: revisions.rows[0].composition_revision,
		decisionRevision: revisions.rows[0].decision_revision ?? '0',
		source: sourceDecision,
		destination: destinationDecision,
		resultingQuantity
	});
	return {
		required,
		token: JSON.stringify({ consequence, sources: tokens }),
		source: sourceDecision,
		destination: destinationDecision,
		destinationEntryId: destinationId ?? null,
		resultingQuantity,
		compositionRevision: String(revisions.rows[0].composition_revision),
		decisionRevision: String(revisions.rows[0].decision_revision ?? '0'),
		sourceTokens: tokens
	};
}
export async function requireCategoryMergePreview(
	tx: Transaction,
	input: CategoryMergeInput,
	token?: string
) {
	const current = await readCategoryMergePreview(tx, input);
	if (!current.required) return;
	let reviewed: unknown;
	try {
		reviewed = JSON.parse(token ?? '');
	} catch {
		throw new CategoryMergeConflict(current);
	}
	if (!reviewed || typeof reviewed !== 'object' || Array.isArray(reviewed))
		throw new CategoryMergeConflict(current);
	const saved = reviewed as { consequence?: unknown; sources?: unknown };
	const fresh = JSON.parse(current.token) as { consequence: string };
	// Existing decisions are immutable under public publication. A different source token
	// alone cannot change this consequence or permit reassignment.
	if (saved.consequence !== fresh.consequence || !saved.sources)
		throw new CategoryMergeConflict(current);
}
