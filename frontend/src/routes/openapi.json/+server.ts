import { SUMMARY_RANGE_MESSAGE } from '@spellbook/contracts/profile.ts';
import { json } from '@sveltejs/kit';
import { PROFILE_ARTWORK, DEFAULT_ARTWORK_ID } from '#lib/profile/artwork.ts';
import { AVATARS } from '#lib/profile/avatars.ts';
import { privateEnv } from '#lib/env/private.ts';
import { SITE_DESCRIPTION, SITE_NAME } from '#lib/seo/site.ts';

type Schema = Record<string, unknown>;

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const array = (name: string): Schema => ({ type: 'array', items: ref(name) });
const nullable = (name: string): Schema => ({ anyOf: [ref(name), { type: 'null' }] });
const object = (
	properties: Record<string, Schema>,
	required = Object.keys(properties)
): Schema => ({
	type: 'object',
	properties,
	required
});
const string: Schema = { type: 'string' };
const integer: Schema = { type: 'integer' };
const quantity: Schema = { type: 'integer', minimum: 1 };
const role: Schema = { enum: ['main', 'sideboard', 'commander', 'companion'] };
const finish: Schema = { enum: ['nonfoil', 'foil'] };
const condition: Schema = { enum: ['NM', 'LP', 'MP', 'HP', 'DMG'] };
const priceSource: Schema = { enum: ['Scryfall', 'Cardmarket', 'MTGJSON'] };
const priceAmount: Schema = {
	type: 'string',
	maxLength: 128,
	pattern: '^(0|[1-9][0-9]*)(\\.[0-9]{1,18})?$'
};
const priceOrigins: Record<string, Schema>[] = [
	{ source: { const: 'Scryfall' }, measure: { enum: ['prices.eur', 'prices.eur_foil'] } },
	{
		source: { const: 'Cardmarket' },
		measure: { enum: ['trend', 'trend-foil'] },
		providerId: string,
		upstream: { const: 'Cardmarket' }
	},
	{
		source: { const: 'MTGJSON' },
		measure: { enum: ['paper.cardmarket.retail.normal', 'paper.cardmarket.retail.foil'] },
		providerId: string,
		upstream: { const: 'Cardmarket' }
	}
];
const priceTime = (day: boolean): Record<string, Schema> =>
	day
		? { timePrecision: { const: 'Day' }, sourceDate: { type: 'string', format: 'date' } }
		: { timePrecision: { const: 'Instant' }, sourceTime: { type: 'string', format: 'date-time' } };
