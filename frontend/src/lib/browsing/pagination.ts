export type BrowsePageSize = 100 | 200 | 500 | 'lazy';
export type BrowsePagination = Readonly<{
	pageSize: BrowsePageSize;
	page: number;
	limit: 100 | 200 | 500;
	offset: number;
	maxOffset: number;
}>;

function pagination(pageSize: BrowsePageSize, page: number, maxOffset: number): BrowsePagination {
	if (![100, 200, 500, 'lazy'].includes(pageSize)) throw new RangeError('Invalid page size.');
	if (!Number.isSafeInteger(page) || page < 1) throw new RangeError('Invalid page.');
	if (!Number.isSafeInteger(maxOffset) || maxOffset < 0)
		throw new RangeError('Invalid offset bound.');
	const limit = pageSize === 'lazy' ? 200 : pageSize;
	const offset = BigInt(page - 1) * BigInt(limit);
	if (offset > BigInt(maxOffset)) throw new RangeError('Page exceeds the offset bound.');
	return Object.freeze({ pageSize, page, limit, offset: Number(offset), maxOffset });
}

/** Browser preferences only. Routes translate failures and retain their API defaults. */
export function parseBrowsePagination(
	query: URLSearchParams,
	maxOffset = Number.MAX_SAFE_INTEGER
): BrowsePagination {
	if (query.getAll('page').length > 1 || query.getAll('pageSize').length > 1)
		throw new RangeError('Repeated pagination parameter.');
	const size = query.get('pageSize') ?? '200';
	const page = query.get('page') ?? '1';
	if (!['100', '200', '500', 'lazy'].includes(size)) throw new RangeError('Invalid page size.');
	if (!/^[0-9]+$/.test(page)) throw new RangeError('Invalid page.');
	return pagination(
		size === 'lazy' ? size : (Number(size) as 100 | 200 | 500),
		Number(page),
		maxOffset
	);
}

export function browsePageCount(total: number, limit: BrowsePagination['limit']): number {
	if (!Number.isSafeInteger(total) || total < 0) throw new RangeError('Invalid total.');
	return Math.max(1, Math.ceil(total / limit));
}

/** An empty result stays on page one; callers decide whether to replace their URL. */
export function clampBrowsePagination(state: BrowsePagination, total: number): BrowsePagination {
	return pagination(
		state.pageSize,
		Math.min(state.page, browsePageCount(total, state.limit)),
		state.maxOffset
	);
}

/** A size/mode change always resets the page, preserving all unrelated query values. */
export function browsePaginationHref(
	canonicalURL: URL,
	state: BrowsePagination,
	change: { page?: number; pageSize?: BrowsePageSize } = {}
): string {
	const pageSize = change.pageSize ?? state.pageSize;
	const next = pagination(
		pageSize,
		pageSize !== state.pageSize ? 1 : (change.page ?? state.page),
		state.maxOffset
	);
	const url = new URL(canonicalURL);
	url.searchParams.delete('offset');
	url.searchParams.delete('limit');
	url.searchParams.set('pageSize', String(next.pageSize));
	url.searchParams.set('page', String(next.page));
	return url.pathname + url.search + url.hash;
}
