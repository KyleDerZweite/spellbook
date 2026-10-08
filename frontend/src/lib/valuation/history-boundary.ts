interface BoundaryClock {
	now(): number;
	set(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
	clear(timer: ReturnType<typeof setTimeout>): void;
}
/** Refresh closed reporting dates using the server's calendar boundary. */
export function historyBoundaryTimer(
	invalidate: () => void,
	current: () => boolean,
	clock: BoundaryClock = {
		now: Date.now,
		set: (callback, delay) => globalThis.setTimeout(callback, delay),
		clear: (timer) => globalThis.clearTimeout(timer)
	}
) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let generation = 0,
		lastFired = -Infinity;
	function cancel() {
		generation++;
		if (timer !== undefined) clock.clear(timer);
		timer = undefined;
	}
	return {
		cancel,
		schedule(boundary: string | undefined) {
			cancel();
			if (!boundary) return;
			const at = Date.parse(boundary);
			if (!Number.isFinite(at) || at <= lastFired) return;
			const scheduled = generation;
			timer = clock.set(
				() => {
					if (scheduled !== generation) return;
					timer = undefined;
					lastFired = at;
					if (current()) invalidate();
				},
				Math.max(0, at - clock.now())
			);
		}
	};
}
