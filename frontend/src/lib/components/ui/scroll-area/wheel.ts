const cancellations = new WeakMap<HTMLElement, () => void>();
const duration = 100;

export function cancelWheelScroll(viewport: HTMLElement | null | undefined) {
	if (viewport) cancellations.get(viewport)?.();
}

/** Ease coarse wheel notches only. Precision scrolling retains browser momentum. */
export function smoothWheelScroll(viewport: HTMLElement): () => void {
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
	const root = viewport.closest('[data-scroll-area-root]') ?? viewport;
	let frame = 0;
	let start = 0;
	let from = viewport.scrollTop;
	let target = from;
	let expected = from;

	function cancel() {
		cancelAnimationFrame(frame);
		frame = 0;
		target = viewport.scrollTop;
	}

	function animate(now: number) {
		// Native input and direct restoration take precedence over pending wheel motion.
		if (Math.abs(viewport.scrollTop - expected) > 1) {
			cancel();
			return;
		}
		const progress = Math.min(1, (now - start) / duration);
		viewport.scrollTop = from + (target - from) * (1 - (1 - progress) ** 3);
		expected = viewport.scrollTop;
		frame = progress < 1 ? requestAnimationFrame(animate) : 0;
	}

	function wheel(event: WheelEvent) {
		const coarsePixels =
			event.deltaMode === 0 &&
			Number.isInteger(event.deltaY) &&
			(event.deltaY % 100 === 0 || event.deltaY % 120 === 0);
		if (
			event.defaultPrevented ||
			!event.cancelable ||
			reducedMotion.matches ||
			event.ctrlKey ||
			event.metaKey ||
			event.shiftKey ||
			event.altKey ||
			event.deltaX !== 0 ||
			event.deltaY === 0 ||
			(event.deltaMode !== 1 && !coarsePixels)
		) {
			cancel();
			return;
		}

		for (const node of event.composedPath()) {
			if (node === viewport) break;
			if (!(node instanceof HTMLElement)) continue;
			const overflow = getComputedStyle(node).overflowY;
			if (node.scrollHeight > node.clientHeight && /^(auto|scroll)$/.test(overflow)) {
				cancel();
				return;
			}
		}

		const delta = event.deltaY * (event.deltaMode === 1 ? 16 : 1);
		const max = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
		// Chain only once the viewport itself has reached the boundary.
		if ((delta > 0 && viewport.scrollTop >= max) || (delta < 0 && viewport.scrollTop <= 0)) {
			cancel();
			return;
		}
		const currentTarget =
			frame && delta * (target - viewport.scrollTop) >= 0 ? target : viewport.scrollTop;
		const next = Math.max(0, Math.min(max, currentTarget + delta));
		event.preventDefault();
		if (frame && next === currentTarget) return;
		cancelAnimationFrame(frame);
		from = viewport.scrollTop;
		expected = from;
		target = next;
		start = performance.now();
		frame = requestAnimationFrame(animate);
	}

	cancellations.set(viewport, cancel);
	viewport.addEventListener('wheel', wheel, { passive: false });
	root.addEventListener('pointerdown', cancel, true);
	root.addEventListener('touchstart', cancel, { passive: true, capture: true });
	viewport.addEventListener('keydown', cancel, true);
	reducedMotion.addEventListener('change', cancel);
	return () => {
		cancel();
		cancellations.delete(viewport);
		viewport.removeEventListener('wheel', wheel);
		root.removeEventListener('pointerdown', cancel, true);
		root.removeEventListener('touchstart', cancel, true);
		viewport.removeEventListener('keydown', cancel, true);
		reducedMotion.removeEventListener('change', cancel);
	};
}
