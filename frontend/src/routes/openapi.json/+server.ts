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
				summary: 'Start the Zitadel login flow',
				description:
					'Creates the OIDC state cookie and redirects the browser to the Zitadel authorization endpoint.',
				responses: {
					302: {
						description: 'Redirect to the Zitadel authorization endpoint'
					}
				}
			}
		},
		'/auth/callback': {
			get: {
				summary: 'Handle the Zitadel callback',
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
				description: 'Clears the local session and redirects through the Zitadel logout flow.',
				responses: {
					302: {
						description: 'Redirect to the Zitadel logout endpoint'
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
					200: { description: 'Current MTG inventory snapshot' },
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
		'/api/mobile/v1/mtg/decks': {
			get: {
				summary: 'Read the authenticated user decks for mobile',
				responses: {
					200: { description: 'Current deck snapshot' },
					401: { description: 'Bearer token or web session required' }
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
	components: {},
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