const knownPriceFields = {
	kind: { const: 'Known' },
	printingId: { type: 'string', format: 'uuid' },
	finish,
	links: array('ProductLink'),
	amount: priceAmount,
	currency: { const: 'EUR' },
	freshness: { enum: ['Fresh', 'Stale'] },
	publicationId: { type: 'string', format: 'uuid' },
	observationId: string,
	matchedPrintingId: { type: 'string', format: 'uuid' },
	matchedFinish: finish,
	provenance: { enum: ['Exact', 'EnglishFallback'] }
};
const timestamps = {
	createdAt: { type: 'string', format: 'date-time' },
	updatedAt: { type: 'string', format: 'date-time' }
};
const content = (schema: Schema, mediaType = 'application/json') => ({ [mediaType]: { schema } });
const response = (description: string, schema: Schema) => ({
	description,
	content: content(schema)
});
const requestBody = (schema: Schema, mediaType = 'application/json') => ({
	required: true,
	content: content(schema, mediaType)
});
const pathParameter = (name: string) => ({
	name,
	in: 'path',
	required: true,
	schema: { type: 'string', format: 'uuid' }
});
const inventoryRevision: Schema = { type: 'string', pattern: '^(0|[1-9][0-9]*)$' };
const inventoryQueryProperties: Record<string, Schema> = {
	q: { type: 'string', maxLength: 300, default: '' },
	sets: { type: 'array', maxItems: 100, items: { type: 'string', pattern: '^[a-z0-9]{1,12}$' } },
	finish: { enum: ['all', 'foil', 'nonfoil'], default: 'all' },
	condition: { enum: ['all', 'NM', 'LP', 'MP', 'HP', 'DMG'], default: 'all' },
	sort: { enum: ['name', 'set', 'newest'], default: 'name' },
	dir: { enum: ['asc', 'desc'], default: 'asc' },
	variant: { enum: ['finish', 'condition', 'quantity', null], default: null },
	variantDir: { enum: ['asc', 'desc'], default: 'asc' },
	view: { enum: ['cards', 'groups'], default: 'cards' },
	group: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] },
	offset: { type: 'integer', minimum: 0 },
	limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 }
};
const inventoryParameters = Object.entries(inventoryQueryProperties)
	.filter(([key]) => key !== 'sets')
	.map(([name, schema]) => ({ name, in: 'query', schema }))
	.concat([
		{ name: 'set', in: 'query', schema: inventoryQueryProperties.sets },
		{ name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
		{ name: 'revision', in: 'query', schema: inventoryRevision }
	]);
const authenticated = [{ sessionCookie: [] }, { bearerToken: [] }];
const errors = {
	400: response('Invalid request', ref('ErrorResponse')),
	401: response('A valid session cookie or bearer token is required', ref('ErrorResponse')),
	403: response(
		'Cookie-authenticated mutations require a matching Origin header',
		ref('ErrorResponse')
	),
	500: response('Internal server error', ref('ErrorResponse'))
};
const jsonBodyErrors = {
	413: response('JSON request body exceeds 1 MiB', ref('ErrorResponse')),
	415: response('Use application/json', ref('ErrorResponse'))
};
const requestConflict = response(
	'requestId was already used with another payload, source, or context. Legacy mutation records without a requestHash retain their earlier deduplication behavior.',
	ref('ErrorResponse')
);
const authErrors = {
	400: errors[400],
	403: response('Invalid request origin', ref('ErrorResponse')),
	413: jsonBodyErrors[413],
	415: response('Use application/json', ref('ErrorResponse')),
	429: response('Authentication attempt limit reached', ref('ErrorResponse')),
	500: errors[500]
};
const browserAuthErrors = {
	400: {
		description: 'Form with invalid credentials or registration details',
		content: content(string, 'text/html')
	},
	403: { description: 'Invalid request origin', content: content(string, 'text/html') },
	429: {
		description: 'Authentication attempt limit reached',
		content: content(string, 'text/html')
	}
};
const returnToParameter = {
	name: 'returnTo',
	in: 'query',
	schema: { type: 'string', default: '/mtg/inventory' },
	description:
		'Local path used after authentication; invalid or external paths become /mtg/inventory.'
};
const operation = (summary: string, result: Schema, input?: Schema, idempotent = false) => ({
	summary,
	tags: ['mobile'],
	security: authenticated,
	...(input
		? {
				requestBody: {
					...requestBody(input),
					description: 'A JSON object, at most 1 MiB. Invalid field types return 400.'
				}
			}
		: {}),
	responses: {
		200: response('Successful response', result),
		...errors,
		...(input ? jsonBodyErrors : {}),
		...(idempotent ? { 409: requestConflict } : {})
	}
});
const scanOperation = (summary: string, result: Schema, input?: Schema, idempotent = false) => {
	const value = operation(summary, result, input, idempotent);
	return {
		...value,
		responses: {
			...value.responses,
			503: response('Scan temporarily unavailable; no partial write', ref('ErrorResponse')),
			...(idempotent
				? {
						404: response('Owned Scan session/artifact/review not found', ref('ErrorResponse')),
						409: response(
							'Closed session, changed request intent or LegacyReplayEvidenceRequired for a non-null historical hash lacking original evidence',
							ref('ErrorResponse')
						)
					}
				: {})
		}
	};
};

const categoryOperation = (summary: string, result: Schema, input?: Schema) => ({
	...operation(summary, result, input),
	...(input
		? {
				requestBody: {
					...requestBody(input),
					description: 'A JSON object, at most 16 KiB. Unsupported fields return400.'
				}
			}
		: {}),
	responses: {
		...operation(summary, result, input).responses,
		404: response('Owned Deck, entry or category not found', ref('ErrorResponse')),
		409: response(
			'Stale decision or merge preview, or changed request intent',
			ref('CategoryConflictResponse')
		),
		...(input ? { 413: response('JSON body exceeds16 KiB', ref('ErrorResponse')) } : {})
	}
});
const profileCardProperties = {
	template: { const: 'mtg' },
	name: string,
	frame: { enum: ['white', 'blue', 'black', 'red', 'green', 'gold', 'colorless'] },
	legendary: { type: 'boolean' },
	rarity: { enum: ['common', 'uncommon', 'rare', 'mythic'] },
	manaCost: string,
	typeLine: string,
	rulesText: string,
	flavorText: string,
	power: string,
	toughness: string
};
const SCHEMA = {
	openapi: '3.1.0',
	info: {
		title: `${SITE_NAME} OpenAPI Schema`,
		version: '0.1.0',
		description:
			'Spellbook local account authentication and the versioned MTG API. API mutations affect the authenticated account only.'
	},
	servers: [{ url: privateEnv.APP_ORIGIN }],
	paths: {
		'/api/mobile/v1/mtg/prices': {
			get: {
				summary: 'Read a public exact-finish EUR reference and supplied product links',
				security: [],
				parameters: [
					{
						name: 'printingId',
						in: 'query',
						required: true,
						schema: { type: 'string', format: 'uuid' }
					},
					{ name: 'finish', in: 'query', required: true, schema: finish }
				],
				responses: {
					200: response('Known or evaluated Unknown market reference', ref('PriceResponse')),
					400: response('Invalid or extra query fields', ref('ErrorResponse')),
					503: response('Operational reference read unavailable', ref('ErrorResponse'))
				}
			}
		},
		'/api/mobile/v1/mtg/prices/history': {
			get: {
				summary: 'Read bounded public source history, never historical holdings',
				security: [],
				parameters: [
					{
						name: 'printingId',
						in: 'query',
						required: true,
						schema: { type: 'string', format: 'uuid' }
					},
					{ name: 'finish', in: 'query', required: true, schema: finish },
					{
						name: 'days',
						in: 'query',
						schema: { type: 'integer', minimum: 1, maximum: 90, default: 30 }
					},
					{
						name: 'source',
						in: 'query',
						style: 'form',
						explode: true,
						schema: {
							type: 'array',
							minItems: 1,
							maxItems: 3,
							uniqueItems: true,
							items: priceSource
						}
					}
				],
				responses: {
					200: response(
						'Dated points with gaps, at most one per enabled source per UTC day',
						ref('PriceHistoryResponse')
					),
					400: response('Invalid or extra query fields', ref('ErrorResponse')),
					503: response('Operational source history unavailable', ref('ErrorResponse'))
				}
			}
		},
		'/api/mobile/v1/mtg/inventory/prices': {
			post: {
				...operation(
					'Read references and exact quantity coverage for requested owned entries',
					ref('InventoryPriceResponse'),
					{
						...object({
							entryIds: {
								type: 'array',
								minItems: 1,
								maxItems: 100,
								uniqueItems: true,
								items: { type: 'string', format: 'uuid' }
							}
						}),
						additionalProperties: false
					}
				),
				responses: {
					...operation('', ref('InventoryPriceResponse')).responses,
					...jsonBodyErrors,
					404: response('A requested entry is missing or not owned', ref('ErrorResponse')),
					503: response('Operational reference read unavailable', ref('ErrorResponse'))
				}
			}
		},
		'/api/account/events': {
			get: {
				summary:
					'Stream account-scoped saved-state invalidations; reconnect refetches current state',
				security: authenticated,
				responses: {
					200: {
						description:
							'SSE reset/recovering/auth-expired events have empty data; invalidate data contains only coarse profile/inventory/decks/scan topics. Heartbeats every 15 seconds; no replay or event IDs.',
						content: { 'text/event-stream': { schema: { type: 'string' } } }
					},
					401: response('Authentication required', ref('ErrorResponse')),
					403: response('Foreign or null Origin rejected', ref('ErrorResponse')),
					400: response('Query parameters unsupported', ref('ErrorResponse')),
					503: response('Saved state temporarily unavailable', ref('ErrorResponse'))
				}
			}
		},
		'/api/account/profile': {
			get: operation(
				'Read authenticated account profile and aggregate totals',
				ref('AccountProfile')
			),
			patch: {
				...operation(
					'Patch supplied profile fields atomically; omitted fields remain saved',
					ref('AccountProfile'),
					ref('ProfilePatch')
				),
				responses: {
					...operation('', ref('AccountProfile'), ref('ProfilePatch')).responses,
					400: response('Invalid profile fields', ref('ProfileValidationFailure'))
				}
			}
		},
		'/api/account/dashboard': {
			get: {
				...operation(
					'Read account aggregates, deck availability totals and eight recent entries',
					ref('DashboardSummary')
				),
				responses: {
					...operation('', ref('DashboardSummary')).responses,
					503: response(
						'Stored totals exceed the exact JSON integer reporting range',
						ref('SummaryOutOfRangeResponse')
					)
				}
			}
		},
		'/api/auth/session': {
			get: operation('Inspect selected session without exposing its token hash', ref('SessionInfo'))
		},
		'/api/account/password': {
			post: {
				...operation(
					'Rotate password, revoke other sessions and issue a replacement session',
					ref('PasswordSession'),
					ref('PasswordChange')
				),
				responses: {
					...operation('', ref('PasswordSession'), ref('PasswordChange')).responses,
					429: authErrors[429]
				}
			}
		},
		'/auth/login': {
			parameters: [returnToParameter],
			get: {
				summary: 'Show the username and password login form',
				tags: ['auth'],
				security: [],
				responses: {
					200: { description: 'Login page', content: content(string, 'text/html') },
					303: { description: 'Already authenticated redirect' }
				}
			},
			post: {
				summary: 'Sign in with the browser form',
				tags: ['auth'],
				security: [],
				requestBody: requestBody(ref('LoginRequest'), 'application/x-www-form-urlencoded'),
				responses: {
					303: { description: 'Session cookie set; redirect to the requested local page' },
					...browserAuthErrors
				}
			}
		},
		'/auth/register': {
			parameters: [returnToParameter],
			get: {
				summary: 'Show the local account registration form',
				tags: ['auth'],
				security: [],
				responses: {
					200: { description: 'Registration page', content: content(string, 'text/html') },
					303: { description: 'Already authenticated redirect' }
				}
			},
			post: {
				summary: 'Register a local account with the browser form',
				tags: ['auth'],
				security: [],
				requestBody: requestBody(ref('RegisterRequest'), 'application/x-www-form-urlencoded'),
				responses: {
					303: { description: 'Session cookie set; redirect into the app' },
					...browserAuthErrors
				}
			}
		},
		'/auth/logout': {
			post: {
				summary: 'Revoke the browser session and clear its cookie',
				tags: ['auth'],
				security: [],
				responses: {
					303: { description: 'Redirect to /, including when no session exists' },
					403: browserAuthErrors[403]
				}
			}
		},
		'/api/auth/login': {
			post: {
				summary: 'Exchange local credentials for an opaque session token',
				tags: ['auth'],
				security: [],
				requestBody: requestBody(ref('LoginRequest')),
				responses: {
					200: response('Authenticated session', ref('AuthSession')),
					...authErrors,
					401: response('Invalid credentials', ref('ErrorResponse'))
				}
			}
		},
		'/api/auth/register': {
			post: {
				summary: 'Create a local account and an opaque session token',
				tags: ['auth'],
				security: [],
				requestBody: requestBody(ref('RegisterRequest')),
				responses: {
					201: response('Registered account and session', ref('AuthSession')),
					...authErrors
				}
			}
		},
		'/api/auth/logout': {
			post: {
				summary: 'Revoke the supplied session token',
				tags: ['auth'],
				security: [{ bearerToken: [] }],
				responses: {
					204: { description: 'Session revoked or token already unknown' },
					401: errors[401],
					403: authErrors[403],
					500: errors[500]
				}
			}
		},
		'/api/mobile/v1/mtg/search': {
			get: {
				...operation('Search distinct MTG cards', ref('SearchResponse')),
				parameters: [
					{ name: 'q', in: 'query', schema: { type: 'string', maxLength: 300, default: '' } },
					{
						name: 'limit',
						in: 'query',
						schema: { type: 'integer', default: 20, minimum: 0, maximum: 500 }
					},
					{
						name: 'offset',
						in: 'query',
						schema: { type: 'integer', default: 0, minimum: 0, maximum: 1_000_000 }
					}
				]
			},
			post: {
				...operation(
					'Search distinct MTG cards with filters and optional facets',
					ref('SearchResponse'),
					ref('CatalogSearchRequest')
				),
				description:
					'Filters apply to printings before deduplication by oracle ID. Results, counts, and facets use one published catalog generation. An unpublished catalog returns an empty result with generationId null.'
			}
		},
		'/api/mobile/v1/mtg/cards/{oracleId}/printings': {
			parameters: [pathParameter('oracleId')],
			get: {
				...operation('List printings of a canonical card', ref('SearchResponse')),
				parameters: [
					{
						name: 'limit',
						in: 'query',
						schema: { type: 'integer', default: 100, minimum: 1, maximum: 100 }
					},
					{
						name: 'offset',
						in: 'query',
						schema: { type: 'integer', default: 0, minimum: 0, maximum: 1_000_000 }
					}
				]
			}
		},
		'/api/mobile/v1/mtg/inventory': {
			get: {
				...operation(
					'Read a bounded Inventory window with complete snapshot metrics',
					ref('InventoryPage')
				),
				parameters: inventoryParameters,
				responses: {
					200: response('Current consistent window', ref('InventoryPage')),
					...errors,
					409: response(
						'Inventory changed; reset this query window',
						ref('InventoryRevisionChanged')
					)
				}
			},
			post: operation(
				'Add an idempotent inventory batch',
				ref('InventoryAcknowledgement'),
				ref('InventoryBatchRequest'),
				true
			)
		},
		'/api/mobile/v1/mtg/inventory/batch-add': {
			post: operation(
				'Add an idempotent inventory batch',
				ref('InventoryAcknowledgement'),
				ref('InventoryBatchRequest'),
				true
			)
		},
		'/api/mobile/v1/mtg/inventory/{entryId}': {
			parameters: [pathParameter('entryId')],
			get: {
				...operation('Read an authorized entry and memberships', ref('InventoryEntryDetail')),
				responses: {
					200: response('Current entry', ref('InventoryEntryDetail')),
					...errors,
					404: response('Entry not found', ref('ErrorResponse'))
				}
			},
			patch: operation(
				'Patch independent fields; signed delta floors at one, absolute nonpositive quantity removes',
				ref('InventoryAcknowledgement'),
				ref('InventoryEntryUpdate'),
				true
			),
			delete: operation(
				'Remove reviewed quantity with stable original receipt',
				ref('InventoryAcknowledgement'),
				ref('InventoryRemoveRequest'),
				true
			)
		},
		'/api/mobile/v1/mtg/inventory/{entryId}/location': {
			parameters: [pathParameter('entryId')],
			get: {
				...operation(
					'Locate an authorized entry within this query and revision',
					ref('InventoryLocation')
				),
				parameters: inventoryParameters.map((p) =>
					p.name === 'revision' ? { ...p, required: true } : p
				),
				responses: {
					200: response(
						'Absolute entry index, or null when not in this query',
						ref('InventoryLocation')
					),
					...errors,
					409: response(
						'Inventory changed; reset this query window',
						ref('InventoryRevisionChanged')
					)
				}
			}
		},
		'/api/mobile/v1/mtg/inventory/groups': {
			get: {
				...operation(
					'Read bounded account Groups',
					object({
						revision: inventoryRevision,
						groups: array('InventoryGroupCount'),
						count: integer
					})
				),
				parameters: [
					{ name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0 } },
					{ name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } }
				]
			},
			post: operation(
				'Create an account Group with an original receipt',
				ref('InventoryAcknowledgement'),
				ref('InventoryGroupCreateRequest'),
				true
			)
		},
		'/api/mobile/v1/mtg/inventory/groups/{groupId}': {
			parameters: [pathParameter('groupId')],
			patch: operation(
				'Rename one owned Group',
				ref('InventoryAcknowledgement'),
				ref('InventoryGroupCreateRequest'),
				true
			),
			delete: operation(
				'Delete one owned Group without removing entries',
				ref('InventoryAcknowledgement'),
				object({ requestId: string }),
				true
			)
		},
		'/api/mobile/v1/mtg/inventory/{entryId}/groups': {
			parameters: [pathParameter('entryId')],
			put: operation(
				'Replace whole-entry Group memberships',
				ref('InventoryAcknowledgement'),
				object({
					requestId: string,
					groupIds: { type: 'array', maxItems: 1000, items: { type: 'string', format: 'uuid' } }
				}),
				true
			)
		},
		'/api/mobile/v1/mtg/inventory/{entryId}/position': {
			parameters: [pathParameter('entryId')],
			patch: operation(
				'Explicitly reorder an owned entry; ordinary mutations preserve sparse positions',
				ref('InventoryAcknowledgement'),
				object({
					requestId: string,
					position: { type: 'integer', minimum: 0, maximum: 2147483647 }
				}),
				true
			)
		},

		'/api/mobile/v1/mtg/inventory/bulk': {
			post: operation(
				'Apply idempotent inventory operations',
				ref('InventoryAcknowledgement'),
				ref('InventoryBulkRequest'),
				true
			)
		},
		'/api/mobile/v1/mtg/inventory/import/preview': {
			post: operation(
				'Preview an Arena inventory import',
				ref('InventoryImportPreviewResponse'),
				ref('InventoryImportPreviewRequest')
			)
		},
		'/api/mobile/v1/mtg/inventory/import/commit': {
			post: operation(
				'Commit resolved inventory import lines',
				ref('InventoryImportCommitResponse'),
				ref('InventoryImportCommitRequest'),
				true
			)
		},
		'/api/mobile/v1/mtg/decks': {
			get: {
				...operation('Read Deck library summaries and optional selected Deck', ref('DeckSnapshot')),
				parameters: [{ name: 'deck', in: 'query', schema: string }]
			},
			post: operation(
				'Create a deck and return the account deck list',
				array('Deck'),
				ref('DeckWriteRequest')
			)
		},
		'/api/mobile/v1/mtg/decks/choices': {
			get: {
				...operation('Read bounded owned MTG Deck choices', ref('DeckChoicePage')),
				description:
					'Only id, name and format. Literal case-insensitive name substring, ordered by ICU root name then UUID. Unknown or repeated query parameters return400. No implicit selected Deck; missing or foreign selectedDeckId returns selected:null.',
				parameters: [
					{ name: 'query', in: 'query', schema: { type: 'string', maxLength: 200 } },
					{
						name: 'offset',
						in: 'query',
						schema: { type: 'integer', minimum: 0, maximum: 1000000, default: 0 }
					},
					{
						name: 'limit',
						in: 'query',
						schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 }
					},
					{ name: 'selectedDeckId', in: 'query', schema: { type: 'string', format: 'uuid' } }
				]
			}
		},
		'/api/mobile/v1/mtg/decks/{deckId}': {
			parameters: [pathParameter('deckId')],
			get: operation('Read one owned Deck, bounded availability and legality', ref('DeckDetail')),
			patch: {
				...operation('Patch only supplied metadata fields', ref('Deck'), ref('DeckPatchRequest')),
				responses: {
					200: response('Saved Deck', ref('Deck')),
					...errors,
					...jsonBodyErrors,
					404: response('Deck not found', ref('ErrorResponse')),
					409: response('Stale Description revision; retain draft', ref('DescriptionConflict'))
				}
			},
			delete: operation('Delete a deck', ref('OkResponse'))
		},
		'/api/mobile/v1/mtg/decks/search': {
			get: {
				...operation('Search Catalog with account-owned aggregates for hits', ref('DeckSearch')),
				parameters: [{ name: 'q', in: 'query', schema: string }]
			}
		},
		'/api/mobile/v1/mtg/decks/ownership': {
			get: {
				...operation('Read bounded account-owned printing quantities', array('OwnedPrinting')),
				parameters: [
					{
						name: 'canonicalCardId',
						in: 'query',
						schema: { type: 'array', maxItems: 100, items: string },
						style: 'form',
						explode: true
					}
				]
			}
		},
		'/api/mobile/v1/mtg/decks/{deckId}/availability': {
			parameters: [pathParameter('deckId')],
			get: {
				...operation('Compare one deck with current owned inventory', ref('DeckAvailability')),
				description:
					'Allocates exact printings first, then alternate printings of the same canonical card. Does not reserve inventory or allocate cards across other decks.',
				responses: {
					200: response('Current availability for this deck', ref('DeckAvailability')),
					...errors,
					404: response('Deck not found in this account', ref('ErrorResponse'))
				}
			}
		},

		'/api/mobile/v1/mtg/decks/{deckId}/categories': {
			parameters: [pathParameter('deckId')],
			get: categoryOperation(
				'Read immutable adopted entry categories without initializing',
				ref('DeckEntryCategories')
			)
		},
		'/api/mobile/v1/mtg/decks/{deckId}/categories/initialize': {
			parameters: [pathParameter('deckId')],
			post: categoryOperation(
				'Initialize existing Main entries once and replay the original acknowledgement',
				ref('CategoryAcknowledgement'),
				{
					...object({ requestId: { type: 'string', format: 'uuid' } }),
					additionalProperties: false
				}
			)
		},
		'/api/mobile/v1/mtg/decks/{deckId}/categories/merge-preview': {
			parameters: [pathParameter('deckId')],
			post: categoryOperation(
				'Review complete destination decision before a conflicting merge',
				ref('CategoryMergePreview'),
				{
					...object({
						entryId: string,
						catalogCardId: string,
						role,
						quantity: { ...quantity, maximum: 2147483647 }
					}),
					additionalProperties: false
				}
			)
		},
		'/api/mobile/v1/mtg/deck-cards/{entryId}/category': {
			parameters: [pathParameter('entryId')],
			patch: categoryOperation(
				'Save a Manual primary category, including deliberate Uncategorized',
				ref('CategoryAcknowledgement'),
				{
					...object({
						deckId: string,
						categoryId: { anyOf: [string, { type: 'null' }] },
						expectedDecisionRevision: inventoryRevision,
						requestId: string
					}),
					additionalProperties: false
				}
			)
		},
		'/api/mobile/v1/mtg/decks/{deckId}/cards': {
			parameters: [pathParameter('deckId')],
			post: operation(
				'Add a Catalog printing and return the original saved acknowledgement',
				ref('DeckAcknowledgement'),
				ref('DeckCardAddRequest'),
				true
			)
		},
		'/api/mobile/v1/mtg/deck-cards/{entryId}': {
			parameters: [pathParameter('entryId')],
			patch: operation(
				'Apply quantity, atomic delta or role change; nonpositive quantity removes it',
				ref('DeckAcknowledgement'),
				ref('DeckCardUpdateRequest'),
				true
			),
			delete: {
				...operation('Remove a Deck entry idempotently', ref('DeckAcknowledgement')),
				parameters: [{ name: 'requestId', in: 'query', required: true, schema: string }],
				responses: {
					200: response('Original acknowledgement', ref('DeckAcknowledgement')),
					...errors,
					409: requestConflict
				}
			}
		},
		'/api/mobile/v1/mtg/decks/{deckId}/cards/bulk': {
			parameters: [pathParameter('deckId')],
			post: operation(
				'Apply idempotent Deck card operations and replay original acknowledgement',
				ref('DeckAcknowledgement'),
				ref('DeckCardBulkRequest'),
				true
			)
		},
		'/api/mobile/v1/mtg/decks/import/preview': {
			post: operation(
				'Preview an Arena deck import',
				ref('InventoryImportPreviewResponse'),
				ref('DeckImportPreviewRequest')
			)
		},
		'/api/mobile/v1/mtg/decks/import/commit': {
			post: operation(
				'Create a deck from resolved import lines',
				ref('DeckAcknowledgement'),
				ref('DeckImportCommitRequest'),
				true
			)
		},
		'/api/mobile/v1/mtg/decks/{deckId}/export': {
			parameters: [pathParameter('deckId')],
			get: {
				...operation('Export a deck as Arena text', string),
				parameters: [{ name: 'format', in: 'query', schema: { const: 'arena', default: 'arena' } }],
				responses: {
					200: { description: 'Arena decklist', content: content(string, 'text/plain') },
					...errors
				}
			}
		},
		'/api/mobile/v1/mtg/scan/sessions': {
			get: scanOperation(
				'List the 100 most recently updated scan sessions',
				object({ sessions: array('ScanSession') })
			),
			post: scanOperation('Create a scan session', object({ session: ref('ScanSession') }))
		},
		'/api/mobile/v1/mtg/scan/sessions/{sessionId}/artifacts/{artifactId}/result': {
			parameters: [pathParameter('sessionId'), pathParameter('artifactId')],
			post: {
				...operation(
					'Replace recognition results for an uploaded scan artifact',
					object({ artifact: ref('ScanArtifact'), result: ref('ScanResult') }),
					ref('ExternalScanResultRequest')
				),
				description:
					'Requires an owned artifact in an open or pending-review session. Repeating a result replaces recognition data without creating artifacts or adding inventory. Card identity comes from the catalog. Inventory changes require an explicit review commit.',
				responses: {
					200: response(
						'Stored recognition result',
						object({ artifact: ref('ScanArtifact'), result: ref('ScanResult') })
					),
					...errors,
					503: response('Scan temporarily unavailable; no partial write', ref('ErrorResponse')),
					...jsonBodyErrors,
					404: response('Session or artifact not found in this account', ref('ErrorResponse')),
					409: response('Session is already committed or cancelled', ref('ErrorResponse'))
				}
			}
		},
		'/api/mobile/v1/mtg/scan/artifacts/{artifactId}/image': {
			parameters: [pathParameter('artifactId')],
			get: {
				...operation('Read the original image for an owned scan artifact', {
					type: 'string',
					format: 'binary'
				}),
				responses: {
					200: {
						description: 'Original image, with its media type detected from its bytes',
						headers: {
							'Cache-Control': { schema: { const: 'no-store' } },
							'X-Content-Type-Options': { schema: { const: 'nosniff' } }
						},
						content: {
							...content({ type: 'string', format: 'binary' }, 'image/jpeg'),
							...content({ type: 'string', format: 'binary' }, 'image/png'),
							...content({ type: 'string', format: 'binary' }, 'image/webp')
						}
					},
					...errors,
					503: response('Scan temporarily unavailable; no partial write', ref('ErrorResponse')),
					404: response('Artifact or stored image not found in this account', ref('ErrorResponse')),
					413: response('Stored image exceeds 10 MiB', ref('ErrorResponse')),
					415: response('Stored content is not JPEG, PNG, or WebP', ref('ErrorResponse'))
				}
			}
		},
		'/api/mobile/v1/mtg/scan/sessions/{sessionId}/frames': {
			parameters: [pathParameter('sessionId')],
			post: {
				...operation(
					'Upload and process a scan frame',
					object({ artifact: ref('ScanArtifact'), result: ref('ScanResult') })
				),
				requestBody: requestBody(
					object({
						file: {
							type: 'string',
							format: 'binary',
							description:
								'Nonempty JPEG, PNG, or WebP image up to 10 MiB. Its signature must match the declared MIME type. The multipart body must not exceed 12 MiB and the filename must be at most 255 characters.'
						}
					}),
					'multipart/form-data'
				),
				responses: {
					200: response(
						'Processed scan frame',
						object({ artifact: ref('ScanArtifact'), result: ref('ScanResult') })
					),
					...errors,
					503: response('Scan temporarily unavailable; no partial write', ref('ErrorResponse')),
					404: response('Scan session not found in this account', ref('ErrorResponse')),
					409: response('Scan session is not open for uploads', ref('ErrorResponse')),
					413: response(
						'Multipart body exceeds 12 MiB or the image exceeds 10 MiB',
						ref('ErrorResponse')
					),
					415: response(
						'Use multipart/form-data with a JPEG, PNG, or WebP file whose signature matches its MIME type',
						ref('ErrorResponse')
					),
					502: response('Scan processing failed. Retry the upload.', ref('ErrorResponse'))
				}
			}
		},
		'/api/mobile/v1/mtg/scan/sessions/{sessionId}/result': {
			parameters: [
				pathParameter('sessionId'),
				{
					name: 'limit',
					in: 'query',
					schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 }
				},
				{ name: 'artifactCursor', in: 'query', schema: { type: 'string', format: 'uuid' } },
				{ name: 'reviewCursor', in: 'query', schema: { type: 'string', format: 'uuid' } }
			],
			get: {
				...operation(
					'Read scan artifacts, review items, and the latest result',
					ref('ScanSessionResult')
				),
				responses: {
					200: response('Owned scan session result', ref('ScanSessionResult')),
					...errors,
					503: response('Scan temporarily unavailable; no partial write', ref('ErrorResponse')),
					404: response('Scan session not found in this account', ref('ErrorResponse'))
				}
			}
		},
		'/api/mobile/v1/mtg/scan/review/commit': {
			post: scanOperation(
				'Commit reviewed printing intent; replay preserves original receipt or explicit legacy no-repeat binding',
				ref('ScanCommitAcknowledgement'),
				ref('ScanReviewCommitRequest'),
				true
			)
		}
	},
	components: {
		securitySchemes: {
			sessionCookie: {
				type: 'apiKey',
				in: 'cookie',
				name: 'spellbook_session',
				description: 'Opaque local session cookie set by browser login.'
			},
			bearerToken: {
				type: 'http',
				scheme: 'bearer',
				description: 'Opaque local session token returned by /api/auth/login or /api/auth/register.'
			}
		},
		responses: {
			BadRequest: {
				description: 'Structured error response',
				content: {
					'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } }
				}
			}
		},
		schemas: {
			SummaryOutOfRangeResponse: {
				...object({
					status: { type: 'integer', const: 503 },
					message: { type: 'string', const: SUMMARY_RANGE_MESSAGE }
				}),
				additionalProperties: false
			},
			ProfileUser: object({
				accountId: string,
				username: string,
				email: string,
				avatarId: { enum: AVATARS.map((avatar) => avatar.id) },
				artworkId: { enum: PROFILE_ARTWORK.map((artwork) => artwork.id) }
			}),
			ProfileCard: object(profileCardProperties),
			ProfileTotals: object({
				total: integer,
				names: integer,
				printings: integer,
				sets: integer,
				foils: integer,
				decks: integer
			}),
			AccountProfile: object({
				user: ref('ProfileUser'),
				card: ref('ProfileCard'),
				totals: nullable('ProfileTotals'),
				statsError: { type: ['string', 'null'] }
			}),
			ProfilePatch: {
				...object(
					{
						email: { type: 'string', maxLength: 254 },
						avatarId: { enum: AVATARS.map((avatar) => avatar.id) },
						artworkId: { enum: PROFILE_ARTWORK.map((artwork) => artwork.id) },
						profileCard: {
							...object(profileCardProperties, []),
							additionalProperties: false,
							description: 'Only supplied card fields are merged into the saved card.'
						}
					},
					[]
				),
				additionalProperties: false
			},
			ProfileValidationFailure: object({
				kind: { const: 'ValidationFailed' },
				message: string,
				fields: { type: 'object', additionalProperties: string }
			}),
			SessionInfo: object({
				user: ref('ProfileUser'),
				expiresAt: { type: 'string', format: 'date-time' }
			}),
			PasswordChange: {
				...object({
					currentPassword: { type: 'string', maxLength: 128, writeOnly: true },
					newPassword: { type: 'string', minLength: 12, maxLength: 128, writeOnly: true }
				}),
				additionalProperties: false
			},
			PasswordSession: object({
				token: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' },
				expiresAt: { type: 'string', format: 'date-time' }
			}),
			DashboardDistribution: object({
				label: string,
				quantity: integer,
				share: { type: 'number', minimum: 0, maximum: 1 }
			}),
			DashboardRecentEntry: object({
				id: string,
				catalogCardId: string,
				canonicalCardId: string,
				name: string,
				setCode: string,
				imageUri: string,
				quantity,
				finish,
				condition,
				updatedAt: { type: 'string', format: 'date-time' }
			}),
			DashboardDeck: object({
				id: string,
				name: string,
				format: string,
				required: integer,
				exact: integer,
				alternate: integer,
				missing: integer
			}),
			DashboardSummary: object({
				totals: ref('ProfileTotals'),
				sets: array('DashboardDistribution'),
				finishes: array('DashboardDistribution'),
				conditions: array('DashboardDistribution'),
				recentEntries: { ...array('DashboardRecentEntry'), maxItems: 8 },
				decks: array('DashboardDeck'),
				pendingScanReviews: { type: ['integer', 'null'] }
			}),

			LoginRequest: object({
				username: {
					type: 'string',
					description: 'Case-insensitive username, normalized by trimming and lowercasing.'
				},
				password: { type: 'string', minLength: 12, maxLength: 128, writeOnly: true }
			}),
			RegisterRequest: object(
				{
					username: {
						type: 'string',
						minLength: 3,
						maxLength: 32,
						description:
							'After trimming and lowercasing: starts with a letter or digit; remaining characters are letters, digits, underscores, or hyphens.'
					},
					password: { type: 'string', minLength: 12, maxLength: 128, writeOnly: true },
					artworkId: {
						type: 'string',
						enum: PROFILE_ARTWORK.map((artwork) => artwork.id),
						default: DEFAULT_ARTWORK_ID,
						description: 'Optional profile artwork from the local library.'
					}
				},
				['username', 'password']
			),
			AuthSession: object({
				user: object({
					accountId: string,
					username: string,
					email: string,
					avatarId: { type: 'string', enum: AVATARS.map((avatar) => avatar.id) },
					artworkId: { type: 'string', enum: PROFILE_ARTWORK.map((artwork) => artwork.id) }
				}),
				token: {
					type: 'string',
					pattern: '^[A-Za-z0-9_-]{43}$',
					description:
						'Opaque bearer token. Store securely; the JSON API does not set a browser cookie.'
				},
				expiresAt: { type: 'string', format: 'date-time' }
			}),
			OkResponse: object({ ok: { const: true } }),
			CardDocument: object(
				{
					id: string,
					oracle_id: string,
					name: string,
					printed_name: string,
					normalized_name: string,
					lang: string,
					released_at: string,
					layout: string,
					mana_cost: string,
					cmc: { type: 'number' },
					type_line: string,
					oracle_text: string,
					colors: { type: 'array', items: string },
					color_identity: { type: 'array', items: string },
					keywords: { type: 'array', items: string },
					card_types: { type: 'array', items: string },
					power: string,
					toughness: string,
					rarity: string,
					set_code: string,
					set_name: string,
					collector_number: string,
					image_uri: string,
					image_uri_small: string,
					is_foil_available: { type: 'boolean' },
					is_nonfoil_available: { type: 'boolean' },
					legalities: { type: 'object', additionalProperties: string },
					back_face_name: string,
					back_face_image_uri: string
				},
				['id', 'oracle_id', 'name']
			),
			CatalogFilters: {
				...object(
					{
						colors: {
							type: 'array',
							maxItems: 100,
							items: { enum: ['W', 'U', 'B', 'R', 'G', 'C'] },
							description:
								'Match a nonempty subset of selected colors. C also accepts colorless cards; C alone accepts only colorless cards.'
						},
						colorIdentity: {
							type: 'array',
							maxItems: 100,
							items: { enum: ['W', 'U', 'B', 'R', 'G', 'C'] },
							description:
								'Match color identities that are subsets of the selected palette, including empty identities. C alone accepts only empty identities. C adds no restriction to a colored palette.'
						},
						rarities: {
							type: 'array',
							maxItems: 100,
							items: { enum: ['common', 'uncommon', 'rare', 'mythic'] }
						},
						types: {
							type: 'array',
							maxItems: 100,
							items: {
								enum: [
									'Creature',
									'Instant',
									'Sorcery',
									'Enchantment',
									'Artifact',
									'Planeswalker',
									'Land',
									'Battle',
									'Kindred'
								]
							}
						},
						legalities: {
							type: 'array',
							maxItems: 100,
							items: {
								enum: [
									'standard',
									'pioneer',
									'modern',
									'legacy',
									'vintage',
									'commander',
									'pauper',
									'brawl'
								]
							}
						},
						sets: {
							type: 'array',
							maxItems: 100,
							items: { type: 'string', pattern: '^[A-Za-z0-9]{1,12}$' },
							description: 'Set codes are normalized to lowercase.'
						}
					},
					[]
				),
				additionalProperties: false,
				description:
					'Categories combine with AND. Rarities, types, legalities, and sets combine with OR within each category. Empty arrays apply no restriction.'
			},
			CatalogSearchRequest: {
				...object(
					{
						query: { type: 'string', maxLength: 300, default: '' },
						filters: ref('CatalogFilters'),
						limit: { type: 'integer', minimum: 0, maximum: 500, default: 20 },
						offset: { type: 'integer', minimum: 0, maximum: 1_000_000, default: 0 },
						sort: { enum: ['name:asc', 'name:desc'] },
						facets: { type: 'boolean', default: false }
					},
					[]
				),
				additionalProperties: false
			},
			CatalogFacets: object({
				colors: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
				rarity: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
				set_code: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } }
			}),
			SearchResponse: object(
				{
					query: string,
					hits: array('CardDocument'),
					estimatedTotalHits: { type: 'integer', minimum: 0 },
					processingTimeMs: { type: 'number', minimum: 0 },
					generationId: { type: ['string', 'null'] },
					facets: ref('CatalogFacets')
				},
				['query', 'hits', 'estimatedTotalHits', 'processingTimeMs', 'generationId']
			),

			InventoryAcknowledgement: object(
				{
					requestId: string,
					inventoryId: { type: ['string', 'null'] },
					revision: inventoryRevision,
					changes: {
						type: 'array',
						maxItems: 1000,
						items: object({
							entryId: string,
							catalogCardId: string,
							finish,
							condition,
							quantity: { type: 'integer', minimum: 0, maximum: 2147483647 },
							delta: integer,
							notesRevision: inventoryRevision
						})
					},
					removedEntryIds: { type: 'array', items: string },
					groups: { type: 'array', items: object({ groupId: string, name: string }, ['groupId']) },
					removedGroupIds: { type: 'array', items: string },
					memberships: {
						type: 'array',
						items: object({ entryId: string, groupIds: { type: 'array', items: string } })
					},
					legacy: {
						const: true,
						description:
							'Historical request without a stored original acknowledgement: no current state is substituted.'
					},
					import: object({
						resolvedCount: integer,
						unresolvedCount: integer,
						ambiguousCount: integer
					})
				},
				[
					'requestId',
					'inventoryId',
					'revision',
					'changes',
					'removedEntryIds',
					'groups',
					'removedGroupIds',
					'memberships'
				]
			),
			InventoryGroupCreateRequest: object({
				requestId: string,
				name: { type: 'string', minLength: 1, maxLength: 256 }
			}),
			InventoryRemoveRequest: object({
				requestId: string,
				expectedQuantity: { type: 'integer', minimum: 1, maximum: 2147483647 }
			}),
			InventoryBatchItem: object(
				{
					catalogCardId: { type: 'string', format: 'uuid' },
					finish,
					condition,
					quantity: { type: 'integer', minimum: 1, maximum: 2147483647 },
					notes: { type: 'string', maxLength: 4000 },
					notesRevision: inventoryRevision
				},
				['catalogCardId', 'quantity']
			),
			InventoryBatchRequest: object(
				{
					requestId: { type: 'string', minLength: 1 },
					source: { enum: ['mobile', 'web', 'import', 'scan', 'scan_review'], default: 'mobile' },
					items: { type: 'array', minItems: 1, maxItems: 1000, items: ref('InventoryBatchItem') }
				},
				['requestId', 'items']
			),
			InventoryEntryUpdate: {
				...object(
					{
						requestId: string,
						quantity: { type: 'integer', minimum: -2147483647, maximum: 2147483647 },
						delta: { type: 'integer', minimum: -2147483647, maximum: 2147483647 },
						notes: { type: 'string', maxLength: 4000 },
						notesRevision: inventoryRevision
					},
					['requestId']
				),
				description:
					'Supply quantity or delta, not both. Omitted fields remain unchanged. Notes requires notesRevision. Zero delta is invalid. At least one field is required.'
			},
			DeckWriteRequest: object(
				{
					name: string,
					description: { type: 'string', default: '' },
					format: { type: 'string', default: 'Commander' }
				},
				['name']
			),
			DeckPatchRequest: object(
				{
					name: string,
					format: string,
					description: string,
					descriptionRevision: { type: 'string', pattern: '^[0-9]+$' }
				},
				[]
			),
			DeckCardAddRequest: object(
				{
					requestId: string,
					catalogCardId: string,
					canonicalCardId: string,
					name: string,
					setCode: string,
					imageUri: string,
					quantity: { type: 'integer', minimum: 1, default: 1 },
					role: { ...role, default: 'main' }
				},
				['requestId', 'catalogCardId', 'canonicalCardId', 'name']
			),
			DeckCardUpdateRequest: object(
				{
					requestId: string,
					quantity: integer,
					delta: {
						...integer,
						description:
							'Nonzero signed quantity delta. Ordinary decreases stop at one copy; use DELETE to remove the entry.'
					},
					role,
					categoryPreview: { type: 'string', maxLength: 12000 }
				},
				['requestId']
			),
			ScanCandidate: {
				allOf: [
					object({
						catalogCardId: { type: 'string', format: 'uuid' },
						canonicalCardId: { type: 'string', format: 'uuid' },
						oracleId: { type: 'string', format: 'uuid' },
						name: string,
						setCode: string,
						collectorNumber: string,
						imageUri: string,
						similarityScore: { type: 'integer', minimum: 0, maximum: 2147483647 },
						ocrScore: { type: 'integer', minimum: 0, maximum: 2147483647 },
						finalScore: { type: 'integer', minimum: 0, maximum: 2147483647 },
						matchReason: string
					}),
					object({ confidence: { type: 'number', minimum: 0, maximum: 1 } }, [])
				]
			},
			ExternalScanResultRequest: {
				...object({
					status: { enum: ['matched', 'ambiguous', 'no_match', 'failed'] },
					modelVersion: { type: 'string', minLength: 1, maxLength: 128 },
					candidates: {
						type: 'array',
						maxItems: 20,
						description: 'Each catalogCardId must identify a different printing.',
						items: object(
							{
								catalogCardId: { type: 'string', format: 'uuid' },
								confidence: { type: 'number', minimum: 0, maximum: 1 },
								notes: { type: 'string', maxLength: 500 }
							},
							['catalogCardId', 'confidence']
						)
					}
				}),
				oneOf: [
					{ properties: { status: { const: 'matched' }, candidates: { minItems: 1 } } },
					{ properties: { status: { const: 'ambiguous' }, candidates: { minItems: 2 } } },
					{ properties: { status: { enum: ['no_match', 'failed'] }, candidates: { maxItems: 0 } } }
				]
			},
			ScanResult: object({
				artifactId: { type: 'string', format: 'uuid' },
				status: { enum: ['matched', 'ambiguous', 'no_match', 'failed'] },
				qualityScore: { type: 'integer', minimum: 0, maximum: 2147483647 },
				embeddingModelVersion: { type: 'string', minLength: 1, maxLength: 128 },
				ocrModelVersion: { type: 'string', minLength: 1, maxLength: 128 },
				ocrTokens: {
					...object(
						{
							name: { type: 'string', maxLength: 5000 },
							setCode: { type: 'string', maxLength: 5000 },
							collectorNumber: { type: 'string', maxLength: 5000 }
						},
						[]
					),
					additionalProperties: false
				},
				candidates: { ...array('ScanCandidate'), maxItems: 20 }
			}),
			ScanSession: object({
				id: { type: 'string', format: 'uuid' },
				game: { const: 'mtg' },
				status: { enum: ['open', 'pending_review', 'committed', 'cancelled'] },
				...timestamps
			}),
			ScanArtifact: {
				allOf: [
					ref('ScanResult'),
					object({
						id: { type: 'string', format: 'uuid' },
						sessionId: { type: 'string', format: 'uuid' },
						...timestamps
					})
				]
			},
			ScanReviewItem: {
				allOf: [
					ref('ScanCandidate'),
					object({
						id: { type: 'string', format: 'uuid' },
						sessionId: { type: 'string', format: 'uuid' },
						scanArtifactId: { type: 'string', format: 'uuid' },
						finish,
						condition,
						quantity: { ...quantity, maximum: 2147483647 },
						...timestamps
					})
				]
			},
			ScanSessionResult: object({
				session: ref('ScanSession'),
				artifacts: { ...array('ScanArtifact'), maxItems: 100 },
				reviewItems: { ...array('ScanReviewItem'), maxItems: 100 },
				artifactCount: { type: 'integer', minimum: 0 },
				reviewCount: { type: 'integer', minimum: 0 },
				nextArtifactCursor: { type: ['string', 'null'], format: 'uuid' },
				nextReviewCursor: { type: ['string', 'null'], format: 'uuid' },
				lastResult: nullable('ScanResult')
			}),
			ScanReviewIntent: object(
				{
					id: { type: 'string', format: 'uuid' },
					scanArtifactId: { type: 'string', format: 'uuid' },
					catalogCardId: { type: 'string', format: 'uuid' },
					finish,
					condition,
					quantity: { ...quantity, maximum: 2147483647 }
				},
				['scanArtifactId', 'catalogCardId', 'finish', 'condition', 'quantity']
			),
			ScanLegacyVerification: object(
				{
					version: { enum: ['scan-v1', 'scan-v2'] },
					sessionId: { type: 'string', format: 'uuid' },
					items: {
						type: 'array',
						minItems: 1,
						maxItems: 100,
						items: {
							allOf: [
								ref('ScanReviewIntent'),
								object(
									{
										sessionId: { type: 'string', format: 'uuid' },
										canonicalCardId: { type: 'string', maxLength: 36 },
										oracleId: { type: 'string', maxLength: 36 },
										name: { type: 'string', maxLength: 500 },
										setCode: { type: 'string', maxLength: 100 },
										collectorNumber: { type: 'string', maxLength: 100 },
										imageUri: { type: 'string', maxLength: 2000 },
										similarityScore: { type: 'integer', minimum: 0, maximum: 100 },
										ocrScore: { type: 'integer', minimum: 0, maximum: 100 },
										finalScore: { type: 'integer', minimum: 0, maximum: 100 },
										matchReason: { type: 'string', maxLength: 500 }
									},
									['sessionId', 'similarityScore', 'ocrScore', 'finalScore', 'matchReason']
								)
							]
						}
					}
				},
				['version', 'items']
			),
			ScanReviewCommitRequest: object(
				{
					requestId: { type: 'string', minLength: 1, maxLength: 256 },
					sessionId: { type: 'string', format: 'uuid' },
					items: { ...array('ScanReviewIntent'), minItems: 1, maxItems: 100 },
					legacyVerification: ref('ScanLegacyVerification')
				},
				['requestId', 'sessionId', 'items']
			),
			ScanCommitAcknowledgement: {
				oneOf: [
					object({
						kind: { const: 'Committed' },
						sessionId: { type: 'string', format: 'uuid' },
						acknowledgement: ref('InventoryAcknowledgement')
					}),
					object({
						kind: { const: 'LegacyNoRepeat' },
						requestId: string,
						binding: { enum: ['VerifiedLegacyHash', 'UnverifiedLegacyHash'] },
						acknowledgement: ref('InventoryAcknowledgement')
					})
				]
			},
			ErrorResponse: {
				type: 'object',
				properties: {
					status: { type: 'integer', minimum: 400, maximum: 599 },
					message: { type: 'string' }
				},
				required: ['status', 'message']
			},
			CardIdentity: {
				type: 'object',
				required: ['catalogCardId', 'canonicalCardId', 'name'],
				properties: {
					catalogCardId: { type: 'string' },
					canonicalCardId: { type: 'string' },
					name: { type: 'string' },
					setCode: { type: 'string' },
					imageUri: { type: 'string' }
				}
			},
			EntryTarget: {
				type: 'object',
				required: ['entryId'],
				properties: { entryId: { type: 'string', format: 'uuid' } }
			},
			PricePublication: {
				oneOf: ['Scryfall', 'Cardmarket', 'MTGJSON'].map((source) =>
					object({
						id: { type: 'string', format: 'uuid' },
						source: { const: source },
						bulkType: string,
						...priceTime(source === 'MTGJSON'),
						payloadDigest: string,
						extractorVersion: integer,
						mappingVersion: integer,
						ingestedAt: { type: 'string', format: 'date-time' }
					})
				)
			},
			ProductLink: object({
				provider: { enum: ['Cardmarket', 'TCGplayer', 'Cardhoarder'] },
				url: { type: 'string', format: 'uri' },
				printingId: { type: 'string', format: 'uuid' },
				provenance: { enum: ['Exact', 'EnglishFallback'] }
			}),
			PriceReference: {
				oneOf: [
					...priceOrigins.map((origin, index) =>
						object({
							...knownPriceFields,
							...origin,
							...priceTime(index === 2),
							...(index === 2
								? {
										asOf: { type: 'string', format: 'date-time' },
										freshnessPolicy: { const: 'day-upper-bound-utc-start-v1' }
									}
								: {})
						})
					),
					object({
						kind: { const: 'Unknown' },
						printingId: { type: 'string', format: 'uuid' },
						finish,
						links: array('ProductLink'),
						reason: {
							enum: [
								'SourceUnavailable',
								'PrintingMissing',
								'AmountMissing',
								'ReferenceExpired',
								'UnsupportedFinish',
								'AmbiguousLanguageMapping',
								'MissingVariantEvidence',
								'AmbiguousSourceMapping'
							]
						}
					})
				]
			},
			PriceSourceStatus: object(
				{
					source: priceSource,
					enabled: { type: 'boolean' },
					kind: { enum: ['Disabled', 'NeverAttempted', 'Succeeded', 'Failed'] },
					attemptedAt: { type: 'string', format: 'date-time' },
					lastSuccessfulPublicationId: { type: 'string', format: 'uuid' }
				},
				['source', 'enabled', 'kind']
			),
			PriceHistoryPoint: {
				oneOf: priceOrigins.map((origin, index) =>
					object({
						...origin,
						...priceTime(index === 2),
						printingId: { type: 'string', format: 'uuid' },
						finish,
						day: { type: 'string', format: 'date' },
						amount: priceAmount,
						currency: { const: 'EUR' },
						publicationId: { type: 'string', format: 'uuid' },
						observationId: string,
						matchedPrintingId: { type: 'string', format: 'uuid' },
						matchedFinish: finish,
						provenance: { enum: ['Exact', 'EnglishFallback'] },
						mappingVersion: integer,
						pointArtifact: {
							const: index === 0 ? 'ScryfallBulk' : index === 1 ? 'CardmarketGuide' : 'AllPrices'
						},
						pointPayloadDigest: string
					})
				)
			},
			PriceHistoryResponse: object({
				asOf: { type: 'string', format: 'date-time' },
				window: object({
					from: { type: 'string', format: 'date' },
					to: { type: 'string', format: 'date' },
					days: { type: 'integer', minimum: 1, maximum: 90 }
				}),
				sourceStatuses: { ...array('PriceSourceStatus'), maxItems: 3 },
				publications: array('PricePublication'),
				points: { ...array('PriceHistoryPoint'), maxItems: 270 }
			}),
			PriceRefreshStatus: object(
				{
					kind: { enum: ['NeverAttempted', 'Succeeded', 'Failed'] },
					attemptedAt: { type: 'string', format: 'date-time' }
				},
				['kind']
			),
			PriceResponse: object({
				evaluatedAt: { type: 'string', format: 'date-time' },
				publications: array('PricePublication'),
				refreshStatus: ref('PriceRefreshStatus'),
				sourceStatuses: { ...array('PriceSourceStatus'), maxItems: 3 },
				results: { ...array('PriceReference'), maxItems: 100 }
			}),
			InventoryPriceResponse: object({
				evaluatedAt: { type: 'string', format: 'date-time' },
				publications: array('PricePublication'),
				refreshStatus: ref('PriceRefreshStatus'),
				sourceStatuses: { ...array('PriceSourceStatus'), maxItems: 3 },
				results: {
					type: 'array',
					maxItems: 100,
					items: object({
						entryId: { type: 'string', format: 'uuid' },
						quantity,
						reference: ref('PriceReference')
					})
				},
				coverage: object({
					coveredQuantity: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
					staleQuantity: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
					unknownQuantity: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER }
				})
			}),
			InventoryStats: {
				type: 'object',
				required: ['total', 'unique', 'foils', 'sets', 'completedSets'],
				properties: {
					total: { type: 'integer' },
					unique: { type: 'integer' },
					foils: { type: 'integer' },
					sets: { type: 'integer' },
					completedSets: { type: 'integer' }
				}
			},
			InventoryRevisionChanged: object({
				kind: { const: 'RevisionChanged' },
				revision: inventoryRevision
			}),
			InventoryWindowQuery: object(inventoryQueryProperties),
			InventoryWindowEntry: object({
				id: { type: 'string', format: 'uuid' },
				accountId: string,
				inventoryId: { type: 'string', format: 'uuid' },
				game: string,
				catalogCardId: string,
				canonicalCardId: string,
				name: string,
				setCode: string,
				imageUri: string,
				quantity,
				finish,
				condition,
				notes: string,
				notesRevision: inventoryRevision,
				spellbookPosition: { type: 'integer', minimum: 0 },
				...timestamps
			}),
			InventoryGroupCount: object({
				id: { type: 'string', format: 'uuid' },
				name: string,
				entryCount: { type: 'integer', minimum: 0 },
				quantity: { type: 'integer', minimum: 0 }
			}),
			InventoryCounts: object({
				entryCount: { type: 'integer', minimum: 0 },
				copyCount: { type: 'integer', minimum: 0 }
			}),
			InventoryTotals: object({
				entryCount: { type: 'integer', minimum: 0 },
				copyCount: { type: 'integer', minimum: 0 },
				canonicalCardCount: { type: 'integer', minimum: 0 },
				foilEntryCount: { type: 'integer', minimum: 0 },
				setCount: { type: 'integer', minimum: 0 }
			}),
			InventoryPage: object({
				kind: { const: 'Page' },
				query: ref('InventoryWindowQuery'),
				queryKey: string,
				revision: inventoryRevision,
				entries: { ...array('InventoryWindowEntry'), maxItems: 500 },
				memberships: {
					type: 'array',
					items: object({
						entryId: { type: 'string', format: 'uuid' },
						groupId: { type: 'string', format: 'uuid' }
					})
				},
				groups: array('InventoryGroupCount'),
				groupPage: { ...array('InventoryGroupCount'), maxItems: 500 },
				groupCount: { type: 'integer', minimum: 0 },
				matching: ref('InventoryCounts'),
				totals: ref('InventoryTotals'),
				sets: { type: 'array', items: object({ code: string, name: string }) },
				setProgress: {
					anyOf: [
						object({
							setCode: string,
							ownedCanonicalCount: { type: 'integer', minimum: 0 },
							catalogCanonicalCount: { type: 'integer', minimum: 0 }
						}),
						{ type: 'null' }
					]
				},
				viewedAt: { type: 'string', format: 'date-time' }
			}),
			InventoryEntryDetail: object({
				entry: ref('InventoryWindowEntry'),
				memberships: { type: 'array', items: { type: 'string', format: 'uuid' } },
				revision: inventoryRevision
			}),
			InventoryLocation: object({
				kind: { const: 'Location' },
				revision: inventoryRevision,
				index: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] }
			}),
			InventoryCard: {
				type: 'object',
				required: [
					'id',
					'inventoryId',
					'accountId',
					'game',
					'catalogCardId',
					'canonicalCardId',
					'name',
					'setCode',
					'imageUri',
					'quantity',
					'finish',
					'condition',
					'notes',
					'spellbookPosition'
				],
				properties: {
					id: { type: 'string', format: 'uuid' },
					inventoryId: { type: 'string', format: 'uuid' },
					accountId: { type: 'string' },
					game: { type: 'string' },
					catalogCardId: { type: 'string' },
					canonicalCardId: { type: 'string' },
					name: { type: 'string' },
					setCode: { type: 'string' },
					imageUri: { type: 'string' },
					quantity: { type: 'integer', minimum: 1 },
					finish: { enum: ['nonfoil', 'foil'] },
					condition: { enum: ['NM', 'LP', 'MP', 'HP', 'DMG'] },
					notes: { type: 'string' },
					spellbookPosition: { type: 'integer', minimum: 0 },
					createdAt: { type: 'string', format: 'date-time' },
					updatedAt: { type: 'string', format: 'date-time' }
				}
			},
			InventoryRecord: {
				type: 'object',
				required: ['id', 'accountId', 'game'],
				properties: {
					id: { type: 'string', format: 'uuid' },
					accountId: { type: 'string' },
					game: { type: 'string' },
					createdAt: { type: 'string', format: 'date-time' },
					updatedAt: { type: 'string', format: 'date-time' }
				}
			},
			AvailabilityCounts: object({
				required: { type: 'integer', minimum: 0 },
				exact: { type: 'integer', minimum: 0 },
				alternate: { type: 'integer', minimum: 0 },
				missing: { type: 'integer', minimum: 0 }
			}),
			DeckAvailability: object({
				deckId: { type: 'string', format: 'uuid' },
				entries: {
					type: 'array',
					items: {
						allOf: [
							ref('AvailabilityCounts'),
							object({ entryId: { type: 'string', format: 'uuid' } })
						]
					}
				},
				totals: ref('AvailabilityCounts')
			}),
			MutationRequestRecord: {
				type: 'object',
				required: ['accountId', 'requestId', 'source', 'status', 'requestHash'],
				properties: {
					accountId: { type: 'string' },
					requestId: { type: 'string' },
					requestHash: {
						type: ['string', 'null'],
						description: 'Normalized mutation fingerprint. Legacy records may be null.'
					},
					source: { type: 'string' },
					status: { type: 'string' },
					createdAt: { type: 'string', format: 'date-time' },
					updatedAt: { type: 'string', format: 'date-time' }
				}
			},
			InventorySnapshot: {
				type: 'object',
				required: ['inventory', 'cards', 'stats', 'mutationRequests'],
				properties: {
					inventory: {
						oneOf: [{ $ref: '#/components/schemas/InventoryRecord' }, { type: 'null' }]
					},
					cards: { type: 'array', items: { $ref: '#/components/schemas/InventoryCard' } },
					stats: { $ref: '#/components/schemas/InventoryStats' },
					mutationRequests: {
						type: 'array',
						items: { $ref: '#/components/schemas/MutationRequestRecord' }
					}
				}
			},
			DeckChoice: {
				...object({ id: { type: 'string', format: 'uuid' }, name: string, format: string }),
				additionalProperties: false
			},
			DeckChoicePage: {
				...object({
					items: { ...array('DeckChoice'), maxItems: 50 },
					nextOffset: {
						anyOf: [{ type: 'integer', minimum: 0, maximum: 1000000 }, { type: 'null' }]
					},
					selected: nullable('DeckChoice')
				}),
				additionalProperties: false
			},
			Deck: {
				type: 'object',
				required: [
					'id',
					'accountId',
					'game',
					'name',
					'description',
					'format',
					'descriptionRevision',
					'compositionRevision',
					'createdAt',
					'updatedAt'
				],
				properties: {
					id: { type: 'string', format: 'uuid' },
					accountId: { type: 'string' },
					game: { type: 'string' },
					name: { type: 'string' },
					description: { type: 'string' },
					format: { type: 'string' },
					descriptionRevision: { type: 'string', pattern: '^[0-9]+$' },
					compositionRevision: { type: 'string', pattern: '^[0-9]+$' },
					createdAt: { type: 'string', format: 'date-time' },
					updatedAt: { type: 'string', format: 'date-time' }
				}
			},
			DeckCard: {
				type: 'object',
				required: [
					'id',
					'deckId',
					'accountId',
					'game',
					'catalogCardId',
					'canonicalCardId',
					'name',
					'setCode',
					'imageUri',
					'quantity',
					'role'
				],
				properties: {
					id: { type: 'string', format: 'uuid' },
					deckId: { type: 'string', format: 'uuid' },
					accountId: { type: 'string' },
					game: { type: 'string' },
					catalogCardId: { type: 'string' },
					canonicalCardId: { type: 'string' },
					name: { type: 'string' },
					setCode: { type: 'string' },
					imageUri: { type: 'string' },
					quantity: { type: 'integer', minimum: 1 },
					role: { enum: ['main', 'sideboard', 'commander', 'companion'] },
					createdAt: { type: 'string', format: 'date-time' },
					updatedAt: { type: 'string', format: 'date-time' }
				}
			},
			OwnedPrinting: object({ catalogCardId: string, canonicalCardId: string, quantity: integer }),
			AvailabilityCount: object({ exact: integer, alternate: integer, missing: integer }),
			DeckSnapshot: object({
				decks: array('Deck'),
				deckCards: array('DeckCard'),
				deckTotals: { type: 'object', additionalProperties: integer },
				deckCovers: { type: 'object', additionalProperties: object({ imageUri: string }) },
				availability: { type: 'object', additionalProperties: ref('AvailabilityCount') },
				ownedByCanonical: { type: 'object', additionalProperties: integer },
				ownedPrintings: array('OwnedPrinting')
			}),
			DeckDetail: {
				allOf: [
					ref('DeckSnapshot'),
					object({
						warnings: { type: 'array', items: { type: 'object' } },
						deckDocuments: { type: 'object', additionalProperties: ref('CardDocument') }
					})
				]
			},
			DeckSearch: {
				allOf: [
					ref('SearchResponse'),
					object({
						ownedPrintings: array('OwnedPrinting'),
						ownedByCanonical: { type: 'object', additionalProperties: integer }
					})
				]
			},
			DescriptionConflict: object({
				status: { const: 409 },
				kind: { const: 'DescriptionConflict' },
				message: string,
				description: string,
				descriptionRevision: string
			}),

			EntryDefinition: object({
				id: string,
				origin: {
					enum: [
						'lands',
						'board-wipes',
						'counterspells',
						'removal',
						'ramp',
						'draw',
						'protection',
						'recursion'
					]
				},
				name: string,
				version: integer,
				policyVersion: integer,
				mappingVersion: integer,
				priority: integer,
				displayOrder: integer,
				rootId: { anyOf: [string, { type: 'null' }] },
				descendants: { type: 'boolean' },
				excludeLand: { type: 'boolean' }
			}),
			CategoryPredicateEvidence: object({
				origin: string,
				result: { enum: ['True', 'False', 'Unknown'] },
				matchedTagIds: { type: 'array', items: string }
			}),
			CategoryEvidence: object({
				predicates: array('CategoryPredicateEvidence'),
				catalogGenerationId: { anyOf: [string, { type: 'null' }] },
				oraclePublicationId: { anyOf: [string, { type: 'null' }] },
				sourceTime: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
				payloadDigest: { anyOf: [string, { type: 'null' }] },
				parserVersion: { anyOf: [integer, { type: 'null' }] },
				printingId: string,
				rawOracleId: { anyOf: [string, { type: 'null' }] },
				types: { anyOf: [{ type: 'array', items: string }, { type: 'null' }] },
				transformVersion: { anyOf: [integer, { type: 'null' }] }
			}),
			EntryCategoryDecision: object({
				entryId: string,
				categoryId: { anyOf: [string, { type: 'null' }] },
				state: { enum: ['Automatic', 'Manual', 'Pending'] },
				revision: inventoryRevision,
				evidence: nullable('CategoryEvidence')
			}),
			DeckEntryCategories: object({
				deckId: string,
				initialized: { type: 'boolean' },
				decisionRevision: inventoryRevision,
				definitions: array('EntryDefinition'),
				decisions: array('EntryCategoryDecision'),
				sourceStatus: object({
					kind: { enum: ['NeverAttempted', 'Succeeded', 'Failed'] },
					sourceTime: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] }
				})
			}),
			CategoryAcknowledgement: object({
				requestId: string,
				deckId: string,
				decisionRevision: inventoryRevision,
				entryIds: { type: 'array', items: string }
			}),
			CategorySourceTokens: object({
				catalogGenerationId: { anyOf: [string, { type: 'null' }] },
				oraclePublicationId: { anyOf: [string, { type: 'null' }] },
				policy: string
			}),
			CategoryMergePreview: object({
				required: { type: 'boolean' },
				token: string,
				source: nullable('EntryCategoryDecision'),
				destination: nullable('EntryCategoryDecision'),
				destinationEntryId: { anyOf: [string, { type: 'null' }] },
				resultingQuantity: quantity,
				compositionRevision: inventoryRevision,
				decisionRevision: inventoryRevision,
				sourceTokens: ref('CategorySourceTokens')
			}),
			CategoryConflictResponse: {
				oneOf: [
					object({
						kind: { const: 'CategoryConflict' },
						message: string,
						latest: ref('DeckEntryCategories')
					}),
					object({
						kind: { const: 'CategoryMergeConflict' },
						message: string,
						preview: ref('CategoryMergePreview')
					}),
					ref('ErrorResponse')
				]
			},
			DeckAcknowledgement: object(
				{
					requestId: string,
					deckId: string,
					revision: { type: 'string', pattern: '^[0-9]+$' },
					changes: {
						type: 'array',
						items: object({
							entryId: string,
							catalogCardId: string,
							role,
							quantity: integer,
							delta: integer
						})
					},
					removedEntryIds: { type: 'array', items: string },
					categoryDecisionRevision: inventoryRevision,
					categoryEntryIds: { type: 'array', items: string }
				},
				['requestId', 'deckId', 'revision', 'changes', 'removedEntryIds']
			),
			InventoryAddOperation: {
				type: 'object',
				required: ['op', 'finish', 'condition', 'quantity'],
				anyOf: [{ required: ['catalogCardId'] }, { required: ['card'] }],
				properties: {
					op: { const: 'add' },
					catalogCardId: { type: 'string', format: 'uuid' },
					card: object({ catalogCardId: { type: 'string', format: 'uuid' } }),
					finish: { enum: ['nonfoil', 'foil'] },
					condition: { enum: ['NM', 'LP', 'MP', 'HP', 'DMG'] },
					quantity: { type: 'integer', minimum: 1 },
					notes: { type: 'string', maxLength: 4000 },
					notesRevision: inventoryRevision
				}
			},
			InventoryTargetOperation: {
				oneOf: [
					{
						...object(
							{
								op: { const: 'set' },
								target: ref('EntryTarget'),
								quantity: integer,
								notes: string,
								notesRevision: inventoryRevision
							},
							['op', 'target']
						),
						anyOf: [{ required: ['quantity'] }, { required: ['notes'] }]
					},
					object(
						{
							op: { const: 'decrement' },
							target: ref('EntryTarget'),
							quantity,
							notes: string,
							notesRevision: inventoryRevision
						},
						['op', 'target', 'quantity']
					),
					object({ op: { const: 'remove' }, target: ref('EntryTarget'), notes: string }, [
						'op',
						'target'
					])
				]
			},
			InventoryBulkOperation: {
				oneOf: [
					{ $ref: '#/components/schemas/InventoryAddOperation' },
					{ $ref: '#/components/schemas/InventoryTargetOperation' }
				]
			},
			InventoryBulkRequest: {
				type: 'object',
				required: ['requestId', 'operations'],
				properties: {
					requestId: { type: 'string' },
					source: { enum: ['mobile', 'web', 'import', 'scan', 'scan_review'] },
					operations: {
						type: 'array',
						minItems: 1,
						items: { $ref: '#/components/schemas/InventoryBulkOperation' }
					}
				}
			},
			DeckAddOperation: {
				type: 'object',
				required: ['op', 'card', 'quantity'],
				properties: {
					op: { const: 'add' },
					card: { $ref: '#/components/schemas/CardIdentity' },
					quantity: { type: 'integer', minimum: 1 },
					role: { enum: ['main', 'sideboard', 'commander', 'companion'] }
				}
			},
			DeckTargetOperation: {
				oneOf: [
					object({ op: { const: 'set' }, target: ref('EntryTarget'), quantity: integer }, [
						'op',
						'target',
						'quantity'
					]),
					object({ op: { const: 'decrement' }, target: ref('EntryTarget'), quantity }, [
						'op',
						'target',
						'quantity'
					]),
					object({ op: { const: 'increment' }, target: ref('EntryTarget'), quantity }),
					object(
						{
							op: { const: 'replace' },
							target: ref('EntryTarget'),
							catalogCardId: string,
							quantity,
							role,
							categoryPreview: string
						},
						['op', 'target', 'catalogCardId', 'quantity', 'role']
					),
					object(
						{ op: { const: 'move' }, target: ref('EntryTarget'), role, categoryPreview: string },
						['op', 'target', 'role']
					),
					object({ op: { const: 'remove' }, target: ref('EntryTarget') }, ['op', 'target'])
				]
			},
			DeckCardBulkOperation: {
				oneOf: [
					{ $ref: '#/components/schemas/DeckAddOperation' },
					{ $ref: '#/components/schemas/DeckTargetOperation' }
				]
			},
			DeckCardBulkRequest: {
				type: 'object',
				required: ['requestId', 'operations'],
				properties: {
					requestId: { type: 'string' },
					source: { enum: ['mobile', 'web', 'import'] },
					operations: {
						type: 'array',
						minItems: 1,
						items: { $ref: '#/components/schemas/DeckCardBulkOperation' }
					}
				}
			},
			ImportPreviewWarning: {
				type: 'object',
				required: ['code', 'message'],
				properties: {
					code: { type: 'string' },
					message: { type: 'string' }
				}
			},
			UnresolvedImportLine: {
				type: 'object',
				required: ['line', 'reason'],
				properties: {
					line: {
						anyOf: [
							{
								type: 'object',
								required: ['raw', 'role'],
								properties: {
									raw: { type: 'string' },
									role: { type: 'string' }
								}
							},
							{
								type: 'object',
								required: ['raw', 'normalizedName', 'quantity', 'role'],
								properties: {
									raw: { type: 'string' },
									name: { type: 'string' },
									normalizedName: { type: 'string' },
									quantity: { type: 'integer' },
									role: { type: 'string' },
									setCode: { type: ['string', 'null'] },
									collectorNumber: { type: ['string', 'null'] }
								}
							}
						]
					},
					reason: { type: 'string' }
				}
			},
			AmbiguousImportLine: {
				type: 'object',
				required: ['line', 'candidates'],
				properties: {
					line: { type: 'object' },
					candidates: { type: 'array', items: { type: 'object' } }
				}
			},
			InventoryImportPreviewRequest: {
				type: 'object',
				required: ['text'],
				properties: {
					text: { type: 'string' },
					defaultFinish: { enum: ['nonfoil', 'foil'] },
					defaultCondition: { enum: ['NM', 'LP', 'MP', 'HP', 'DMG'] }
				}
			},
			InventoryImportPreviewResponse: {
				type: 'object',
				required: ['resolved', 'unresolved', 'ambiguous', 'warnings'],
				properties: {
					resolved: { type: 'array', items: { type: 'object' } },
					unresolved: {
						type: 'array',
						items: { $ref: '#/components/schemas/UnresolvedImportLine' }
					},
					ambiguous: {
						type: 'array',
						items: { $ref: '#/components/schemas/AmbiguousImportLine' }
					},
					warnings: {
						type: 'array',
						items: { $ref: '#/components/schemas/ImportPreviewWarning' }
					}
				}
			},
			InventoryImportCommitRequest: {
				type: 'object',
				required: ['requestId', 'text'],
				properties: {
					requestId: { type: 'string' },
					source: { enum: ['mobile', 'web', 'import', 'scan', 'scan_review'] },
					text: { type: 'string' },
					defaultFinish: { enum: ['nonfoil', 'foil'] },
					defaultCondition: { enum: ['NM', 'LP', 'MP', 'HP', 'DMG'] }
				}
			},
			InventoryImportCommitResponse: ref('InventoryAcknowledgement'),
			DeckImportPreviewRequest: {
				type: 'object',
				required: ['text'],
				properties: { text: { type: 'string' }, format: { type: 'string' } }
			},
			DeckImportCommitRequest: {
				type: 'object',
				required: ['requestId', 'name', 'text'],
				properties: {
					requestId: { type: 'string' },
					source: { enum: ['mobile', 'web', 'import'] },
					name: { type: 'string' },
					description: { type: 'string' },
					format: { type: 'string' },
					text: { type: 'string' }
				}
			}
		}
	},
	tags: [
		{
			name: 'auth',
			description: SITE_DESCRIPTION
		},
		{
			name: 'mobile',
			description:
				'Optional bearer-token mobile API for MTG search, inventory, decks, and scan. Retained for non-browser clients; the PWA uses the standard web session instead.'
		}
	]
};

export const GET = () => {
	const catalogSearch = SCHEMA.paths['/api/mobile/v1/mtg/search'];
	const catalogPrintings = SCHEMA.paths['/api/mobile/v1/mtg/cards/{oracleId}/printings'];
	return json(
		{
			...SCHEMA,
			paths: {
				...SCHEMA.paths,
				'/api/catalog/search': {
					get: { ...catalogSearch.get, security: [] },
					post: { ...catalogSearch.post, security: [] }
				},
				'/api/catalog/cards/{oracleId}/printings': {
					...catalogPrintings,
					get: { ...catalogPrintings.get, security: [] }
				}
			}
		},
		{
			headers: {
				'Cache-Control': 'public, max-age=3600'
			}
		}
	);
};
