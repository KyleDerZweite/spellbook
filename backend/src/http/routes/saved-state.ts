import { requireMobileAuth } from '../auth.ts';
import { error } from '../errors.ts';
import { savedStateBody } from '../saved-state.ts';
import type { HttpDependencies, HttpRoute } from '../types.ts';

export function createSavedStateRoutes(
	dependencies: HttpDependencies
): HttpRoute[] & { closeStreams(): Promise<void> } {
	const streams = new Set<() => void>();
	let closed = false;
	const routes: HttpRoute[] = [
		{
			method: 'GET',
			path: '/api/account/events',
			async handle(context) {
				const { request, url } = context;
				const origin = request.headers.get('origin');
				if (origin !== null && origin !== dependencies.publicOrigin)
					error(403, 'Same-origin connection required');
				if ([...url.searchParams.keys()].length)
					error(400, 'Stream query parameters are not supported');
				const { user } = await requireMobileAuth(context, dependencies);
				if (closed) error(503, 'Saved state temporarily unavailable');
				const cancellation = new AbortController();
				const abort = () => cancellation.abort();
				request.signal.addEventListener('abort', abort, { once: true });
				if (request.signal.aborted) abort();
				streams.add(abort);
				let closeBody: (() => void) | undefined;
				const close = () => {
					streams.delete(abort);
					request.signal.removeEventListener('abort', abort);
					closeBody?.();
				};
				cancellation.signal.addEventListener('abort', close, { once: true });
				try {
					const subscription = await dependencies.application.savedState.subscribe(user, {
						get aborted() {
							return cancellation.signal.aborted;
						},
						onAbort(listener) {
							cancellation.signal.addEventListener('abort', listener, { once: true });
							return () => cancellation.signal.removeEventListener('abort', listener);
						}
					});
					// A shutdown or disconnect while setup completes cannot attach a late stream.
					if (closed || cancellation.signal.aborted) {
						subscription.close();
						error(503, 'Saved state temporarily unavailable');
					}
					const stream = savedStateBody(subscription, cancellation.signal, () => {
						cancellation.signal.removeEventListener('abort', close);
						close();
					});
					closeBody = stream.close;
					return new Response(stream.body, {
						headers: {
							'Content-Type': 'text/event-stream',
							'Cache-Control': 'no-store',
							'X-Accel-Buffering': 'no',
							Connection: 'keep-alive'
						}
					});
				} catch (cause) {
					cancellation.signal.removeEventListener('abort', close);
					close();
					if (
						cause &&
						typeof cause === 'object' &&
						'kind' in cause &&
						cause.kind === 'Unauthenticated'
					)
						error(401, 'Authentication required');
					error(503, 'Saved state temporarily unavailable');
				}
			}
		}
	];
	return Object.assign(routes, {
		async closeStreams() {
			closed = true;
			for (const abort of [...streams]) abort();
		}
	});
}
