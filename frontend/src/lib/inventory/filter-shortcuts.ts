import { browsePaginationHref, parseLazyBrowsePagination } from '#lib/browsing/pagination.ts';

export type InventoryMetadataKind = 'set' | 'finish' | 'condition';

/** Metadata shortcuts retain the current filter scope and begin its first range. */
export function inventoryMetadataHref(
	current: URL,
	kind: InventoryMetadataKind,
	value: string
): string {
	const url = new URL(current);
	for (const key of [...url.searchParams.keys()]) {
		if (key.startsWith('/')) url.searchParams.delete(key);
	}
	if (kind === 'set') {
		const sets = [
			...new Set(
				[...url.searchParams.getAll('set'), value].map((code) => code.trim().toLowerCase())
			)
		].sort();
		url.searchParams.delete('set');
		for (const set of sets) url.searchParams.append('set', set);
	} else url.searchParams.set(kind, value);
	return browsePaginationHref(url, parseLazyBrowsePagination(url.searchParams), { page: 1 });
}
