import { describe, it, expect } from 'vitest';
import {
	initialLoadedSpan,
	admitLoadedSpan,
	nextLoadedRange,
	reconcileDirectorySpan
} from '../../src/lib/browsing/loadedSpan.ts';
describe('loaded browsing span', () => {
	it('represents just the initial successful range regardless of complete total', () => {
		expect(initialLoadedSpan(8000, 200, 50000)).toEqual({ start: 8000, end: 8200 });
		expect(initialLoadedSpan(49800, 50, 49850)).toEqual({ start: 49800, end: 49850 });
	});
	it('rejects gaps and empty results, accepts adjacent success, and preserves visited bounds after eviction', () => {
		const span = { start: 8000, end: 8200 };
		expect(admitLoadedSpan(span, 9000, 200, 50000)).toBe(span);
		expect(admitLoadedSpan(span, 7600, 200, 50000)).toBe(span);
		expect(admitLoadedSpan(span, 8200, 0, 50000)).toBe(span);
		expect(admitLoadedSpan(span, 8200, 200, 50000)).toEqual({ start: 8000, end: 8400 });
		expect(admitLoadedSpan(span, 7800, 200, 50000)).toEqual({ start: 7800, end: 8200 });
	});
	it('requires actual near-end geometry and stops advancing after success until the viewport moves', () => {
		expect(nextLoadedRange({ start: 0, end: 200 }, 35, 50000)).toBeNull();
		expect(nextLoadedRange({ start: 0, end: 200 }, 165, 50000)).toBe(200);
		expect(nextLoadedRange({ start: 0, end: 400 }, 165, 50000)).toBeNull();
		expect(nextLoadedRange({ start: 0, end: 200 }, 190, 200)).toBeNull();
	});
});

it('initializes full Boxes metadata after a deep native slice or empty directory', () => {
	const native = initialLoadedSpan(8000, 200, 200);
	expect(reconcileDirectorySpan(native, 10000, 8000, true)).toEqual({ start: 8000, end: 8200 });
	const empty = reconcileDirectorySpan({ start: 0, end: 200 }, 0, 0, false);
	expect(reconcileDirectorySpan(empty, 1, 0, false)).toEqual({ start: 0, end: 1 });
	expect(reconcileDirectorySpan({ start: 400, end: 800 }, 1000, 400, false)).toEqual({
		start: 400,
		end: 800
	});
});
