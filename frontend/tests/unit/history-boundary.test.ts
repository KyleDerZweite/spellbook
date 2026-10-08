import { describe, expect, it, vi } from 'vitest';
import { historyBoundaryTimer } from '#lib/valuation/history-boundary.ts';
describe('server reporting boundary refresh', () => {
	it('calls browser timer methods with their global receiver', () => {
		const set = vi.spyOn(globalThis, 'setTimeout').mockImplementation(function (this: unknown) {
			expect(this).toBe(globalThis);
			return 1 as unknown as ReturnType<typeof setTimeout>;
		});
		const clear = vi.spyOn(globalThis, 'clearTimeout').mockImplementation(function (this: unknown) {
			expect(this).toBe(globalThis);
		});
		try {
			const timer = historyBoundaryTimer(
				() => {},
				() => true
			);
			timer.schedule(new Date(Date.now() + 60000).toISOString());
			timer.cancel();
			expect(set).toHaveBeenCalledOnce();
			expect(clear).toHaveBeenCalledOnce();
		} finally {
			set.mockRestore();
			clear.mockRestore();
		}
	});
	it('fires once, replaces dates and cancels stale callbacks on cleanup', () => {
		const callbacks = new Map<ReturnType<typeof setTimeout>, () => void>();
		let sequence = 0,
			delay = -1,
			refreshes = 0,
			active = true;
		const timer = historyBoundaryTimer(
			() => refreshes++,
			() => active,
			{
				now: () => Date.parse('2026-10-25T22:59:00Z'),
				set: (callback, ms) => {
					delay = ms;
					const key = ++sequence as unknown as ReturnType<typeof setTimeout>;
					callbacks.set(key, callback);
					return key;
				},
				clear: (key) => {
					callbacks.delete(key);
				}
			}
		);
		timer.schedule('2026-10-25T23:00:00Z');
		expect(delay).toBe(60000);
		callbacks.values().next().value!();
		expect(refreshes).toBe(1);
		callbacks.clear();
		timer.schedule('2026-10-25T23:00:00Z');
		expect(callbacks.size).toBe(0);
		timer.schedule('2026-10-26T23:00:00Z');
		timer.schedule('2026-10-27T23:00:00Z');
		expect(callbacks.size).toBe(1);
		const late = callbacks.values().next().value!;
		timer.cancel();
		late();
		expect(refreshes).toBe(1);
		expect(callbacks.size).toBe(0);
		timer.schedule('2026-10-28T23:00:00Z');
		active = false;
		callbacks.values().next().value!();
		expect(refreshes).toBe(1);
	});
	it('handles crossed boundaries without repeating a zero-delay callback', () => {
		let callback = () => {},
			count = 0;
		const timer = historyBoundaryTimer(
			() => count++,
			() => true,
			{
				now: () => 1000,
				set: (fn, delay) => {
					expect(delay).toBe(0);
					callback = fn;
					return 1 as unknown as ReturnType<typeof setTimeout>;
				},
				clear: () => {}
			}
		);
		timer.schedule('1970-01-01T00:00:00.500Z');
		callback();
		timer.schedule('1970-01-01T00:00:00.500Z');
		expect(count).toBe(1);
		timer.schedule('bad');
		timer.schedule(undefined);
		expect(count).toBe(1);
	});
});
