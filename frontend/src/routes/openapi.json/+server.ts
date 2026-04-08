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
		}
	},
	components: {},
	tags: [
		{
			name: 'auth',
			description: SITE_DESCRIPTION
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
