import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { savedStateBody } from '#lib/server/saved-state/stream.ts';
// HTTP framing and Web stream backpressure belong to this transport adapter.
export const GET: RequestHandler = async (event) => {
	const origin = event.request.headers.get('origin');
	if (origin !== null && origin !== event.url.origin) error(403, 'Same-origin connection required');
	if ([...event.url.searchParams.keys()].length)
		error(400, 'Stream query parameters are not supported');
	const { user } = await requireMobileAuth(event);
	let subscription: Awaited<ReturnType<typeof application.savedState.subscribe>>;
	try {
		subscription = await application.savedState.subscribe(user, {
			get aborted() {
				return event.request.signal.aborted;
			},
			onAbort(listener) {
				event.request.signal.addEventListener('abort', listener, { once: true });
				return () => event.request.signal.removeEventListener('abort', listener);
			}
		});
	} catch (cause) {
		if (cause && typeof cause === 'object' && 'kind' in cause && cause.kind === 'Unauthenticated')
			error(401, 'Authentication required');
		error(503, 'Saved state temporarily unavailable');
	}
	const body = savedStateBody(subscription, event.request.signal);
	return new Response(body, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-store',
			'X-Accel-Buffering': 'no',
			Connection: 'keep-alive'
		}
	});
};
