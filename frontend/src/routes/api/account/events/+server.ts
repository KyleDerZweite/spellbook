import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import {
	SAVED_STATE_HEARTBEAT_MS,
	type SavedStateEvent
} from '@spellbook/contracts/saved-state.ts';
// HTTP framing and Web stream backpressure belong to this transport adapter.
export const GET: RequestHandler = async (event) => {
	const origin = event.request.headers.get('origin');
	if (origin !== null && origin !== event.url.origin) error(403, 'Same-origin connection required');
	if ([...event.url.searchParams.keys()].length)
		error(400, 'Stream query parameters are not supported');
	const { user } = await requireMobileAuth(event);
	let subscription: Awaited<ReturnType<typeof application.savedState.subscribe>>;
	try {
		subscription = await application.savedState.subscribe(user);
	} catch (cause) {
		if (cause && typeof cause === 'object' && 'kind' in cause && cause.kind === 'Unauthenticated')
			error(401, 'Authentication required');
		error(503, 'Saved state temporarily unavailable');
	}
	const encoder = new TextEncoder();
	let stopped = false;
	let pending: Promise<SavedStateEvent | null> | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let controller: ReadableStreamDefaultController<Uint8Array>;
	function close() {
		if (stopped) return;
		stopped = true;
		clearTimeout(timer);
		subscription.close();
		event.request.signal.removeEventListener('abort', close);
		try {
			controller?.close();
		} catch {
			/* Already cancelled. */
		}
	}
	const body = new ReadableStream<Uint8Array>(
		{
			start(value) {
				controller = value;
				event.request.signal.addEventListener('abort', close, { once: true });
				if (event.request.signal.aborted) close();
			},
			async pull(value) {
				if (stopped) return;
				pending ??= subscription.next();
				const result = await Promise.race([
					pending,
					new Promise<'heartbeat'>((resolve) => {
						timer = setTimeout(() => resolve('heartbeat'), SAVED_STATE_HEARTBEAT_MS);
					})
				]);
				clearTimeout(timer);
				if (stopped) return;
				if (result === 'heartbeat') {
					value.enqueue(encoder.encode(': heartbeat\n\n'));
					return;
				}
				pending = undefined;
				if (!result) {
					close();
					return;
				}
				value.enqueue(
					encoder.encode(`event: ${result.event}\ndata: ${JSON.stringify(result.data)}\n\n`)
				);
				if (result.event === 'auth-expired') close();
			},
			cancel() {
				close();
			}
		},
		{ highWaterMark: 0 }
	);
	return new Response(body, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-store',
			'X-Accel-Buffering': 'no',
			Connection: 'keep-alive'
		}
	});
};
