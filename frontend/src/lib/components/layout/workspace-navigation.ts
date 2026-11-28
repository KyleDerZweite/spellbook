export function hasWorkspaceNavigation(routeId: string | null, signedIn: boolean): boolean {
	return (
		signedIn &&
		routeId !== null &&
		(routeId.startsWith('/mtg/') ||
			routeId === '/settings' ||
			routeId.startsWith('/settings/') ||
			routeId === '/app/connect')
	);
}
