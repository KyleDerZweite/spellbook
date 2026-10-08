import { sql } from 'drizzle-orm';
import type { Transaction } from '../db/client.ts';
import type {
	CategoryChangeIntent,
	CategoryDifference
} from '@spellbook/contracts/category-library.ts';
import type { WholeCategory } from '@spellbook/contracts/whole-categories.ts';
import { readLibrary } from './library.ts';
import { lockOwnedCategoryDeck } from './changes.ts';
import { readWholeCategories, evaluateWholeCategories, wholeSemantics } from './whole.ts';
import { mutationFingerprint } from '../decks/request-fingerprint.ts';
import { ValidationError } from '../mtg/validation.ts';
import { categoryJson } from './work.ts';

export async function buildWholePlan(
	tx: Transaction,
	accountId: string,
	intent: CategoryChangeIntent
) {
	const compositionRevision = await lockOwnedCategoryDeck(tx, accountId, intent.deckId);
	const bundle = (
		await tx.execute(
			sql`SELECT decision_revision::text FROM deck_category_bundles WHERE deck_id=${intent.deckId}::uuid FOR UPDATE`
		)
	).rows[0];
	if (!bundle) throw new ValidationError('Initialize deck categories before Review or Reset');
	const old = await readWholeCategories(tx, intent.deckId),
		suppressed = [...new Set(old.filter((c) => c.suppressed).map((c) => c.originId))].sort();
	if (intent.restoreOriginIds.some((id) => !suppressed.includes(id)))
		throw new ValidationError('Only suppressed origins may be explicitly restored');
	const remaining = suppressed.filter((id) => !intent.restoreOriginIds.includes(id));
	const library = await readLibrary(tx, accountId, true),
		byVersion = new Map(old.map((c) => [c.versionId, c]));
	const proposed: WholeCategory[] = library.definitions
		.filter((d) => !d.archived && d.current.scope === 'deck' && !remaining.includes(d.originId))
		.map((d) => {
			const previous = byVersion.get(d.current.id);
			return {
				versionId: d.current.id,
				originId: d.originId,
				definition: d.current,
				name: previous?.name ?? d.current.name,
				displayOrder: d.current.displayOrder,
				suppressed: false,
				automaticActive: true,
				decision: intent.mode === 'Review' ? (previous?.decision ?? null) : null
			};
		});
	const currentIds = new Set(proposed.map((c) => c.versionId));
	for (const previous of old) {
		if (currentIds.has(previous.versionId)) continue;
		if (previous.suppressed && remaining.includes(previous.originId)) proposed.push(previous);
		else if (intent.mode === 'Review' && previous.decision?.state === 'Manual')
			proposed.push({ ...previous, automaticActive: false, suppressed: false });
	}
	const names = new Map<string, string>(),
		differences: CategoryDifference[] = [];
	let blocked = false;
	for (const c of proposed) {
		if (!c.suppressed) {
			const name = c.name.normalize('NFC').toLocaleLowerCase('en'),
				other = names.get(name);
			if (other && other !== c.originId) {
				blocked = true;
				differences.push({
					kind: 'NameConflict',
					entityId: c.versionId,
					message: `Rename the local category ${c.name} before adopting a distinct origin with this name.`,
					after: c
				});
			}
			names.set(name, c.originId);
		}
		if (!byVersion.has(c.versionId))
			differences.push({
				kind: 'DefinitionAdded',
				entityId: c.versionId,
				message: `Adopt ${c.name}, version ${c.definition.version}.`,
				before: null,
				after: c
			});
		if (!c.automaticActive && c.decision?.state === 'Manual')
			differences.push({
				kind: 'RetainedManual',
				entityId: c.versionId,
				message: `Retain the historical Manual meaning of ${c.name}.`,
				before: byVersion.get(c.versionId),
				after: c
			});
	}
	for (const c of old)
		if (!proposed.some((p) => p.versionId === c.versionId))
			differences.push({
				kind: 'DefinitionRemoved',
				entityId: c.versionId,
				message: `Remove version ${c.definition.version} of ${c.name}.`,
				before: c,
				after: null
			});
	const evaluated = await evaluateWholeCategories(tx, intent.deckId, compositionRevision, proposed);
	for (const c of evaluated.categories) {
		const before = byVersion.get(c.versionId);
		const preserved = c.decision?.state === 'Manual';
		if (
			preserved ||
			mutationFingerprint(before ? wholeSemantics(before) : null) !==
				mutationFingerprint(wholeSemantics(c))
		)
			differences.push({
				kind: preserved ? 'DeckPreserved' : 'DeckChanged',
				entityId: c.versionId,
				message: preserved
					? 'Preserve this version-bound Manual choice.'
					: c.decision?.state === 'Pending'
						? 'Keep the retained valid result visibly Pending.'
						: 'Apply this reviewed whole-deck result.',
				before: before ?? null,
				after: c
			});
	}
	for (const origin of intent.restoreOriginIds)
		differences.push({
			kind: 'OriginRestored',
			entityId: origin,
			message: 'Restore this explicitly selected whole-deck origin.'
		});
	categoryJson(tx, evaluated.categories);
	return {
		definitions: evaluated.factDefinitions,
		decisions: [],
		wholeCategories: evaluated.categories,
		suppressed: remaining,
		libraryRevision: library.revision,
		decisionRevision: String(bundle.decision_revision),
		compositionRevision,
		sources: evaluated.sources,
		blocked,
		changed:
			mutationFingerprint(old.map(wholeSemantics)) !==
			mutationFingerprint(evaluated.categories.map(wholeSemantics)),
		differences
	};
}
