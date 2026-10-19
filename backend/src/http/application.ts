import type { Application } from '../application.ts';
import { createRouter } from './router.ts';
import { createAccountRoutes } from './routes/account.ts';
import { createAuthRoutes } from './routes/auth.ts';
import { createSavedStateRoutes } from './routes/saved-state.ts';
import { createCatalogRoutes } from './routes/catalog.ts';
import { createInventoryRoutes } from './routes/inventory.ts';
import { createValuationRoutes } from './routes/valuation.ts';
import { createScanRoutes } from './routes/scan.ts';
import { createDeckRoutes } from './routes/decks.ts';
import { createCategoryRoutes } from './routes/categories.ts';
import { createWebRoutes } from './routes/web.ts';
import { openapi } from './openapi.ts';
import { json } from './errors.ts';
import type { HttpApplication, HttpDependencies } from './types.ts';

export function createHttpApplication(
	application: Application,
	configuration: { publicOrigin: string }
): HttpApplication {
	const url = new URL(configuration.publicOrigin);
	if (
		!['http:', 'https:'].includes(url.protocol) ||
		url.username ||
		url.password ||
		url.origin !== configuration.publicOrigin
	)
		throw new Error('APP_ORIGIN must be an absolute HTTP(S) origin without a path');
	const dependencies: HttpDependencies = { application, publicOrigin: url.origin };
	const savedStateRoutes = createSavedStateRoutes(dependencies);
	return {
		handle: createRouter(
			[
				...createAuthRoutes(dependencies),
				...createAccountRoutes(dependencies),
				...savedStateRoutes,
				...createCatalogRoutes(dependencies),
				...createInventoryRoutes(dependencies),
				...createValuationRoutes(dependencies),
				...createScanRoutes(dependencies),
				...createDeckRoutes(dependencies),
				...createCategoryRoutes(dependencies),
				...createWebRoutes(dependencies),
				{
					method: 'GET',
					path: '/openapi.json',
					handle: async () =>
						json(openapi(dependencies.publicOrigin), {
							headers: { 'cache-control': 'public, max-age=3600' }
						})
				}
			],
			dependencies
		),
		closeStreams: () => savedStateRoutes.closeStreams()
	};
}
