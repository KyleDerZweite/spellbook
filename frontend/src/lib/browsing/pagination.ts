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

/** Normalize browser preferences independently. Backend API validation is unchanged. */
export function parseBrowsePagination(
	query: URLSearchParams,
	maxOffset = Number.MAX_SAFE_INTEGER,
	defaultPageSize: BrowsePageSize = 200
): BrowsePagination {
	if (!Number.isSafeInteger(maxOffset) || maxOffset < 0)
		throw new RangeError('Invalid offset bound.');
	const sizes = query.getAll('pageSize');
	const size = sizes.length === 1 ? sizes[0] : String(defaultPageSize);
	const pageSize =
		size === '100'
			? 100
			: size === '200'
				? 200
				: size === '500'
					? 500
					: size === 'lazy'
						? size
						: defaultPageSize;
	const pages = query.getAll('page');
	const rawPage = pages.length === 1 ? pages[0] : '1';
	const page = /^[0-9]+$/.test(rawPage) ? Number(rawPage) : 1;
	const limit = pageSize === 'lazy' ? 200 : pageSize;
	const validPage =
		Number.isSafeInteger(page) && page > 0 && BigInt(page - 1) * BigInt(limit) <= BigInt(maxOffset);
	return pagination(pageSize, validPage ? page : 1, maxOffset);
}

/** All browser surfaces use fixed 200-result continuous ranges. Legacy URLs retain their containing range. */
export function normalizeLazyBrowsePagination(state: BrowsePagination): BrowsePagination {
	return pagination('lazy', Math.floor(state.offset / 200) + 1, state.maxOffset);
}
export function parseLazyBrowsePagination(
	query: URLSearchParams,
	maxOffset = Number.MAX_SAFE_INTEGER
): BrowsePagination {
	return normalizeLazyBrowsePagination(parseBrowsePagination(query, maxOffset, 'lazy'));
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
