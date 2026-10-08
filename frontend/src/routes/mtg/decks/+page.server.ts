import { error, fail, isHttpError, isRedirect, redirect } from '@sveltejs/kit';
import type { Action, Actions, PageServerLoad } from './$types';
import {
	createDeckRecord,
	deleteDeck,
	getDeckSnapshot,
	removeDeckCard,
	updateDeck,
	updateDeckCard
} from '#lib/server/data/decks.ts';
import {
	addCatalogCardToDeck,
	changeDeckPrinting,
	getDeckLegality,
	importIntoDeck
} from '#lib/server/mtg/deck-builder.ts';
import {
	application,
	CategoryNotFound,
	CategoryConflict,
	CategoryMergeConflict,
	LibraryConflict,
	CategoryPreviewExpired,
	CategoryPreviewCapacity,
	CategoryUnavailable
} from '#lib/server/composition.ts';
import { getPrintings } from '#lib/server/catalog/search.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
import { readCategoryForm } from '#lib/server/categories/forms.ts';
import { readQueryInteger } from '#lib/server/http/request.ts';
import { ValidationError } from '#lib/server/mtg/validation.ts';
import { DescriptionConflictError, DeckNotFoundError } from '#lib/server/data/decks.ts';
import { RequestConflictError } from '#lib/server/data/request-fingerprint.ts';
import type { CardDocument } from '#lib/search/types.ts';
import type { LegalityWarning } from '#lib/server/mtg/legality.ts';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(303, '/auth/login?returnTo=/mtg/decks');
	const selectedDeckId = url.searchParams.get('deck') ?? null;
	const recovery =
		locals.categoryPageRecovery?.accountId === locals.user.accountId &&
		locals.categoryPageRecovery.deckId === selectedDeckId
			? locals.categoryPageRecovery
			: undefined;
	let categoryReadError = '';
	let snapshot;
	try {
		snapshot = await getDeckSnapshot(locals.user, 'mtg', selectedDeckId);
	} catch (cause) {
		if (cause instanceof DeckNotFoundError) throw error(404, 'Deck not found');
		if (
			recovery &&
			!(cause && typeof cause === 'object' && 'kind' in cause && cause.kind === 'Unauthenticated')
		) {
			snapshot = recovery.snapshot;
			categoryReadError =
				'Current Deck evidence is unavailable. Earlier controls are retained and disabled until refreshed.';
		} else throw cause;
	}
	const selectedDeck = snapshot.decks.find((deck) => deck.id === selectedDeckId);
	if (selectedDeckId && !selectedDeck) throw error(404, 'Deck not found');
	const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
	const oracleId = url.searchParams.get('printing') ?? '';
	let catalogCards: CardDocument[] = [];
	let catalogError = '';
	let warnings: LegalityWarning[] = [];
	let legalityError = '';
	const deckDocuments = new Map<string, CardDocument>();
	await Promise.all([
		(async () => {
			if (!query && !oracleId) return;
			try {
				if (oracleId && !/^[0-9a-f-]{36}$/i.test(oracleId)) {
					catalogError = 'Select a card to view its printings.';
					return;
				}
				const result = oracleId
					? await getPrintings(oracleId)
					: await application.decks.search(locals.user!, query);
				catalogCards = result.hits;
				if ('ownedByCanonical' in result) {
					Object.assign(snapshot.ownedByCanonical, result.ownedByCanonical);
				}
				if (oracleId && catalogCards.length) {
					const owned = await application.decks.ownership(locals.user!, [
						catalogCards[0].oracle_id
					]);
					snapshot.ownedPrintings.push(
						...owned.filter(
							(card) =>
								!snapshot.ownedPrintings.some(
									(existing) => existing.catalogCardId === card.catalogCardId
								)
						)
					);
					for (const card of owned)
						snapshot.ownedByCanonical[card.canonicalCardId] = owned
							.filter((entry) => entry.canonicalCardId === card.canonicalCardId)
							.reduce((sum, entry) => sum + entry.quantity, 0);
				}
			} catch {
				catalogError = 'The card catalog is unavailable. You can still edit your deck.';
			}
		})(),
		(async () => {
			if (!selectedDeck) return;
			try {
				const legality = await getDeckLegality(locals.user!, selectedDeck.id);
				warnings = legality.warnings;
				for (const [id, document] of Object.entries(legality.deckDocuments))
					deckDocuments.set(id, document);
			} catch {
				legalityError =
					'Card legality could not be checked. Try again when the catalog is available.';
			}
		})()
	]);
	let categoryPreview = null,
		entryCategories = null;
	try {
		if (selectedDeck)
			entryCategories = await application.categories.getDeckEntryCategories(
				locals.user,
				selectedDeck.id
			);
		if (selectedDeck && url.searchParams.has('preview')) {
			categoryPreview = await application.categories.getCategoryPreview(locals.user, {
				previewId: url.searchParams.get('preview')!,
				offset: readQueryInteger(url.searchParams.get('previewOffset'), 'previewOffset', 0)
			});
			if (categoryPreview.deckId !== selectedDeck.id)
				throw error(404, 'Preview not found for this Deck');
		}
	} catch (cause) {
		if (
			recovery &&
			!isHttpError(cause) &&
			!(cause instanceof ValidationError) &&
			!(cause instanceof CategoryNotFound) &&
			!(cause && typeof cause === 'object' && 'kind' in cause && cause.kind === 'Unauthenticated')
		) {
			entryCategories = recovery.categories;
			categoryPreview = recovery.preview ?? null;
			categoryReadError =
				'Current category evidence is unavailable. Your receipt and earlier controls are retained; refresh before another change.';
		} else badRequestIfValidation(cause);
	}
	return {
		...snapshot,
		categoryReadError,
		categoryPreview,
		localCategoryId: url.searchParams.get('localCategory'),
		entryCategories,
		grouping: url.searchParams.get('group') === 'category' ? 'category' : 'type',
		flow: ['create', 'edit', 'import', 'delete', 'search'].includes(
			url.searchParams.get('flow') ?? ''
		)
			? url.searchParams.get('flow')!
			: '',
		requestId: crypto.randomUUID(),
		selectedDeckId,
		query,
		oracleId,
		catalogCards,
		catalogError,
		warnings,
		legalityError,
		deckDocuments: Object.fromEntries(deckDocuments)
	};
};

