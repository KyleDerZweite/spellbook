import { json } from '@sveltejs/kit';
import {
	createDeckRecord,
	getDeckByMutationRequest,
	getDeckCardsForDeck
} from '$lib/server/data/decks';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { bulkMutateDeckCards } from '$lib/server/mobile/mtg-service';
import { badRequestIfValidation } from '$lib/server/mobile/route-errors';
import { isCommittedDeckRole, previewMtgImport, toCardIdentity } from '$lib/server/mtg/import';
import {
	DECK_SOURCES,
	ValidationError,
	assertRequestId,
	normalizeSource
} from '$lib/server/mtg/validation';

export const POST = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = await event.request.json();
	try {
		const name = String(body?.name ?? '').trim();
		if (!name) {
			throw new ValidationError('Deck name is required');
		}
		const requestId = assertRequestId(body?.requestId);
		const source = normalizeSource(body?.source, DECK_SOURCES, 'import');
		const format = String(body?.format ?? 'Commander');
		const preview = await previewMtgImport(String(body?.text ?? ''), format);
		const existingDeck = await getDeckByMutationRequest(auth.user.accountId, requestId);
		if (existingDeck) {
			return json({
				deck: existingDeck,
				deckCards: await getDeckCardsForDeck(auth.user.accountId, existingDeck.id),
				unresolved: preview.unresolved,
				ambiguous: preview.ambiguous,
				warnings: preview.warnings
			});
		}
		const operations = preview.resolved
			.filter(({ line }) => isCommittedDeckRole(line.role))
			.map(({ line, card }) => ({
				op: 'add' as const,
				card: toCardIdentity(card),
				quantity: line.quantity,
				role: line.role as 'main' | 'sideboard' | 'commander' | 'companion'
			}));

		if (operations.length === 0) {
			throw new ValidationError('No resolved deck lines to commit');
		}

		const deck = await createDeckRecord(auth.user.accountId, {
			game: 'mtg',
			name,
			description: String(body?.description ?? ''),
			format
		});
		const deckCards = await bulkMutateDeckCards(auth, {
			deckId: deck.id,
			requestId,
			source,
			operations
		});

		return json({
			deck,
			deckCards,
			unresolved: preview.unresolved,
			ambiguous: preview.ambiguous,
			warnings: preview.warnings
		});
	} catch (cause) {
		badRequestIfValidation(cause, 'Invalid deck import commit');
	}
};
