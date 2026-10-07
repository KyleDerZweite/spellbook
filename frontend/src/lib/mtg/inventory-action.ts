/** Keep the current inventory view when SvelteKit applies a named form action. */
export function inventoryAction(name: string, current: { search: string }): string {
	const query = new URLSearchParams(current.search);
	for (const key of [...query.keys()]) {
		if (key.startsWith('/')) query.delete(key);
	}
	query.set(`/${name}`, '');
	return `/mtg/inventory?${query}`;
}

/** SvelteKit keeps the loaded URL while shallow navigation changes the current view. */
export function effectiveInventoryUrl(current: {
	url: Pick<URL, 'search' | 'href' | 'pathname' | 'origin'>;
	shallow?: { url: Pick<URL, 'search' | 'href' | 'pathname' | 'origin'> } | null;
	state?: { searchOverlay?: { background?: string }; searchFullView?: { background?: string } };
}) {
	if (current.shallow?.url.pathname === '/mtg/inventory') return current.shallow.url;
	const background =
		current.state?.searchOverlay?.background ?? current.state?.searchFullView?.background;
	if (background) {
		try {
			const url = new URL(background, current.url.href);
			if (url.origin === current.url.origin && url.pathname === '/mtg/inventory') return url;
		} catch {
			/* A stale history entry falls back to the native route. */
		}
	}
	return current.url;
}

export function submittedDraftMatches(
	submitted: { id: string; notes: string; quantity: number },
	current: { id: string | undefined; notes: string; quantity: number }
) {
	return (
		submitted.id === current.id &&
		submitted.notes === current.notes &&
		submitted.quantity === current.quantity
	);
}

/** Confirm only fields sent by this attempt; other saved fields are not edit bases. */
export function confirmedInventoryBases(
	form: FormData,
	acknowledgement: { changes: Array<{ entryId: string; quantity: number; notesRevision: string }> },
	current: { notesOriginal: string; notesBase: string; quantityBase: number }
) {
	const change = acknowledgement.changes.find(
		(change) => change.entryId === String(form.get('entryId'))
	);
	if (!change) return current;
	const quantityChanged =
		form.has('quantity') &&
		(!form.has('quantityBase') ||
			Number(form.get('quantity')) !== Number(form.get('quantityBase')));
	const notesChanged =
		form.has('notes') &&
		(!form.has('notesOriginal') ||
			String(form.get('notes')) !== String(form.get('notesOriginal')) ||
			form.has('rebaseNotesRevision'));
	const notesSubmitted =
		notesChanged || (form.has('notes') && !quantityChanged && !form.has('delta'));
	return {
		notesOriginal: notesSubmitted ? String(form.get('notes')) : current.notesOriginal,
		notesBase: notesSubmitted ? change.notesRevision : current.notesBase,
		quantityBase: quantityChanged ? change.quantity : current.quantityBase
	};
}