function guarded(action: Action): Action {
	return async (event) => {
		if (!event.locals.user) throw redirect(303, '/auth/login?returnTo=/mtg/decks');
		try {
			return await action(event);
		} catch (cause) {
			if (isRedirect(cause) || isHttpError(cause)) throw cause;
			if (cause && typeof cause === 'object' && 'kind' in cause && cause.kind === 'Unauthenticated')
				throw redirect(303, '/auth/login?returnTo=/mtg/decks');
			if (cause instanceof LibraryConflict || cause instanceof CategoryPreviewExpired)
				return fail(409, { message: cause.message });
			if (cause instanceof CategoryPreviewCapacity || cause instanceof CategoryUnavailable)
				return fail(503, { message: cause.message });
			if (cause instanceof CategoryNotFound) return fail(404, { message: cause.message });
			if (cause instanceof CategoryConflict)
				return fail(409, { message: cause.message, categoryConflict: cause.latest });
			if (cause instanceof CategoryMergeConflict)
				return fail(409, { message: cause.message, categoryMerge: cause.preview });
			if (cause instanceof DescriptionConflictError)
				return fail(409, { message: cause.message, conflict: cause.latest });
			if (cause instanceof RequestConflictError) return fail(409, { message: cause.message });
			if (cause instanceof DeckNotFoundError) return fail(404, { message: cause.message });
			if (cause instanceof ValidationError) return fail(400, { message: cause.message });
			console.error('Deck action failed', cause);
			return fail(503, { message: 'The deck could not be saved. Try again.' });
		}
	};
}

async function rememberCategoryPage(event: Parameters<Action>[0], deckId: string) {
	// Native action rendering may read again after the command has already committed.
	if (event.request.headers.get('x-sveltekit-action') === 'true' || !event.locals.user) return;
	try {
		const snapshot = await getDeckSnapshot(event.locals.user, 'mtg', deckId);
		const categories = await application.categories.getDeckEntryCategories(
			event.locals.user,
			deckId
		);
		event.locals.categoryPageRecovery = {
			accountId: event.locals.user.accountId,
			deckId,
			snapshot,
			categories
		};
	} catch {
		/* Optional earlier evidence cannot veto a later authoritative command. */
	}
}

function field(form: FormData, name: string): string {
	return String(form.get(name) ?? '').trim();
}

function removalIntent(form: FormData, prefix = '') {
	const read = (name: string) =>
		field(form, prefix ? prefix + name[0].toUpperCase() + name.slice(1) : name);
	return {
		deckId: read('deckId'),
		categoryId: read('categoryId'),
		replacementCategoryId: read('replacementCategoryId') || null,
		expectedDecisionRevision: read('expectedDecisionRevision'),
		requestId: read('requestId')
	};
}

