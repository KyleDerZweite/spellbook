import { describe, expect, it } from 'vitest';
import { hasWorkspaceNavigation } from '#lib/components/layout/workspace-navigation.ts';

describe('workspace bottom navigation', () => {
	it.each([
		'/mtg/dashboard',
		'/mtg/search',
		'/mtg/inventory/[entryId]',
		'/mtg/decks/[deckId]/playtest',
		'/settings',
		'/settings/physical-boxes',
		'/app/connect'
	])('is available to signed-in users on %s', (routeId) => {
		expect(hasWorkspaceNavigation(routeId, true)).toBe(true);
		expect(hasWorkspaceNavigation(routeId, false)).toBe(false);
	});

	it.each(['/', '/app', '/auth/login', '/auth/register', '/auth/approve', '/terms', null])(
		'keeps %s header-only even for signed-in users',
		(routeId) => {
			expect(hasWorkspaceNavigation(routeId, true)).toBe(false);
		}
	);
});
