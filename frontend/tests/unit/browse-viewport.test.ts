import { describe, expect, it } from 'vitest';
import { viewportGeometry } from '../../src/lib/browsing/viewport.ts';
describe('explicit browsing viewport geometry', () => {
	it('measures the window independently of toolbar and filter heights', () => {
		expect(viewportGeometry({ top: -1200, width: 960 }, { top: 0, height: 800 })).toEqual({
			width: 960,
			height: 800,
			visibleTop: 1200
		});
	});
	it('measures a modal viewport with its own screen origin and does not infer an ancestor', () => {
		expect(viewportGeometry({ top: -240, width: 340 }, { top: 80, height: 640 })).toEqual({
			width: 340,
			height: 640,
			visibleTop: 320
		});
		expect(viewportGeometry({ top: 280, width: 340 }, { top: 80, height: 640 }).visibleTop).toBe(0);
	});
});
