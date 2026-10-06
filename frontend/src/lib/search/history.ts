/** Kit's shallow Back traversal bypasses beforeNavigate. Restore its own overlay entry. */
export function pendingOverlayBack(
	pending: boolean,
	background: string | undefined,
	destination: string
): boolean {
	return pending && background !== undefined && destination === background;
}
