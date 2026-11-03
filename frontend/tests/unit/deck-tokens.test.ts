import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import DeckTokens from '#lib/components/decks/DeckTokens.svelte';
import type { DeckRelatedTokens, RelatedToken } from '@spellbook/contracts/deck-tokens.ts';

// Synthetic snapshot evidence exercises presentation without a provider or owned quantities.
const token = (id: string): RelatedToken => ({
	catalogCardId: id,
	canonicalCardId: null,
	name: 'Spirit',
	layout: 'double_faced_token',
	setCode: 'TST',
	collectorNumber: id,
	sourceEntryIds: [],
	faces: ['Front', 'Back'].map((name) => ({
		name,
		typeLine: 'Token Creature',
		colors: [],
		oracleText: '',
		power: '1',
		toughness: '1',
		imageUri: `https://example.test/${id}/${name}.png`,
		imageUriSmall: null
	}))
});
const snapshot = (
	status: DeckRelatedTokens['status'],
	items: RelatedToken[] = []
): DeckRelatedTokens => ({ status, items, unresolved: [], unavailableEntryIds: [] });
describe('Deck token appendix', () => {
	it('deduplicates printing IDs while preserving distinct Spirit printings and both faces', () => {
		const { body } = render(DeckTokens, {
			props: {
				tokens: snapshot('available', [token('one'), token('one'), token('two')]),
				entries: []
			}
		});
		expect(body.match(/<article/g)).toHaveLength(2);
		expect(body).toContain('one/Front.png');
		expect(body).toContain('two/Back.png');
		expect(body.match(/<details/g)).toHaveLength(2);
		expect(body).not.toMatch(/Add to deck|missing|owned/i);
	});
	it.each(['partial', 'unavailable'] as const)('shows %s source status', (status) => {
		const { body } = render(DeckTokens, { props: { tokens: snapshot(status), entries: [] } });
		expect(body).toContain('unavailable');
		expect(body).not.toContain('No directly linked tokens');
	});
	it('describes available empty references without claiming exhaustive token prediction', () => {
		const { body } = render(DeckTokens, { props: { tokens: snapshot('available'), entries: [] } });
		expect(body).toContain('No directly linked tokens');
		expect(body).toContain('Other token interactions may not be listed');
	});
});
