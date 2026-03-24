import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../../src/lib/utils/debounce';

describe('debounce', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('calls function after delay', () => {
		const fn = vi.fn();
		const debounced = debounce(fn, 200);

		debounced();
		expect(fn).not.toHaveBeenCalled();

		vi.advanceTimersByTime(200);
		expect(fn).toHaveBeenCalledOnce();
	});

	it('resets timer on subsequent calls', () => {
		const fn = vi.fn();
		const debounced = debounce(fn, 200);

		debounced();
		vi.advanceTimersByTime(100);
		debounced();
		vi.advanceTimersByTime(100);

		expect(fn).not.toHaveBeenCalled();

		vi.advanceTimersByTime(100);
		expect(fn).toHaveBeenCalledOnce();
	});

	it('cancel prevents function from being called', () => {
		const fn = vi.fn();
		const debounced = debounce(fn, 200);

		debounced();
		debounced.cancel();

		vi.advanceTimersByTime(300);
		expect(fn).not.toHaveBeenCalled();
	});

	it('passes arguments to the function', () => {
		const fn = vi.fn();
		const debounced = debounce(fn, 200);

		debounced('hello', 42);
		vi.advanceTimersByTime(200);

		expect(fn).toHaveBeenCalledWith('hello', 42);
	});

	it('cancel is safe to call multiple times', () => {
		const fn = vi.fn();
		const debounced = debounce(fn, 200);

		debounced.cancel();
		debounced.cancel();

		expect(fn).not.toHaveBeenCalled();
	});
});
