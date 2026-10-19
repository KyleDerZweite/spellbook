import type {
	AuthUser,
	AuthSession,
	Authenticated,
	SessionInfo
} from '@spellbook/contracts/auth.ts';
import type { QrAuthApplication } from '@spellbook/contracts/auth-qr.ts';
import type { CatalogApplication } from '@spellbook/contracts/catalog.ts';
import type { InventoryApplication } from '@spellbook/contracts/inventory.ts';
import type { InventoryValueApplication } from '@spellbook/contracts/inventory-value.ts';
import type { DecksApplication } from '@spellbook/contracts/decks.ts';
import type { CategoriesApplication } from '@spellbook/contracts/categories.ts';
import type {
	CategoryChangesApplication,
	CategoryLibraryApplication
} from '@spellbook/contracts/category-library.ts';
import type { WholeCategoriesApplication } from '@spellbook/contracts/whole-categories.ts';
import type { ProfileApplication } from '@spellbook/contracts/profile.ts';
import type { DashboardApplication } from '@spellbook/contracts/dashboard.ts';
import type { WebCommandInputs, WebCommandOutputs } from '@spellbook/contracts/web.ts';
import { normalizeInventoryQuery } from '@spellbook/contracts/inventory-query.ts';
import { parseCatalogSearchRequest } from '@spellbook/contracts/catalog-query.ts';
import { ValidationError } from '@spellbook/contracts/validation.ts';
import { RemoteError } from './errors.ts';
import { queryPath, type RemoteClient } from './client.ts';

const base = '/api/mobile/v1/mtg';
const id = encodeURIComponent;

