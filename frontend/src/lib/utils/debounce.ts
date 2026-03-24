export interface Debounced<T extends (...args: unknown[]) => unknown> {
	(...args: Parameters<T>): void;
	cancel: () => void;
}

/**
 * Creates a debounced version of the given function.
 * Returns an object with the debounced function and a .cancel() method
 * for cleanup in $effect return functions.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
	fn: T,
	delay: number
): Debounced<T> {
	let timer: ReturnType<typeof setTimeout> | null = null;

	const debounced = ((...args: Parameters<T>) => {
		if (timer !== null) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			fn(...args);
		}, delay);
	}) as Debounced<T>;

	debounced.cancel = () => {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	};

	return debounced;
}
