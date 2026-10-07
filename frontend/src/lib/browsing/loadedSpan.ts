/** Absolute visited bounds survive data eviction; they never reserve an unfetched prefix. */
export interface LoadedSpan {
	readonly start: number;
	readonly end: number;
}
export function initialLoadedSpan(offset: number, count: number, total: number): LoadedSpan {
	const start = Math.max(0, Math.min(offset, total));
	return { start, end: Math.min(total, start + Math.max(0, count)) };
}
/** Only explicitly requested contiguous successful ranges can grow the visited segment. */
export function admitLoadedSpan(
	span: LoadedSpan,
	offset: number,
	count: number,
	total: number
): LoadedSpan {
	const page = initialLoadedSpan(offset, count, total);
	if (page.end <= page.start || page.start > span.end || page.end < span.start) return span;
	return {
		start: Math.min(span.start, page.start),
		end: Math.min(total, Math.max(span.end, page.end))
	};
}
export function nextLoadedRange(
	span: LoadedSpan,
	visibleEnd: number,
	total: number,
	threshold = 40
): number | null {
	return span.end > span.start && span.end < total && visibleEnd >= span.end - threshold
		? span.end
		: null;
}

/** Full directory metadata can replace a native slice or an empty directory. */
export function reconcileDirectorySpan(
	span: LoadedSpan,
	total: number,
	anchor: number,
	enhanced: boolean
): LoadedSpan {
	if (enhanced || span.end <= span.start) return initialLoadedSpan(anchor, 200, total);
	const start = Math.min(span.start, total),
		end = Math.min(span.end, total);
	return start === span.start && end === span.end ? span : { start, end };
}
