import { PROFILE_ARTWORK_IDS } from '@spellbook/contracts/profile.ts';
import type { ProfileArtworkId } from '@spellbook/contracts/profile.ts';
export {
	DEFAULT_ARTWORK_ID,
	isProfileArtworkId,
	type ProfileArtworkId
} from '@spellbook/contracts/profile.ts';

const artwork: Record<ProfileArtworkId, { label: string; src: string }> = {
	grove: { label: 'Grove', src: '/profile/artwork/grove.webp' },
	tide: { label: 'Tide', src: '/profile/artwork/tide.webp' },
	ember: { label: 'Ember', src: '/profile/artwork/ember.webp' },
	astral: { label: 'Astral', src: '/profile/artwork/astral.webp' }
};
export const PROFILE_ARTWORK = PROFILE_ARTWORK_IDS.map((id) => ({ id, ...artwork[id] }));
export function getProfileArtwork(value: unknown) {
	return PROFILE_ARTWORK.find((artwork) => artwork.id === value) ?? PROFILE_ARTWORK[0];
}
