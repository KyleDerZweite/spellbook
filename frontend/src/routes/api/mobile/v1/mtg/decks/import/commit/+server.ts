import type { RequestHandler } from './$types';
import { readString, readJsonObject } from '#lib/server/http/request.ts';
import { json } from '@sveltejs/kit';
import { importDeck, getDeckCardsForDeck } from '#lib/server/data/decks.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
import { isCommittedDeckRole, previewMtgImport, toCardIdentity } from '#lib/server/mtg/import.ts';
import {
	DECK_SOURCES,
	ValidationError,
	assertRequestId,
	normalizeSource
} from '#lib/server/mtg/validation.ts';

export const POST: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = await readJsonObject(event.request);
	try {
		const name = readString(body.name, 'name', '').trim();
		if (!name) {
			throw new ValidationError('Deck name is required');
		}
		const requestId = assertRequestId(body?.requestId);
		const source = normalizeSource(body?.source, DECK_SOURCES, 'import');
		const format = readString(body.format, 'format', 'Commander');
		const preview = await previewMtgImport(readString(body.text, 'text', ''), format);
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

		const deck = await importDeck(auth.user.accountId, {
			game: 'mtg',
			name,
			description: readString(body.description, 'description', ''),
			format,
			requestId,
			source,
			operations
		});
		const deckCards = await getDeckCardsForDeck(auth.user.accountId, deck.id);

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
