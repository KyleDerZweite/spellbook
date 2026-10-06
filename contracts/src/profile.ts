export interface ProfileCardDefinition {
	template: 'mtg';
	name: string;
	frame: 'white' | 'blue' | 'black' | 'red' | 'green' | 'gold' | 'colorless';
	legendary: boolean;
	rarity: 'common' | 'uncommon' | 'rare' | 'mythic';
	manaCost: string;
	typeLine: string;
	rulesText: string;
	flavorText: string;
	power: string;
	toughness: string;
}

export const PROFILE_ARTWORK_IDS = ['grove', 'tide', 'ember', 'astral'] as const;
export type ProfileArtworkId = (typeof PROFILE_ARTWORK_IDS)[number];
export const DEFAULT_ARTWORK_ID: ProfileArtworkId = 'grove';
export const DEFAULT_AVATAR_ID = 'wizard';
export function isProfileArtworkId(value: unknown): value is ProfileArtworkId {
	return typeof value === 'string' && PROFILE_ARTWORK_IDS.some((id) => id === value);
}
