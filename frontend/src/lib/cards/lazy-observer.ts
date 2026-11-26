const callbacks = new WeakMap<Element, () => void>();
let observer: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver | null {
	if (typeof IntersectionObserver === 'undefined') return null;
	if (!observer) {
		observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const callback = callbacks.get(entry.target);
					callbacks.delete(entry.target);
					observer?.unobserve(entry.target);
					callback?.();
				}
			},
			{ rootMargin: '200px' }
		);
	}
	return observer;
}

export function observeLazyElement(element: Element, onVisible: () => void): () => void {
	const shared = getObserver();
	if (!shared) {
		onVisible();
		return () => {};
	}
	callbacks.set(element, onVisible);
	shared.observe(element);
	return () => {
		callbacks.delete(element);
		shared.unobserve(element);
	};
}
