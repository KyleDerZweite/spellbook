import { json } from '@sveltejs/kit';
import { privateEnv } from '$lib/env/private';
import { SITE_DESCRIPTION, SITE_NAME } from '$lib/seo/site';

const SCHEMA = {
	openapi: '3.1.0',
	info: {
		title: `${SITE_NAME} OpenAPI Schema`,
		version: '0.1.0',
		description:
			'Machine-readable schema for the Spellbook frontend origin. Most interactive routes require authentication.'
	},
	servers: [
		{
			url: privateEnv.APP_ORIGIN
		}
	],
	paths: {
		'/auth/login': {
			get: {
				summary: 'Start the OIDC login flow',
				description:
					'Creates the OIDC state cookie and redirects the browser to the configured identity provider authorization endpoint.',
				responses: {
					302: {
						description: 'Redirect to the OIDC authorization endpoint'
					}
				}
			}
		},
		'/auth/callback': {
			get: {
				summary: 'Handle the OIDC callback',
				description:
					'Exchanges the authorization code for a session and redirects back into the app.',
				responses: {
					302: {
						description: 'Redirect back to the requested in-app route'
					}
				}
			}
		},
		'/auth/logout': {
			get: {
				summary: 'End the current session',
				description:
					'Clears the local session and redirects through the provider logout flow when available.',
				responses: {
					302: {
						description: 'Redirect to the provider logout endpoint or the app root'
					}
				}
			}
		},
		'/api/mobile/v1/mtg/search': {
			get: {
				summary: 'Search the MTG catalog for the mobile client',
				responses: {
					200: { description: 'Search response with MTG card hits' },
					401: { description: 'Bearer token or web session required' }
				}
			}
		},
		'/api/mobile/v1/mtg/inventory': {
			get: {
				summary: 'Read the authenticated user inventory for mobile',
				responses: {
					200: {
						description: 'Current MTG inventory snapshot',
						content: {
							'application/json': { schema: { $ref: '#/components/schemas/InventorySnapshot' } }
						}
					},
					401: { description: 'Bearer token or web session required' }
				}
			},
			post: {
				summary: 'Commit an idempotent batch inventory add',
				responses: {
					200: { description: 'Inventory commit applied or deduplicated' },
					401: { description: 'Bearer token or web session required' }
				}
			}
		},
		'/api/mobile/v1/mtg/inventory/bulk': {
			post: {
				summary: 'Apply idempotent MTG inventory bulk operations',
				requestBody: {
					required: true,
					content: {
						'application/json': { schema: { $ref: '#/components/schemas/InventoryBulkRequest' } }
					}
				},
				responses: {
					200: {
						description: 'Inventory snapshot after applying or deduplicating the request',
						content: {
							'application/json': { schema: { $ref: '#/components/schemas/InventorySnapshot' } }
						}
					},
					400: { $ref: '#/components/responses/BadRequest' },
					401: { description: 'Bearer token or web session required' }
				}
			}
		},
		'/api/mobile/v1/mtg/inventory/import/preview': {
			post: {
				summary: 'Preview an MTG Arena-style inventory import',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/InventoryImportPreviewRequest' }
						}
					}
				},
				responses: {
					200: { description: 'Resolved, unresolved, ambiguous lines, and warnings' },
					400: { $ref: '#/components/responses/BadRequest' }
				}
			}
		},
		'/api/mobile/v1/mtg/inventory/import/commit': {
			post: {
				summary: 'Commit resolved MTG Arena-style inventory import lines',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/InventoryImportCommitRequest' }
						}
					}
				},
				responses: {
					200: { description: 'Inventory snapshot plus import summary' },
					400: { $ref: '#/components/responses/BadRequest' }
				}
			}
		},
		'/api/mobile/v1/mtg/decks': {
			get: {
				summary: 'Read the authenticated user decks for mobile',
				responses: {
					200: {
						description: 'Current deck snapshot',
						content: {
							'application/json': { schema: { $ref: '#/components/schemas/DeckSnapshot' } }
						}
					},
					401: { description: 'Bearer token or web session required' }
				}
			}
		},
		'/api/mobile/v1/mtg/decks/{deckId}/cards/bulk': {
			post: {
				summary: 'Apply idempotent MTG deck card bulk operations',
				parameters: [{ name: 'deckId', in: 'path', required: true, schema: { type: 'string' } }],
				requestBody: {
					required: true,
					content: {
						'application/json': { schema: { $ref: '#/components/schemas/DeckCardBulkRequest' } }
					}
				},
				responses: {
					200: { description: 'Deck cards after applying or deduplicating the request' },
					400: { $ref: '#/components/responses/BadRequest' }
				}
			}
		},
		'/api/mobile/v1/mtg/decks/import/preview': {
			post: {
				summary: 'Preview an MTG Arena-style deck import',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/DeckImportPreviewRequest' }
						}
					}
				},
				responses: {
					200: { description: 'Resolved, unresolved, ambiguous lines, and warnings' },
					400: { $ref: '#/components/responses/BadRequest' }
				}
			}
		},
		'/api/mobile/v1/mtg/decks/import/commit': {
			post: {
				summary: 'Create a new deck from resolved MTG Arena-style import lines',
				requestBody: {
					required: true,
					content: {
						'application/json': { schema: { $ref: '#/components/schemas/DeckImportCommitRequest' } }
					}
				},
				responses: {
					200: {
						description: 'Created deck, deck cards, unresolved lines, ambiguous lines, and warnings'
					},
					400: { $ref: '#/components/responses/BadRequest' }
				}
			}
		},
		'/api/mobile/v1/mtg/decks/{deckId}/export': {
			get: {
				summary: 'Export a deck as MTG Arena-compatible text',
				parameters: [
					{ name: 'deckId', in: 'path', required: true, schema: { type: 'string' } },
					{ name: 'format', in: 'query', required: false, schema: { const: 'arena' } }
				],
				responses: {
					200: {
						description: 'MTG Arena text export',
						content: { 'text/plain': { schema: { type: 'string' } } }
					},
					400: { $ref: '#/components/responses/BadRequest' }
				}
			}
		},
		'/api/mobile/v1/mtg/scan/sessions': {
			post: {
				summary: 'Create a scan session for the mobile scan workflow',
				responses: {
					200: { description: 'Created scan session id' },
					401: { description: 'Bearer token or web session required' }
				}
			}
		}
	},
	components: {
		responses: {
			BadRequest: {
				description: 'Structured error response',
				content: {
					'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } }
				}
			}
		},
		schemas: {
			ErrorResponse: {
				type: 'object',
				properties: { message: { type: 'string' } },
				required: ['message']
			},
			CardIdentity: {
				type: 'object',
				required: ['catalogCardId', 'canonicalCardId', 'name', 'setCode', 'imageUri'],
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
				properties: { entryId: { type: 'string' } }
			},
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
			MutationRequestRecord: {
				type: 'object',
				required: ['accountId', 'requestId', 'source', 'status'],
				properties: {
					accountId: { type: 'string' },
					requestId: { type: 'string' },
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
			Deck: {
				type: 'object',
				required: ['id', 'accountId', 'game', 'name', 'description', 'format'],
				properties: {
					id: { type: 'string', format: 'uuid' },
					accountId: { type: 'string' },
					game: { type: 'string' },
					name: { type: 'string' },
					description: { type: 'string' },
					format: { type: 'string' },
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
			DeckSnapshot: {
				type: 'object',
				required: ['decks', 'deckCards', 'inventoryCards'],
				properties: {
					decks: { type: 'array', items: { $ref: '#/components/schemas/Deck' } },
					deckCards: { type: 'array', items: { $ref: '#/components/schemas/DeckCard' } },
					inventoryCards: { type: 'array', items: { $ref: '#/components/schemas/InventoryCard' } },
					mutationRequests: {
						type: 'array',
						items: { $ref: '#/components/schemas/MutationRequestRecord' }
					}
				}
			},
			InventoryAddOperation: {
				type: 'object',
				required: ['op', 'card', 'finish', 'condition', 'quantity'],
				properties: {
					op: { const: 'add' },
					card: { $ref: '#/components/schemas/CardIdentity' },
					finish: { enum: ['nonfoil', 'foil'] },
					condition: { enum: ['NM', 'LP', 'MP', 'HP', 'DMG'] },
					quantity: { type: 'integer', minimum: 1 },
					notes: { type: 'string' }
				}
			},
			InventoryTargetOperation: {
				type: 'object',
				required: ['op', 'target'],
				properties: {
					op: { enum: ['set', 'decrement', 'remove'] },
					target: { $ref: '#/components/schemas/EntryTarget' },
					quantity: { type: 'integer' },
					notes: { type: 'string' }
				}
			},
			InventoryBulkOperation: {
				oneOf: [
					{ $ref: '#/components/schemas/InventoryAddOperation' },
					{ $ref: '#/components/schemas/InventoryTargetOperation' }
				]
			},
			InventoryBulkRequest: {
				type: 'object',
				required: ['requestId', 'source', 'operations'],
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
				required: ['op', 'card', 'quantity', 'role'],
				properties: {
					op: { const: 'add' },
					card: { $ref: '#/components/schemas/CardIdentity' },
					quantity: { type: 'integer', minimum: 1 },
					role: { enum: ['main', 'sideboard', 'commander', 'companion'] }
				}
			},
			DeckTargetOperation: {
				type: 'object',
				required: ['op', 'target'],
				properties: {
					op: { enum: ['set', 'decrement', 'remove'] },
					target: { $ref: '#/components/schemas/EntryTarget' },
					quantity: { type: 'integer' }
				}
			},
			DeckCardBulkOperation: {
				oneOf: [
					{ $ref: '#/components/schemas/DeckAddOperation' },
					{ $ref: '#/components/schemas/DeckTargetOperation' }
				]
			},
			DeckCardBulkRequest: {
				type: 'object',
				required: ['requestId', 'source', 'operations'],
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
						oneOf: [
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
				required: ['requestId', 'source', 'text'],
				properties: {
					requestId: { type: 'string' },
					source: { enum: ['mobile', 'web', 'import', 'scan', 'scan_review'] },
					text: { type: 'string' },
					defaultFinish: { enum: ['nonfoil', 'foil'] },
					defaultCondition: { enum: ['NM', 'LP', 'MP', 'HP', 'DMG'] }
				}
			},
			InventoryImportCommitResponse: {
				type: 'object',
				required: ['snapshot', 'import'],
				properties: {
					snapshot: { $ref: '#/components/schemas/InventorySnapshot' },
					import: {
						type: 'object',
						required: ['resolvedCount', 'unresolved', 'ambiguous', 'warnings'],
						properties: {
							resolvedCount: { type: 'integer' },
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
					}
				}
			},
			DeckImportPreviewRequest: {
				type: 'object',
				required: ['text'],
				properties: { text: { type: 'string' }, format: { type: 'string' } }
			},
			DeckImportCommitRequest: {
				type: 'object',
				required: ['requestId', 'source', 'name', 'text'],
				properties: {
					requestId: { type: 'string' },
					source: { enum: ['mobile', 'web', 'import'] },
					name: { type: 'string' },
					description: { type: 'string' },
					format: { type: 'string' },
					text: { type: 'string' }
				}
			},
			DeckImportCommitResponse: {
				type: 'object',
				required: ['deck', 'deckCards', 'unresolved', 'ambiguous', 'warnings'],
				properties: {
					deck: { $ref: '#/components/schemas/Deck' },
					deckCards: { type: 'array', items: { $ref: '#/components/schemas/DeckCard' } },
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
	return json(SCHEMA, {
		headers: {
			'Cache-Control': 'public, max-age=3600'
		}
	});
};
