import { expect, it } from 'vitest';
import { captureBrowseAnchor, browseOriginShift } from '../../src/lib/browsing/viewport.ts';
it('retains toolbar clearance through an Inventory refresh instead of aligning its first row to the header', () => {
	const listTop = 320.5,
		header = 80;
	const anchor = captureBrowseAnchor(
		header - listTop,
		() => 0,
		() => 0
	);
	expect(anchor).toEqual({ index: 0, intra: -240.5 });
	expect(Math.max(0, listTop + anchor.intra - header)).toBe(0);
});
it('retains a middle row and its intra-row scroll through refresh and a prepended segment', () => {
	const rowTop = (index: number) => (index - 8000) * 96;
	const anchor = captureBrowseAnchor(205, (top) => 8000 + Math.floor(top / 96), rowTop);
	expect(anchor).toEqual({ index: 8002, intra: 13 });
	const prependedTop = (anchor.index - 7800) * 96 + anchor.intra;
	expect(
		captureBrowseAnchor(
			prependedTop,
			(top) => 7800 + Math.floor(top / 96),
			(i) => (i - 7800) * 96
		)
	).toEqual(anchor);
});

it('compensates the refresh-status row entering and leaving above Inventory without scrolling its toolbar out of view', () => {
	expect(browseOriginShift(320.5, 356.5, 1100, 72)).toBe(36);
	expect(browseOriginShift(356.5, 320.5, 1136, 72)).toBe(-36);
	expect(browseOriginShift(320.5, 356.5, 0, 72)).toBe(0);
	expect(browseOriginShift(356.5, 320.5, 0, 72)).toBe(0);
});
