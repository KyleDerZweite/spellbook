import type { HttpDependencies, HttpRoute } from '../types.ts';
import type { DeckOperation } from '@spellbook/contracts/decks.ts';
import { deckLibraryQueryFromParams } from '@spellbook/contracts/deck-library.ts';
import {
	normalizeQuantity,
	assertRequestId,
	normalizeSource,
	DECK_SOURCES
} from '../../mtg/validation.ts';
import { requireMobileAuth } from '../auth.ts';
import { error, json, badRequestIfValidation } from '../errors.ts';
import {
	readString,
	readJsonObject,
	requireUuid,
	readNumber,
	readQueryInteger
} from '../request.ts';

function readLibraryInput(params: URLSearchParams) {
	try {
		return {
			...deckLibraryQueryFromParams(params),
			offset: readQueryInteger(params.get('offset'), 'offset', 0),
			limit: readQueryInteger(params.get('limit'), 'limit', 40),
			...((params.get('expectedRevision') ?? params.get('revision')) === null
				? {}
				: { expectedRevision: (params.get('expectedRevision') ?? params.get('revision'))! })
		};
	} catch {
		throw error(400, 'Invalid Deck Library query');
	}
}

export function createDeckRoutes(deps: HttpDependencies): HttpRoute[] {
	const { application } = deps;
	return [
		{
			method: 'GET',
			path: '/api/mobile/v1/mtg/deck-library',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				try {
					return json(
						await application.decks.getDeckLibrary(
							auth.user,
							readLibraryInput(context.url.searchParams)
						)
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'GET',
			path: '/api/mobile/v1/mtg/deck-library/categories',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				try {
					return json(
						await application.decks.getDeckLibraryCategories(auth.user, {
							...readLibraryInput(context.url.searchParams),
							selectedVersionIds: context.url.searchParams.getAll('selectedVersionId')
						})
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'GET',
			path: '/api/mobile/v1/mtg/deck-library/locate',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				try {
					return json(
						await application.decks.locateDeck(
							auth.user,
							requireUuid(context.url.searchParams.get('deckId')),
							readLibraryInput(context.url.searchParams)
						)
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'GET',
			path: '/api/mobile/v1/mtg/decks',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				try {
					return json(
						await application.decks.getDeckSnapshot(
							auth.user,
							'mtg',
							context.url.searchParams.get('deck')
						)
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'POST',
			path: '/api/mobile/v1/mtg/decks',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				const body = await readJsonObject(context.request);
				if (!body?.name) {
					throw error(400, 'name is required');
				}

				try {
					const input = {
						game: 'mtg',
						name: readString(body.name, 'name'),
						description: readString(body.description, 'description', ''),
						format: readString(body.format, 'format', 'Commander')
					};
					return json(
						(await application.decks.getDeckSnapshot(auth.user, 'mtg')).decks.concat(
							await application.decks.createDeckRecord(auth.user, input)
						)
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'GET',
			path: '/api/mobile/v1/mtg/decks/choices',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				const params = context.url.searchParams;
				for (const key of params.keys())
					if (
						!['query', 'offset', 'limit', 'selectedDeckId'].includes(key) ||
						params.getAll(key).length !== 1
					)
						error(400, 'Invalid Deck choice query');
				try {
					return json(
						await application.decks.getDeckChoices(auth.user, {
							query: params.get('query') ?? undefined,
							offset: readQueryInteger(params.get('offset'), 'offset', 0, 1_000_000),
							limit: readQueryInteger(params.get('limit'), 'limit', 20, 50, 1),
							selectedDeckId: params.get('selectedDeckId') ?? undefined
						}),
						{ headers: { 'cache-control': 'no-store' } }
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'POST',
			path: '/api/mobile/v1/mtg/decks/import/commit',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				const body = await readJsonObject(context.request);
				try {
					return json(
						await application.decks.importTextDeck(auth.user, {
							requestId: readString(body.requestId, 'requestId', ''),
							source: readString(body.source, 'source', 'import'),
							game: 'mtg',
							name: readString(body.name, 'name', ''),
							description: readString(body.description, 'description', ''),
							format: readString(body.format, 'format', 'Commander'),
							text: readString(body.text, 'text', '')
						})
					);
				} catch (cause) {
					badRequestIfValidation(cause, 'Invalid deck import commit');
				}
			}
		},
		{
			method: 'POST',
			path: '/api/mobile/v1/mtg/decks/import/preview',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				const body = await readJsonObject(context.request);
				try {
					return json(
						await application.decks.previewMtgImport(
							auth.user,
							readString(body.text, 'text', ''),
							readString(body.format, 'format', '')
						)
					);
				} catch (cause) {
					badRequestIfValidation(cause, 'Invalid deck import preview');
				}
			}
		},
		{
			method: 'GET',
			path: '/api/mobile/v1/mtg/decks/ownership',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				try {
					return json(
						await application.decks.ownership(
							auth.user,
							context.url.searchParams.getAll('canonicalCardId')
						)
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'GET',
			path: '/api/mobile/v1/mtg/decks/search',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				try {
					return json(
						await application.decks.search(auth.user, context.url.searchParams.get('q') || '')
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'PATCH',
			path: '/api/mobile/v1/mtg/deck-cards/:entryId',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				const entryId = requireUuid(context.params.entryId, 'entryId');
				const body = await readJsonObject(context.request);

				try {
					return json(
						await application.decks.updateDeckCard(
							auth.user,
							entryId,
							body.quantity === undefined
								? undefined
								: normalizeQuantity(readNumber(body.quantity, 'quantity')),
							body?.role === undefined ? undefined : readString(body.role, 'role'),
							readString(body.requestId, 'requestId', ''),
							body.delta === undefined ? undefined : readNumber(body.delta, 'delta'),
							'mobile',
							body.categoryPreview === undefined
								? undefined
								: readString(body.categoryPreview, 'categoryPreview')
						)
					);
				} catch (cause) {
					badRequestIfValidation(cause, 'Invalid deck card update');
				}
			}
		},
		{
			method: 'DELETE',
			path: '/api/mobile/v1/mtg/deck-cards/:entryId',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				const entryId = requireUuid(context.params.entryId, 'entryId');

				const requestId = context.url.searchParams.get('requestId') ?? '';
				try {
					return json(
						await application.decks.removeDeckCard(auth.user, entryId, requestId, 'mobile')
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'PATCH',
			path: '/api/mobile/v1/mtg/decks/:deckId',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				const deckId = requireUuid(context.params.deckId, 'deckId');
				const body = await readJsonObject(context.request);

				try {
					return json(
						await application.decks.updateDeck(auth.user, {
							deckId,
							...(body.name === undefined ? {} : { name: readString(body.name, 'name') }),
							...(body.description === undefined
								? {}
								: {
										description: readString(body.description, 'description'),
										descriptionRevision: readString(
											body.descriptionRevision,
											'descriptionRevision',
											''
										)
									}),
							...(body.format === undefined ? {} : { format: readString(body.format, 'format') })
						})
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'DELETE',
			path: '/api/mobile/v1/mtg/decks/:deckId',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				const deckId = requireUuid(context.params.deckId, 'deckId');

				try {
					await application.decks.deleteDeck(auth.user, deckId);
					return json({ ok: true });
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'GET',
			path: '/api/mobile/v1/mtg/decks/:deckId',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				try {
					const deckId = requireUuid(context.params.deckId, 'deckId');
					const flags = context.url.searchParams.getAll('includeLegality');
					const includeLegality = flags[0];
					if (
						flags.length > 1 ||
						(includeLegality !== undefined &&
							includeLegality !== 'true' &&
							includeLegality !== 'false') ||
						(includeLegality === 'false' &&
							(context.url.searchParams.getAll('selectedOnly').length !== 1 ||
								context.url.searchParams.get('selectedOnly') !== 'true'))
					)
						throw error(400, 'includeLegality=false requires selectedOnly=true.');
					const snapshot =
						context.url.searchParams.get('selectedOnly') === 'true'
							? await application.decks.getDeck(auth.user, deckId)
							: await application.decks.getDeckSnapshot(auth.user, 'mtg', deckId);
					if (includeLegality === 'false')
						return json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
					const detail = await application.decks.getDeckLegality(auth.user, deckId);
					return json({ ...snapshot, ...detail }, { headers: { 'Cache-Control': 'no-store' } });
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'GET',
			path: '/api/mobile/v1/mtg/decks/:deckId/availability',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				try {
					return json(
						await application.decks.availability(
							auth.user,
							requireUuid(context.params.deckId, 'deckId')
						),
						{ headers: { 'cache-control': 'no-store' } }
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'POST',
			path: '/api/mobile/v1/mtg/decks/:deckId/cards',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				const deckId = requireUuid(context.params.deckId, 'deckId');
				const body = await readJsonObject(context.request);
				if (!deckId || !body?.catalogCardId || !body?.canonicalCardId || !body?.name) {
					throw error(400, 'deckId, catalogCardId, canonicalCardId, and name are required');
				}

				try {
					return json(
						await application.decks.addDeckCard(auth.user, {
							deckId,
							catalogCardId: readString(body.catalogCardId, 'catalogCardId'),
							canonicalCardId: readString(body.canonicalCardId, 'canonicalCardId'),
							name: readString(body.name, 'name'),
							setCode: readString(body.setCode, 'setCode', ''),
							imageUri: readString(body.imageUri, 'imageUri', ''),
							quantity: normalizeQuantity(readNumber(body.quantity, 'quantity', 1)),
							role: readString(body.role, 'role', 'main'),
							requestId: readString(body.requestId, 'requestId', '')
						})
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'POST',
			path: '/api/mobile/v1/mtg/decks/:deckId/cards/bulk',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				const deckId = requireUuid(context.params.deckId, 'deckId');
				const body = await readJsonObject(context.request);

				try {
					return json(
						await application.decks.bulkMutateDeckCards(auth.user, {
							deckId,
							requestId: assertRequestId(readString(body.requestId, 'requestId', '')),
							source: normalizeSource(
								readString(body.source, 'source', 'mobile'),
								DECK_SOURCES,
								'mobile'
							),
							game: 'mtg',
							operations: (Array.isArray(body.operations) ? body.operations : []) as DeckOperation[]
						})
					);
				} catch (cause) {
					badRequestIfValidation(cause, 'Invalid deck bulk request');
				}
			}
		},
		{
			method: 'GET',
			path: '/api/mobile/v1/mtg/decks/:deckId/export',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				const deckId = requireUuid(context.params.deckId, 'deckId');
				const format = context.url.searchParams.get('format') ?? 'arena';
				if (format !== 'arena') {
					throw error(400, 'Only arena export is supported');
				}

				try {
					return new Response(await application.decks.exportDecklist(auth.user, deckId), {
						headers: {
							'content-type': 'text/plain; charset=utf-8'
						}
					});
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		}
	];
}