/** Named web use cases map to REST or the closed receipt-compatible web commands. */
export function createRemoteApplication(client: () => RemoteClient) {
	function command<K extends keyof WebCommandInputs>(operation: K, input: WebCommandInputs[K]) {
		return client().request<WebCommandOutputs[K]>('/api/web/v1/commands', {
			method: 'POST',
			body: { operation, input },
			domain: operation.startsWith('inventory.') ? 'inventory' : 'decks'
		});
	}
	const catalog: Pick<
		CatalogApplication,
		'searchCatalog' | 'searchCatalogRequest' | 'getPrintings' | 'getCatalogPrinting'
	> = {
		searchCatalog: (query, limit = 20, offset = 0) =>
			catalog.searchCatalogRequest(parseCatalogSearchRequest({ query, limit, offset })),
		searchCatalogRequest: (input) =>
			client().request('/api/catalog/search', { method: 'POST', body: input }),
		getPrintings: (oracleId, limit = 100, offset = 0) =>
			client().request(
				queryPath(`/api/catalog/cards/${id(oracleId)}/printings`, { limit, offset })
			),
		getCatalogPrinting: (printingId) => client().request(`/api/catalog/printings/${id(printingId)}`)
	};
	const inventory: Pick<
		InventoryApplication,
		| 'page'
		| 'getEntry'
		| 'locate'
		| 'add'
		| 'patchEntry'
		| 'remove'
		| 'createGroup'
		| 'renameGroup'
		| 'deleteGroup'
		| 'replaceMemberships'
	> = {
		page: (_actor, input, revision) =>
			client().request(
				queryPath(
					`${base}/inventory`,
					{ ...normalizeInventoryQuery(input), revision },
					{ sets: 'set' }
				),
				{ domain: 'inventory', revisionResult: true }
			),
		getEntry: (_actor, entryId) =>
			client().request(`${base}/inventory/${id(entryId)}`, {
				domain: 'inventory',
				allowNotFound: true
			}),
		locate: (_actor, input, entryId, revision) =>
			client().request(
				queryPath(
					`${base}/inventory/${id(entryId)}/location`,
					{ ...normalizeInventoryQuery(input), revision },
					{ sets: 'set' }
				),
				{ domain: 'inventory', revisionResult: true }
			),
		add: (_actor, { source, ...input }) => {
			webSource(source);
			return command('inventory.add', input);
		},
		patchEntry: (_actor, { source, ...input }) => {
			webSource(source);
			return command('inventory.patchEntry', input);
		},
		remove: (_actor, { source, ...input }) => {
			webSource(source);
			return command('inventory.remove', input);
		},
		createGroup: (_actor, input) =>
			client().request(`${base}/inventory/groups`, {
				method: 'POST',
				body: input,
				domain: 'inventory'
			}),
		renameGroup: (_actor, { groupId, ...input }) =>
			client().request(`${base}/inventory/groups/${id(groupId)}`, {
				method: 'PATCH',
				body: input,
				domain: 'inventory'
			}),
		deleteGroup: (_actor, { groupId, ...input }) =>
			client().request(`${base}/inventory/groups/${id(groupId)}`, {
				method: 'DELETE',
				body: input,
				domain: 'inventory'
			}),
		replaceMemberships: (_actor, { entryId, ...input }) =>
			client().request(`${base}/inventory/${id(entryId)}/groups`, {
				method: 'PUT',
				body: input,
				domain: 'inventory'
			})
	};
	type WebDecks = Pick<
		DecksApplication,
		| 'getDeck'
		| 'getDeckLibrary'
		| 'getDeckLibraryCategories'
		| 'search'
		| 'ownership'
		| 'getDeckChoices'
		| 'createDeckRecord'
		| 'updateDeck'
		| 'deleteDeck'
		| 'getDeckLegality'
		| 'exportDecklist'
		| 'previewMtgImport'
		| 'addCatalogCardToDeck'
		| 'changeDeckPrinting'
		| 'importIntoDeck'
		| 'updateDeckCard'
		| 'removeDeckCard'
	>;
	const decks: WebDecks = {
		getDeck: (_actor, deckId) =>
			client().request(
				queryPath(`${base}/decks/${id(deckId)}`, { selectedOnly: true, includeLegality: false }),
				{ domain: 'decks' }
			),
		getDeckLibrary: (_actor, input) =>
			client().request(
				queryPath(`${base}/deck-library`, input, {
					query: 'dirQ',
					format: 'dirFormat',
					categoryVersionIds: 'dirCategory',
					sort: 'dirSort',
					selectedVersionIds: 'selectedVersionId'
				}),
				{ domain: 'decks' }
			),
		getDeckLibraryCategories: (_actor, input) =>
			client().request(
				queryPath(`${base}/deck-library/categories`, input, {
					query: 'dirQ',
					format: 'dirFormat',
					categoryVersionIds: 'dirCategory',
					sort: 'dirSort',
					selectedVersionIds: 'selectedVersionId'
				}),
				{ domain: 'decks' }
			),
		search: (_actor, q) =>
			client().request(queryPath(`${base}/decks/search`, { q }), { domain: 'decks' }),
		ownership: (_actor, canonicalCardId) =>
			client().request(queryPath(`${base}/decks/ownership`, { canonicalCardId }), {
				domain: 'decks'
			}),
		getDeckChoices: (_actor, input) =>
			client().request(queryPath(`${base}/decks/choices`, input), { domain: 'decks' }),
		createDeckRecord: (_actor, input) => {
			if (input.game !== 'mtg') throw new ValidationError('Unsupported game');
			return command('decks.createRecord', { ...input, game: 'mtg' });
		},
		updateDeck: (_actor, { deckId, ...input }) =>
			client().request(`${base}/decks/${id(deckId)}`, {
				method: 'PATCH',
				body: input,
				domain: 'decks'
			}),
		deleteDeck: async (_actor, deckId) => {
			await client().request(`${base}/decks/${id(deckId)}`, { method: 'DELETE', domain: 'decks' });
		},
		getDeckLegality: async (_actor, deckId) => {
			const { warnings, deckDocuments } = await client().request<
				Awaited<ReturnType<WebDecks['getDeckLegality']>>
			>(queryPath(`${base}/decks/${id(deckId)}`, { selectedOnly: true }), { domain: 'decks' });
			return { warnings, deckDocuments };
		},
		exportDecklist: (_actor, deckId) =>
			client().request(`${base}/decks/${id(deckId)}/export`, { text: true, domain: 'decks' }),
		previewMtgImport: (_actor, text, format = '') =>
			client().request(`${base}/decks/import/preview`, {
				method: 'POST',
				body: { text, format },
				domain: 'decks'
			}),
		addCatalogCardToDeck: (_actor, input) => command('decks.addCatalogCard', input),
		changeDeckPrinting: (_actor, input) => command('decks.changePrinting', input),
		importIntoDeck: (_actor, input) => command('decks.importInto', input),
		updateDeckCard: (
			_actor,
			entryId,
			quantity,
			role,
			requestId,
			delta,
			source,
			categoryPreview
		) => {
			webSource(source);
			return command('decks.updateCard', {
				entryId,
				requestId,
				...(quantity === undefined ? {} : { quantity }),
				...(role === undefined ? {} : { role }),
				...(delta === undefined ? {} : { delta }),
				...(categoryPreview === undefined ? {} : { categoryPreview })
			});
		},
		removeDeckCard: (_actor, entryId, requestId, source) => {
			webSource(source);
			return command('decks.removeCard', { entryId, requestId });
		}
	};
	const categories: CategoriesApplication &
		CategoryChangesApplication &
		CategoryLibraryApplication &
		WholeCategoriesApplication = {
		getDeckEntryCategories: (_actor, deckId) =>
			client().request(`${base}/decks/${id(deckId)}/categories`, { domain: 'categories' }),
		initializeDeckCategories: (_actor, { deckId, ...input }) =>
			client().request(`${base}/decks/${id(deckId)}/categories/initialize`, {
				method: 'POST',
				body: input,
				domain: 'categories'
			}),
		setEntryCategory: (_actor, { entryId, ...input }) =>
			client().request(`${base}/deck-cards/${id(entryId)}/category`, {
				method: 'PATCH',
				body: input,
				domain: 'categories'
			}),
		previewEntryMerge: (_actor, { deckId, ...input }) =>
			client().request(`${base}/decks/${id(deckId)}/categories/merge-preview`, {
				method: 'POST',
				body: input,
				domain: 'categories'
			}),
		renameLocalCategory: (_actor, { deckId, categoryId, ...input }) =>
			client().request(`${base}/decks/${id(deckId)}/categories/${id(categoryId)}`, {
				method: 'PATCH',
				body: input,
				domain: 'categories'
			}),
		removeLocalCategory: (_actor, { deckId, categoryId, ...input }) =>
			client().request(`${base}/decks/${id(deckId)}/categories/${id(categoryId)}`, {
				method: 'DELETE',
				body: input,
				domain: 'categories'
			}),
		previewCategoryChange: (_actor, { deckId, ...input }) =>
			client().request(`${base}/decks/${id(deckId)}/category-previews`, {
				method: 'POST',
				body: input,
				domain: 'categories'
			}),
		getCategoryPreview: (_actor, { previewId, ...input }) =>
			client().request(queryPath(`${base}/category-previews/${id(previewId)}`, input), {
				domain: 'categories'
			}),
		commitCategoryChange: (_actor, { previewId, ...input }) =>
			client().request(`${base}/category-previews/${id(previewId)}/commit`, {
				method: 'POST',
				body: input,
				domain: 'categories'
			}),
		getDefinition: (_actor, originId) =>
			client().request(`${base}/category-definitions/${id(originId)}`, { domain: 'categories' }),
		getRuleChoices: (_actor, input) =>
			client().request(
				queryPath(`${base}/category-rule-choices`, input, {
					tagIds: 'tagId',
					oracleIds: 'oracleId',
					outcomeIds: 'outcomeId'
				}),
				{ domain: 'categories' }
			),
		getLibrary: (_actor, input) =>
			client().request(queryPath(`${base}/category-definitions`, input), { domain: 'categories' }),
		saveDefinition: (_actor, input) =>
			client().request(`${base}/category-definitions`, {
				method: 'POST',
				body: input,
				domain: 'categories'
			}),
		archiveDefinition: (_actor, { originId, ...input }) =>
			client().request(`${base}/category-definitions/${id(originId)}/archive`, {
				method: 'POST',
				body: input,
				domain: 'categories'
			}),
		getDeckWholeCategories: (_actor, deckId) =>
			client().request(`${base}/decks/${id(deckId)}/whole-categories`, { domain: 'categories' }),
		setWholeCategory: (_actor, { deckId, versionId, ...input }) =>
			client().request(`${base}/decks/${id(deckId)}/whole-categories/${id(versionId)}`, {
				method: 'PATCH',
				body: input,
				domain: 'categories'
			}),
		renameWholeCategory: (_actor, { deckId, versionId, ...input }) =>
			client().request(`${base}/decks/${id(deckId)}/whole-categories/${id(versionId)}`, {
				method: 'PATCH',
				body: input,
				domain: 'categories'
			}),
		removeWholeCategory: (_actor, { deckId, versionId, ...input }) =>
			client().request(`${base}/decks/${id(deckId)}/whole-categories/${id(versionId)}`, {
				method: 'DELETE',
				body: input,
				domain: 'categories'
			})
	};
	const profile: ProfileApplication = {
		get: () => client().request('/api/account/profile'),
		patch: (_actor, input) =>
			client().request('/api/account/profile', { method: 'PATCH', body: input })
	};
	const dashboard: DashboardApplication = { get: () => client().request('/api/account/dashboard') };
	const inventoryValues: InventoryValueApplication = {
		current: () => client().request(`${base}/inventory/value`),
		history: (_actor, input) =>
			client().request(queryPath(`${base}/inventory/value-history`, input as object | undefined))
	};
	const qr: Pick<QrAuthApplication, 'inspect' | 'decide'> = {
		inspect: (_actor, code) =>
			client().request(`/api/auth/qr/requests/${id(code)}`, { domain: 'qr' }),
		decide: (_actor, code, decision) =>
			client().request(`/api/auth/qr/requests/${id(code)}/decision`, {
				method: 'POST',
				body: { decision },
				domain: 'qr'
			})
	};
	const auth = {
		qr,
		async validateSession(token: string | undefined): Promise<AuthUser | null> {
			if (!token) return null;
			try {
				return (await client().request<SessionInfo>('/api/auth/session', { token })).user;
			} catch (cause) {
				if (cause instanceof RemoteError && cause.status === 401) return null;
				throw cause;
			}
		},
		async revokeSession(token: string | undefined): Promise<void> {
			if (token)
				await client().request('/api/auth/logout', { method: 'POST', token, bearer: true });
		},
		async authenticate(
			mode: 'login' | 'register',
			username: unknown,
			password: unknown,
			preferences: { artworkId?: unknown } = {}
		): Promise<Authenticated | null> {
			try {
				const { user, token, expiresAt } = await client().request<AuthUserToken>(
					`/api/auth/${mode}`,
					{ method: 'POST', body: { username, password, ...preferences }, token: undefined }
				);
				return { user, session: { token, expiresAt } };
			} catch (cause) {
				if (
					cause instanceof ValidationError ||
					(cause instanceof RemoteError && cause.status === 401)
				)
					return null;
				throw cause;
			}
		},
		async changePassword(
			_actor: AuthUser,
			currentPassword: string,
			newPassword: string
		): Promise<AuthSession | null> {
			try {
				const session = await client().request<AuthSession>('/api/account/password', {
					method: 'POST',
					body: { currentPassword, newPassword }
				});
				client().replaceToken(session.token);
				return session;
			} catch (cause) {
				if (cause instanceof ValidationError) return null;
				throw cause;
			}
		}
	};
	return { catalog, inventory, decks, categories, profile, dashboard, inventoryValues, auth };
}

type AuthUserToken = AuthSession & { user: AuthUser };
function webSource(source: string | undefined) {
	if (source !== undefined && source !== 'web') throw new ValidationError('Unsupported web source');
}
