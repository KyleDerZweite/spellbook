import type { DeckCard, DeckRole } from '@spellbook/contracts/decks.ts';
import type { CardDocument } from '@spellbook/contracts/catalog.ts';

const primaryTypes = [
	'Land',
	'Creature',
	'Planeswalker',
	'Battle',
	'Artifact',
	'Enchantment',
	'Instant',
	'Sorcery'
];
const roles: { value: DeckRole; label: string }[] = [
	{ value: 'commander', label: 'Commander' },
	{ value: 'main', label: 'Main Deck' },
	{ value: 'sideboard', label: 'Sideboard' },
	{ value: 'companion', label: 'Companion' }
];

/** Roles partition Deck requirements; only Main Deck entries receive primary type groups. */
export function deckSections(
	entries: DeckCard[],
	visible: DeckCard[],
	documents: Record<string, CardDocument>
) {
	return roles.map((role) => {
		const grouped = new Map<string, DeckCard[]>();
		for (const card of visible.filter((card) => card.role === role.value)) {
			const document = documents[card.catalogCardId];
			const types = document?.type_line
				? document.type_line.split(' // ')[0].split('\u2014')[0].split(' - ')[0].split(/\s+/)
				: (document?.card_types ?? []);
			const type = primaryTypes.find((type) => types.includes(type)) ?? 'Other';
			const label = role.value === 'main' ? type : role.label;
			grouped.set(label, [...(grouped.get(label) ?? []), card]);
		}
		return {
			...role,
			count: entries
				.filter((card) => card.role === role.value)
				.reduce((sum, card) => sum + card.quantity, 0),
			groups: [...grouped].sort(([a], [b]) => a.localeCompare(b))
		};
	});
}
