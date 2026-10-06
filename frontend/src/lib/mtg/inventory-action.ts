/** Keep the current inventory view when SvelteKit applies a named form action. */
export function inventoryAction(name: string, current: { search: string }): string {
	const query = new URLSearchParams(current.search);
	for (const key of [...query.keys()]) {
		if (key.startsWith('/')) query.delete(key);
	}
	query.set(`/${name}`, '');
	return `/mtg/inventory?${query}`;
}
