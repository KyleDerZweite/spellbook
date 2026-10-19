import type { Application } from '../application.ts';
import { createRouter } from './router.ts';
import { createAccountRoutes } from './routes/account.ts';
import { createAuthRoutes } from './routes/auth.ts';
import { createSavedStateRoutes } from './routes/saved-state.ts';
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
				...savedStateRoutes
			],
			dependencies
		),
		closeStreams: () => savedStateRoutes.closeStreams()
	};
}
