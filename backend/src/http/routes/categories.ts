import type { HttpDependencies, HttpRoute, RouteContext } from '../types.ts';
import type { CategoryScope, SaveDefinitionInput } from '@spellbook/contracts/category-library.ts';
import { requireMobileAuth } from '../auth.ts';
import { error, json, badRequestIfValidation } from '../errors.ts';
import { readJsonObject, readQueryInteger, requireUuid, readString } from '../request.ts';

export function createCategoryRoutes(deps: HttpDependencies): HttpRoute[] {
	const { application } = deps;
	async function command(context: RouteContext, remove: boolean) {
		const auth = await requireMobileAuth(context, deps),
			body = await readJsonObject(context.request, 65536);
		if (
			Object.keys(body).some(
				(k) =>
					![
						'requestId',
						'expectedDecisionRevision',
						remove ? 'replacementCategoryId' : 'name'
					].includes(k)
			)
		)
			error(400, 'Unsupported category request fields');
		const input = {
			...body,
			deckId: requireUuid(context.params.deckId),
			categoryId: requireUuid(context.params.categoryId)
		};
		try {
			return json(
				remove
					? await application.categories.removeLocalCategory(
							auth.user,
							input as Parameters<typeof application.categories.removeLocalCategory>[1]
						)
					: await application.categories.renameLocalCategory(
							auth.user,
							input as Parameters<typeof application.categories.renameLocalCategory>[1]
						)
			);
		} catch (cause) {
			badRequestIfValidation(cause);
		}
	}

	return [
		{
			method: 'GET',
			path: '/api/mobile/v1/mtg/category-definitions',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				try {
					return json(
						await application.categories.getLibrary(auth.user, {
							scope: (context.url.searchParams.get('scope') ?? undefined) as
								CategoryScope | undefined,
							offset: readQueryInteger(
								context.url.searchParams.get('offset'),
								'offset',
								0,
								Number.MAX_SAFE_INTEGER,
								0
							),
							limit: readQueryInteger(context.url.searchParams.get('limit'), 'limit', 50, 100, 1)
						})
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'POST',
			path: '/api/mobile/v1/mtg/category-definitions',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps),
					body = await readJsonObject(context.request, 65536);
				try {
					return json(
						await application.categories.saveDefinition(auth.user, body as SaveDefinitionInput)
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'GET',
			path: '/api/mobile/v1/mtg/category-rule-choices',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				const query = context.url.searchParams;
				try {
					return json(
						await application.categories.getRuleChoices(auth.user, {
							tagQuery: query.get('tagQuery') ?? undefined,
							cardQuery: query.get('cardQuery') ?? undefined,
							outcomeQuery: query.get('outcomeQuery') ?? undefined,
							tagIds: query.getAll('tagId'),
							oracleIds: query.getAll('oracleId'),
							outcomeIds: query.getAll('outcomeId')
						})
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'POST',
			path: '/api/mobile/v1/mtg/category-definitions/:originId/archive',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps),
					body = await readJsonObject(context.request, 65536);
				if (
					Object.keys(body).some(
						(k) => !['requestId', 'expectedLibraryRevision', 'archived'].includes(k)
					)
				)
					error(400, 'Unsupported category request fields');
				try {
					return json(
						await application.categories.archiveDefinition(auth.user, {
							...body,
							originId: requireUuid(context.params.originId)
						} as Parameters<typeof application.categories.archiveDefinition>[1])
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'GET',
			path: '/api/mobile/v1/mtg/category-previews/:previewId',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				try {
					return json(
						await application.categories.getCategoryPreview(auth.user, {
							previewId: requireUuid(context.params.previewId),
							offset: readQueryInteger(
								context.url.searchParams.get('offset'),
								'offset',
								0,
								Number.MAX_SAFE_INTEGER,
								0
							),
							limit: readQueryInteger(context.url.searchParams.get('limit'), 'limit', 50, 100, 1)
						})
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'POST',
			path: '/api/mobile/v1/mtg/category-previews/:previewId/commit',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps),
					body = await readJsonObject(context.request, 65536);
				if (Object.keys(body).some((k) => k !== 'requestId'))
					error(400, 'Unsupported category request fields');
				try {
					return json(
						await application.categories.commitCategoryChange(auth.user, {
							...body,
							previewId: requireUuid(context.params.previewId)
						} as Parameters<typeof application.categories.commitCategoryChange>[1])
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'PATCH',
			path: '/api/mobile/v1/mtg/deck-cards/:entryId/category',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				const body = await readJsonObject(context.request, 16384);
				if (
					Object.keys(body).some(
						(k) => !['deckId', 'categoryId', 'expectedDecisionRevision', 'requestId'].includes(k)
					)
				)
					throw error(400, 'Unsupported category request fields');
				try {
					return json(
						await application.categories.setEntryCategory(auth.user, {
							...body,
							entryId: requireUuid(context.params.entryId)
						} as Parameters<typeof application.categories.setEntryCategory>[1])
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'GET',
			path: '/api/mobile/v1/mtg/decks/:deckId/categories',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				try {
					return json(
						await application.categories.getDeckEntryCategories(
							auth.user,
							requireUuid(context.params.deckId)
						)
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'POST',
			path: '/api/mobile/v1/mtg/decks/:deckId/categories/initialize',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				const body = await readJsonObject(context.request, 16384);
				if (Object.keys(body).some((k) => !['requestId'].includes(k)))
					throw error(400, 'Unsupported category request fields');
				try {
					return json(
						await application.categories.initializeDeckCategories(auth.user, {
							...body,
							deckId: requireUuid(context.params.deckId)
						} as Parameters<typeof application.categories.initializeDeckCategories>[1])
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'POST',
			path: '/api/mobile/v1/mtg/decks/:deckId/categories/merge-preview',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				const body = await readJsonObject(context.request, 16384);
				if (
					Object.keys(body).some(
						(k) => !['entryId', 'catalogCardId', 'role', 'quantity'].includes(k)
					)
				)
					throw error(400, 'Unsupported category request fields');
				try {
					return json(
						await application.categories.previewEntryMerge(auth.user, {
							...body,
							deckId: requireUuid(context.params.deckId)
						} as Parameters<typeof application.categories.previewEntryMerge>[1])
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'POST',
			path: '/api/mobile/v1/mtg/decks/:deckId/category-previews',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps),
					body = await readJsonObject(context.request, 65536);
				if (
					Object.keys(body).some(
						(k) => !['requestId', 'scope', 'mode', 'restoreOriginIds'].includes(k)
					)
				)
					error(400, 'Unsupported category request fields');
				try {
					return json(
						await application.categories.previewCategoryChange(auth.user, {
							...body,
							deckId: requireUuid(context.params.deckId)
						} as Parameters<typeof application.categories.previewCategoryChange>[1])
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'GET',
			path: '/api/mobile/v1/mtg/decks/:deckId/whole-categories',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				try {
					return json(
						await application.categories.getDeckWholeCategories(
							auth.user,
							requireUuid(context.params.deckId)
						)
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'GET',
			path: '/api/mobile/v1/mtg/category-definitions/:originId',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				try {
					return json(
						await application.categories.getDefinition(
							auth.user,
							requireUuid(context.params.originId)
						)
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'PATCH',
			path: '/api/mobile/v1/mtg/decks/:deckId/whole-categories/:versionId',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				const body = await readJsonObject(context.request, 65536);
				if (
					Object.keys(body).some(
						(k) => !['requestId', 'expectedDecisionRevision', 'name', 'manual'].includes(k)
					) ||
					(body.name !== undefined && body.manual !== undefined)
				)
					throw error(400, 'Unsupported whole-deck category fields');
				try {
					const input = {
						requestId: requireUuid(body.requestId),
						deckId: requireUuid(context.params.deckId),
						versionId: requireUuid(context.params.versionId),
						expectedDecisionRevision: readString(
							body.expectedDecisionRevision,
							'expectedDecisionRevision'
						)
					};
					if (body.name !== undefined)
						return json(
							await application.categories.renameWholeCategory(auth.user, {
								...input,
								name: readString(body.name, 'name')
							})
						);
					if (body.manual !== 'Include' && body.manual !== 'Exclude')
						throw error(400, 'Select Include or Exclude');
					return json(
						await application.categories.setWholeCategory(auth.user, {
							...input,
							manual: body.manual
						})
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'DELETE',
			path: '/api/mobile/v1/mtg/decks/:deckId/whole-categories/:versionId',
			handle: async (context) => {
				const auth = await requireMobileAuth(context, deps);
				const body = await readJsonObject(context.request, 65536);
				if (Object.keys(body).some((k) => !['requestId', 'expectedDecisionRevision'].includes(k)))
					throw error(400, 'Unsupported whole-deck category fields');
				try {
					return json(
						await application.categories.removeWholeCategory(auth.user, {
							requestId: requireUuid(body.requestId),
							deckId: requireUuid(context.params.deckId),
							versionId: requireUuid(context.params.versionId),
							expectedDecisionRevision: readString(
								body.expectedDecisionRevision,
								'expectedDecisionRevision'
							)
						})
					);
				} catch (cause) {
					badRequestIfValidation(cause);
				}
			}
		},
		{
			method: 'PATCH',
			path: '/api/mobile/v1/mtg/decks/:deckId/categories/:categoryId',
			handle: (context) => command(context, false)
		},
		{
			method: 'DELETE',
			path: '/api/mobile/v1/mtg/decks/:deckId/categories/:categoryId',
			handle: (context) => command(context, true)
		}
	];
}
