/** Rendered Group rows, retaining focus by identity across metadata deletion and reorder. */
export function groupDirectoryIndexes(
	groups: readonly { id: string }[],
	start: number,
	end: number,
	lazy: boolean,
	focusedId: string | null
) {
	const focused = focusedId === null ? -1 : groups.findIndex((group) => group.id === focusedId);
	return [
		...new Set([
			...Array.from({ length: Math.max(0, end - start) }, (_, index) => start + index),
			...(lazy && focused >= 0 ? [focused] : [])
		])
	]
		.filter((index) => index >= 0 && index < groups.length)
		.slice(0, lazy ? 200 : 500)
		.sort((a, b) => a - b);
}
