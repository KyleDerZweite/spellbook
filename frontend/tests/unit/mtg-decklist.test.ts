import { describe, expect, it } from 'vitest';
import { formatArenaDecklist, parseArenaDecklist } from '../../src/lib/server/mtg/decklist';

describe('parseArenaDecklist', () => {
	it('parses quantity and name', () => {
		const parsed = parseArenaDecklist('4 Lightning Bolt');
		expect(parsed.lines[0]).toMatchObject({ quantity: 4, name: 'Lightning Bolt', role: 'main' });
	});

	it('parses 4x format', () => {
		const parsed = parseArenaDecklist('4x Lightning Bolt');
		expect(parsed.lines[0].quantity).toBe(4);
	});

	it('parses set and collector number', () => {
		const parsed = parseArenaDecklist('2 Opt (STA) 19');
		expect(parsed.lines[0]).toMatchObject({ setCode: 'sta', collectorNumber: '19' });
	});

	it('parses sideboard, commander, and companion sections', () => {
		const parsed = parseArenaDecklist(
			'Sideboard\n2 Negate\nCommander\n1 Atraxa\nCompanion\n1 Jegantha'
		);
		expect(parsed.lines.map((line) => line.role)).toEqual(['sideboard', 'commander', 'companion']);
	});

	it('merges duplicate lines by name, printing, and role', () => {
		const parsed = parseArenaDecklist('2 Opt (STA) 19\n2 Opt (STA) 19');
		expect(parsed.lines).toHaveLength(1);
		expect(parsed.lines[0].quantity).toBe(4);
	});

	it('ignores comments and blank lines', () => {
		const parsed = parseArenaDecklist('# comment\n\n// comment\n; comment\n1 Opt');
		expect(parsed.lines).toHaveLength(1);
	});

	it('keeps malformed lines as unresolved preview input', () => {
		const parsed = parseArenaDecklist('Lightning Bolt');
		expect(parsed.malformed[0]).toMatchObject({ raw: 'Lightning Bolt' });
	});
});

describe('formatArenaDecklist', () => {
	it('exports main only', () => {
		expect(formatArenaDecklist([deckCard({ quantity: 4, name: 'Lightning Bolt' })])).toBe(
			'Deck\n4 Lightning Bolt (STA)\n'
		);
	});

	it('exports main and sideboard', () => {
		const text = formatArenaDecklist([
			deckCard({ quantity: 4, name: 'Lightning Bolt' }),
			deckCard({ quantity: 2, name: 'Negate', role: 'sideboard' })
		]);
		expect(text).toContain('Deck');
		expect(text).toContain('Sideboard');
		expect(text).toContain('2 Negate (STA)');
	});

	it('exports exact printing when collector number is present', () => {
		const text = formatArenaDecklist([
			{ ...deckCard({ quantity: 4, name: 'Lightning Bolt' }), collectorNumber: '42' } as never
		]);
		expect(text).toContain('4 Lightning Bolt (STA) 42');
	});
});

function deckCard(overrides: Record<string, unknown>) {
	return {
		id: 'entry-1',
		deckId: 'deck-1',
		accountId: 'account-1',
		game: 'mtg',
		catalogCardId: 'card-1',
		canonicalCardId: 'oracle-1',
		name: 'Card',
		setCode: 'sta',
		imageUri: '',
		quantity: 1,
		role: 'main',
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	};
}