export const actions = {
	renameCategory: async (event) => {
		let renameDraft:
			| {
					deckId: string;
					categoryId: string;
					name: string;
					expectedDecisionRevision: string;
					requestId: string;
			  }
			| undefined;
		const result = await guarded(async ({ request, locals }) => {
			const form = await readCategoryForm(request);
			await rememberCategoryPage(event, field(form, 'deckId'));
			renameDraft = {
				deckId: field(form, 'deckId'),
				categoryId: field(form, 'categoryId'),
				name: String(form.get('name') ?? ''),
				expectedDecisionRevision: field(form, 'expectedDecisionRevision'),
				requestId: field(form, 'requestId')
			};
			const acknowledgement = await application.categories.renameLocalCategory(
				locals.user!,
				renameDraft
			);
			return {
				success: true,
				message: 'Local label saved. Reusable meaning and assignments are unchanged.',
				acknowledgement
			};
		})(event);
		return result && 'status' in result && 'data' in result
			? fail(result.status, { ...result.data, renameDraft })
			: result && typeof result === 'object'
				? { ...result, renameDraft }
				: result;
	},
	removeCategory: async (event) => {
		let removalDraft: ReturnType<typeof removalIntent> | undefined;
		let removalRetry: ReturnType<typeof removalIntent> | undefined;
		const result = await guarded(async ({ request, locals }) => {
			const form = await readCategoryForm(request);
			removalDraft = removalIntent(form);
			if (field(form, 'retryRequestId')) removalRetry = removalIntent(form, 'retry');
			await rememberCategoryPage(event, removalDraft.deckId);
			if (field(form, 'confirmRemoval') !== 'yes')
				throw new ValidationError('Review and confirm the local replacement.');
			const acknowledgement = await application.categories.removeLocalCategory(
				locals.user!,
				removalDraft
			);
			if (removalRetry?.requestId === acknowledgement.requestId) removalRetry = undefined;
			return {
				success: true,
				message: 'Local category removed and replacement saved.',
				acknowledgement
			};
		})(event);
		return result && 'status' in result && 'data' in result
			? fail(result.status, {
					...result.data,
					removalDraft,
					removalRetry: removalRetry ?? (result.status >= 500 ? removalDraft : undefined)
				})
			: result && typeof result === 'object'
				? { ...result, removalDraft, removalRetry }
				: result;
	},
	rebaseRemoval: async (event) => {
		let removalDraft: ReturnType<typeof removalIntent> | undefined;
		let removalRetry: ReturnType<typeof removalIntent> | undefined;
		const result = await guarded(async ({ request, locals }) => {
			const form = await readCategoryForm(request);
			removalDraft = removalIntent(form);
			if (field(form, 'retryRequestId')) removalRetry = removalIntent(form, 'retry');
			await rememberCategoryPage(event, removalDraft.deckId);
			const current = await application.categories.getDeckEntryCategories(
				locals.user!,
				removalDraft.deckId
			);
			removalDraft = {
				...removalDraft,
				expectedDecisionRevision: current.decisionRevision,
				requestId: crypto.randomUUID()
			};
			return { message: 'Removal draft rebased. Review the replacement and confirm again.' };
		})(event);
		return result && 'status' in result && 'data' in result
			? fail(result.status, { ...result.data, removalDraft, removalRetry })
			: result && typeof result === 'object'
				? { ...result, removalDraft, removalRetry }
				: result;
	},
	previewCategories: guarded(async ({ request, locals }) => {
		const form = await readCategoryForm(request);
		const categoryPreview = await application.categories.previewCategoryChange(locals.user!, {
			requestId: field(form, 'requestId'),
			deckId: field(form, 'deckId'),
			scope: field(form, 'scope') as 'entry' | 'deck',
			mode: field(form, 'mode') as 'Review' | 'Reset',
			restoreOriginIds: form.getAll('restoreOriginIds').map(String)
		});
		return {
			success: true,
			message: 'Review the complete preview before saving.',
			categoryPreview
		};
	}),
	commitCategories: guarded(async (event) => {
		const { request, locals } = event;
		const form = await readCategoryForm(request);
		if (field(form, 'confirmPreview') !== 'yes')
			throw new ValidationError('Confirm the reviewed complete preview.');
		await rememberCategoryPage(event, field(form, 'deckId'));
		const ownedPreview = await application.categories.getCategoryPreview(locals.user!, {
			previewId: field(form, 'previewId')
		});
		if (ownedPreview.deckId !== field(form, 'deckId'))
			throw new ValidationError('The preview belongs to another Deck.');
		const acknowledgement = await application.categories.commitCategoryChange(locals.user!, {
			requestId: field(form, 'requestId'),
			previewId: field(form, 'previewId')
		});
		// The committed receipt is authoritative even when optional current evidence is unavailable.
		const categoryPreview = { ...ownedPreview, status: 'Committed' as const, acknowledgement };
		if (locals.categoryPageRecovery) locals.categoryPageRecovery.preview = categoryPreview;
		return {
			success: true,
			message: 'Complete reviewed category change saved.',
			acknowledgement,
			categoryPreview
		};
	}),
	initializeCategories: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		const acknowledgement = await application.categories.initializeDeckCategories(locals.user!, {
			deckId: field(form, 'deckId'),
			requestId: field(form, 'requestId')
		});
		return { success: true, message: 'Deck categories initialized.', acknowledgement };
	}),

	setCategory: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		const categoryDraft = {
			deckId: field(form, 'deckId'),
			entryId: field(form, 'entryId'),
			categoryId: field(form, 'categoryId') || null,
			expectedDecisionRevision: field(
				form,
				form.has('rebaseCategory') ? 'rebaseCategory' : 'expectedDecisionRevision'
			),
			requestId: field(form, 'requestId')
		};
		try {
			const acknowledgement = await application.categories.setEntryCategory(
				locals.user!,
				categoryDraft
			);
			return { success: true, message: 'Category saved.', acknowledgement };
		} catch (cause) {
			if (cause instanceof CategoryConflict)
				return fail(409, { message: cause.message, categoryConflict: cause.latest, categoryDraft });
			if (cause instanceof LibraryConflict || cause instanceof CategoryPreviewExpired)
				return fail(409, { message: cause.message });
			if (cause instanceof CategoryPreviewCapacity || cause instanceof CategoryUnavailable)
				return fail(503, { message: cause.message });
			if (cause instanceof CategoryNotFound)
				return fail(404, { message: cause.message, categoryDraft });
			if (cause instanceof RequestConflictError)
				return fail(409, { message: cause.message, categoryDraft });
			if (cause instanceof ValidationError)
				return fail(400, { message: cause.message, categoryDraft });
			if (cause && typeof cause === 'object' && 'kind' in cause && cause.kind === 'Unauthenticated')
				throw cause;
			return fail(503, { message: 'The category could not be saved. Try again.', categoryDraft });
		}
	}),
	createDeck: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		const createDraft = {
			name: String(form.get('name') ?? ''),
			description: String(form.get('description') ?? ''),
			format: String(form.get('format') ?? '')
		};
		let deck;
		try {
			deck = await createDeckRecord(locals.user!, {
				game: 'mtg',
				name: field(form, 'name'),
				description: field(form, 'description'),
				format: field(form, 'format')
			});
		} catch (cause) {
			if (cause instanceof ValidationError)
				return fail(400, { message: cause.message, createDraft });
			throw cause;
		}
		throw redirect(303, `/mtg/decks?deck=${encodeURIComponent(deck.id)}`);
	}),
	updateDeck: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		const patch: import('@spellbook/contracts/decks.ts').DeckPatch = {
			deckId: field(form, 'deckId')
		};
		if (!form.has('nameBase') || field(form, 'name') !== field(form, 'nameBase'))
			patch.name = field(form, 'name');
		if (!form.has('formatBase') || field(form, 'format') !== field(form, 'formatBase'))
			patch.format = field(form, 'format');
		if (
			!form.has('descriptionBase') ||
			field(form, 'description') !== field(form, 'descriptionBase') ||
			form.has('rebaseDescription')
		) {
			patch.description = field(form, 'description');
			patch.descriptionRevision = field(
				form,
				form.has('rebaseDescription') ? 'rebaseDescription' : 'descriptionRevision'
			);
		}
		// Keep the submitted text and original bases for a native failed POST as well as enhancement.
		const detailsDraft = {
			deckId: patch.deckId,
			name: String(form.get('name') ?? ''),
			format: String(form.get('format') ?? ''),
			description: String(form.get('description') ?? ''),
			descriptionRevision: patch.descriptionRevision ?? field(form, 'descriptionRevision'),
			nameBase: form.has('nameBase') ? String(form.get('nameBase')) : undefined,
			formatBase: form.has('formatBase') ? String(form.get('formatBase')) : undefined,
			descriptionBase: form.has('descriptionBase') ? String(form.get('descriptionBase')) : undefined
		};
		try {
			const deck = await updateDeck(locals.user!, patch);
			if (!deck) return fail(404, { message: 'Deck not found.' });
			return { success: true, message: 'Deck details saved.', savedDetails: deck };
		} catch (cause) {
			if (cause instanceof DescriptionConflictError)
				return fail(409, { message: cause.message, conflict: cause.latest, detailsDraft });
			if (
				cause instanceof ValidationError &&
				!(cause instanceof DeckNotFoundError) &&
				!(cause instanceof RequestConflictError)
			)
				return fail(400, { message: cause.message, detailsDraft });
			throw cause;
		}
	}),
	deleteDeck: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		await deleteDeck(locals.user!, field(form, 'deckId'));
		throw redirect(303, '/mtg/decks');
	}),
	addCard: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		await addCatalogCardToDeck(locals.user!, {
			deckId: field(form, 'deckId'),
			catalogCardId: field(form, 'catalogCardId'),
			quantity: Number(form.get('quantity') ?? 1),
			role: field(form, 'role'),
			requestId: field(form, 'requestId')
		});
		return { success: true, message: 'Card added to deck.' };
	}),

	changePrinting: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		const mergeDraft = {
			entryId: field(form, 'entryId'),
			catalogCardId: field(form, 'catalogCardId'),
			quantity: Number(form.get('quantity')),
			role: field(form, 'role'),
			requestId: field(form, 'requestId')
		};
		let acknowledgement;
		try {
			acknowledgement = await changeDeckPrinting(locals.user!, {
				...mergeDraft,
				categoryPreview: form.has('categoryPreview') ? field(form, 'categoryPreview') : undefined
			});
		} catch (cause) {
			if (cause instanceof CategoryMergeConflict)
				return fail(409, {
					message: cause.message,
					categoryMerge: cause.preview,
					mergeDraft,
					mergeAction: 'changePrinting'
				});
			throw cause;
		}
		return { success: true, message: 'Card saved.', acknowledgement };
	}),

	updateCard: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		const mergeDraft = {
			entryId: field(form, 'entryId'),
			quantity: Number(form.get('quantity')),
			role: field(form, 'role'),
			requestId: field(form, 'requestId'),
			delta: form.has('delta') ? Number(form.get('delta')) : undefined
		};
		try {
			await updateDeckCard(
				locals.user!,
				mergeDraft.entryId,
				mergeDraft.quantity,
				mergeDraft.role || undefined,
				mergeDraft.requestId,
				mergeDraft.delta,
				'web',
				form.has('categoryPreview') ? field(form, 'categoryPreview') : undefined
			);
		} catch (cause) {
			if (cause instanceof CategoryMergeConflict)
				return fail(409, {
					message: cause.message,
					categoryMerge: cause.preview,
					mergeDraft,
					mergeAction: 'updateCard'
				});
			throw cause;
		}
		return { success: true, message: 'Card updated.' };
	}),
	removeCard: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		await removeDeckCard(locals.user!, field(form, 'entryId'), field(form, 'requestId'));
		return { success: true, message: 'Card removed from deck.' };
	}),
	previewImport: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		const snapshot = await getDeckSnapshot(locals.user!, 'mtg', field(form, 'deckId'));
		const deck = snapshot.decks.find((entry) => entry.id === field(form, 'deckId'));
		if (!deck) return fail(404, { message: 'Deck not found.' });
		const text = field(form, 'text');
		if (!text || text.length > 100_000)
			return fail(400, {
				message: 'Paste a decklist of up to 100,000 characters.',
				importDraft: { text: String(form.get('text') ?? ''), requestId: field(form, 'requestId') }
			});
		return {
			preview: await application.decks.previewMtgImport(locals.user!, text, deck.format),
			importText: text,
			importDraft: { text: String(form.get('text') ?? ''), requestId: field(form, 'requestId') }
		};
	}),
	commitImport: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		const text = field(form, 'text');
		if (!text || text.length > 100_000)
			return fail(400, {
				message: 'Paste a decklist of up to 100,000 characters.',
				importDraft: { text: String(form.get('text') ?? ''), requestId: field(form, 'requestId') }
			});
		try {
			await importIntoDeck(locals.user!, {
				deckId: field(form, 'deckId'),
				text,
				requestId: field(form, 'requestId')
			});
		} catch (cause) {
			if (
				cause instanceof RequestConflictError ||
				(cause instanceof ValidationError && !(cause instanceof DeckNotFoundError))
			)
				return fail(cause instanceof RequestConflictError ? 409 : 400, {
					message: cause.message,
					importDraft: { text: String(form.get('text') ?? ''), requestId: field(form, 'requestId') }
				});
			throw cause;
		}
		return { success: true, imported: true, message: 'Resolved cards added to the deck.' };
	})
} satisfies Actions;
