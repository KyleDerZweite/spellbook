import {
	SAVED_STATE_HEARTBEAT_MS,
	type SavedStateEvent,
	type SavedStateSubscription
} from '@spellbook/contracts/saved-state.ts';

/** One pending event and no Web-stream prefetch; authorize each actual downstream pull. */
export function savedStateBody(
	subscription: SavedStateSubscription,
	signal: AbortSignal,
	onClose = () => {}
) {
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
		signal.removeEventListener('abort', close);
		onClose();
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
				signal.addEventListener('abort', close, { once: true });
				if (signal.aborted) close();
			},
			async pull(value) {
				if (stopped) return;
				try {
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
					const delivery = result ? await subscription.deliver(result) : null;
					if (stopped) return;
					if (!delivery) {
						close();
						return;
					}
					value.enqueue(
						encoder.encode(`event: ${delivery.event}\ndata: ${JSON.stringify(delivery.data)}\n\n`)
					);
					if (delivery.event === 'auth-expired') close();
				} catch (cause) {
					close();
					throw cause;
				}
			},
			cancel: close
		},
		{ highWaterMark: 0 }
	);
	return { body, close };
}
