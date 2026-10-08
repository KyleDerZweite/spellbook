import { publishCategoryChange } from './notification.ts';
import { categoryTransaction } from './work.ts';
import { sql } from 'drizzle-orm';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import type { CategoryAcknowledgement, EntryDefinition } from '@spellbook/contracts/categories.ts';
import type { Database, Transaction } from '../db/client.ts';
import type { createLocalAuth } from '../auth/local.ts';
import { mutationFingerprint } from '../decks/request-fingerprint.ts';
import { ValidationError } from '../mtg/validation.ts';
import { CategoryNotFound } from './errors.ts';
import { adoptedDefinitions } from './persistence.ts';
import { starterDefinitions } from './rules.ts';
import {
	categoryName,
	categoryReceipt,
	categoryRevision,
	categoryUuid,
	LibraryConflict,
	storeCategoryReceipt,
	strictCategoryFields
} from './library.ts';
export function originIdentity(definition: EntryDefinition) {
	return (
		definition.originId ??
		starterDefinitions.find((d) => d.origin === definition.origin)?.id ??
		definition.id
	);
}
export async function lockOwnedCategoryDeck(tx: Transaction, accountId: string, deckId: string) {
	const rows = await tx.execute(
		sql`SELECT id,composition_revision::text FROM decks WHERE id=${deckId}::uuid AND account_id=${accountId} AND game='mtg' FOR UPDATE`
	);
	if (!rows.rows.length) throw new CategoryNotFound();
	return String(rows.rows[0].composition_revision);
}
export function createCategoryChanges(
	db: Database,
	auth: Pick<ReturnType<typeof createLocalAuth>, 'requireActor' | 'requireActorForWrite'>
) {
	async function mutate(
		actor: AuthUser,
		raw: Record<string, unknown>,
		remove: boolean
	): Promise<CategoryAcknowledgement> {
		const deckId = categoryUuid(raw.deckId),
			requestId = categoryUuid(raw.requestId),
			categoryId = categoryUuid(raw.categoryId),
			expected = categoryRevision(raw.expectedDecisionRevision);
		const name = remove ? null : categoryName(raw.name);
		const replacement =
			remove && raw.replacementCategoryId !== null ? categoryUuid(raw.replacementCategoryId) : null;
		if (remove && replacement === categoryId)
			throw new ValidationError('Choose another replacement category or Uncategorized');
		const hash = mutationFingerprint({
			kind: remove ? 'category.local.remove' : 'category.local.rename',
			deckId,
			categoryId,
			expected,
			name,
			replacement
		});
		return categoryTransaction(db, async (tx) => {
			const { accountId } = await auth.requireActor(actor, tx);
			await tx.execute(
				sql`SELECT account_id FROM user_profiles WHERE account_id=${accountId} FOR UPDATE`
			);
			await auth.requireActorForWrite(actor, tx);
			const replay = await categoryReceipt(tx, accountId, requestId, hash);
			if (replay) return replay as CategoryAcknowledgement;
			await lockOwnedCategoryDeck(tx, accountId, deckId);
			const definitions = await adoptedDefinitions(tx, deckId);
			const selected = definitions?.find((d) => d.id === categoryId),
				target = definitions?.find((d) => d.id === replacement);
			if (!definitions || !selected || (replacement && !target)) throw new CategoryNotFound();
			const row = (
				await tx.execute(
					sql`SELECT decision_revision::text,suppressed_origins FROM deck_category_bundles WHERE deck_id=${deckId}::uuid`
				)
			).rows[0];
			if (String(row.decision_revision) !== expected) throw new LibraryConflict();
			let entryIds: string[] = [],
				changed = false;
			if (remove) {
				const snapshot = target?.definitionSnapshot ?? target ?? null;
				const moved = await tx.execute(
					sql`UPDATE deck_entry_category_decisions SET category_id=${replacement}::uuid,state='Manual',revision=revision+1,previous_evaluation=COALESCE(evidence,previous_evaluation),evidence=NULL,definition_snapshot=${snapshot ? JSON.stringify(snapshot) : null}::jsonb WHERE deck_id=${deckId}::uuid AND category_id=${categoryId}::uuid RETURNING entry_id::text`
				);
				entryIds = moved.rows.map((r) => String(r.entry_id));
				const suppressed = [
					...new Set([...(row.suppressed_origins as string[]), originIdentity(selected)])
				].sort();
				await tx.execute(
					sql`UPDATE deck_category_bundles SET definitions=${JSON.stringify(definitions.filter((d) => d.id !== categoryId))}::jsonb,suppressed_origins=${'{' + suppressed.join(',') + '}'}::uuid[],decision_revision=decision_revision+1 WHERE deck_id=${deckId}::uuid`
				);
				changed = true;
			} else if (selected.name !== name) {
				if (
					definitions.some(
						(d) =>
							d.id !== categoryId &&
							d.name.normalize('NFC').toLocaleLowerCase('en') === name!.toLocaleLowerCase('en')
					)
				)
					throw new ValidationError('A local category already uses this name');
				await tx.execute(
					sql`UPDATE deck_category_bundles SET definitions=${JSON.stringify(definitions.map((d) => (d.id === categoryId ? { ...d, name } : d)))}::jsonb,decision_revision=decision_revision+1 WHERE deck_id=${deckId}::uuid`
				);
				changed = true;
			}
			const ack = {
				requestId,
				deckId,
				decisionRevision: changed ? (BigInt(expected) + 1n).toString() : expected,
				entryIds
			};
			await storeCategoryReceipt(tx, accountId, requestId, hash, ack);
			if (changed) await publishCategoryChange(tx, accountId);
			return ack;
		});
	}
	return {
		renameLocalCategory: (
			actor: AuthUser,
			input: {
				requestId: string;
				deckId: string;
				categoryId: string;
				name: string;
				expectedDecisionRevision: string;
			}
		) =>
			mutate(
				actor,
				strictCategoryFields(input, [
					'requestId',
					'deckId',
					'categoryId',
					'name',
					'expectedDecisionRevision'
				]),
				false
			),
		removeLocalCategory: (
			actor: AuthUser,
			input: {
				requestId: string;
				deckId: string;
				categoryId: string;
				replacementCategoryId: string | null;
				expectedDecisionRevision: string;
			}
		) =>
			mutate(
				actor,
				strictCategoryFields(input, [
					'requestId',
					'deckId',
					'categoryId',
					'replacementCategoryId',
					'expectedDecisionRevision'
				]),
				true
			)
	};
}
