import { describe, expect, it, vi } from 'vitest';
import { restoreInitialBrowsePosition } from '../../src/lib/browsing/viewport.ts';

describe('initial continuous browsing position', () => {
	it('keeps fresh first-range toolbars visible despite a nonzero list origin', () => {
		for (const listTop of [188, 284.5, 360]) {
			const positions: number[] = [];
			const host = {
				scrollTo: vi.fn((options?: ScrollToOptions | number) => {
					positions.push(typeof options === 'number' ? options : (options?.top ?? 0));
				})
			};
			restoreInitialBrowsePosition(host, 0, 0, listTop);
			expect(positions).toEqual([0]);
		}
	});
	it('restores saved nonzero position before computed deep anchors', () => {
		const positions: number[] = [];
		const host = {
			scrollTo: vi.fn((options?: ScrollToOptions | number) => {
				positions.push(typeof options === 'number' ? options : (options?.top ?? 0));
			})
		};
		restoreInitialBrowsePosition(host, 600, 0, 188);
		restoreInitialBrowsePosition(host, 12345, 400, 30000);
		restoreInitialBrowsePosition(host, 0, 400, 30000);
		expect(positions).toEqual([600, 12345, 30000]);
	});
	it('keeps native feedback above first and deep range restoration', () => {
		const positions: number[] = [];
		const host = {
			scrollTo: vi.fn((options?: ScrollToOptions | number) => {
				positions.push(typeof options === 'number' ? options : (options?.top ?? 0));
			})
		};
		const calls: ScrollIntoViewOptions[] = [];
		const feedback = {
			getBoundingClientRect: () => ({ top: 50 }),
			scrollIntoView: vi.fn((options?: ScrollIntoViewOptions | boolean) => {
				if (typeof options === 'object') calls.push(options);
			})
		};
		restoreInitialBrowsePosition(host, 0, 0, 188, feedback);
		restoreInitialBrowsePosition(host, 600, 400, 30000, feedback);
		expect(positions).toEqual([]);
		expect(calls).toEqual([
			{ block: 'start', behavior: 'instant' },
			{ block: 'start', behavior: 'instant' }
		]);
	});
	it('resets only the explicit modal host and keeps modal feedback in that host', () => {
		const positions: number[] = [];
		const modal = {
			scrollTop: 600,
			clientTop: 2,
			getBoundingClientRect: () => ({ top: 80 }),
			scrollTo: vi.fn((options?: ScrollToOptions | number) => {
				positions.push(typeof options === 'number' ? options : (options?.top ?? 0));
			})
		};
		const feedback = {
			getBoundingClientRect: () => ({ top: 120 }),
			scrollIntoView: () => {
				throw new Error('must not scroll the background');
			}
		};
		restoreInitialBrowsePosition(modal, 0, 0, 188);
		restoreInitialBrowsePosition(modal, 0, 0, 188, feedback);
		expect(positions).toEqual([0, 638]);
	});
});
