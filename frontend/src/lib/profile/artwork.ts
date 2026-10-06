export const PROFILE_ARTWORK = [
	{ id: 'grove', label: 'Grove', src: '/profile/artwork/grove.webp' },
	{ id: 'tide', label: 'Tide', src: '/profile/artwork/tide.webp' },
	{ id: 'ember', label: 'Ember', src: '/profile/artwork/ember.webp' },
	{ id: 'astral', label: 'Astral', src: '/profile/artwork/astral.webp' }
] as const;

export type ProfileArtworkId = (typeof PROFILE_ARTWORK)[number]['id'];
export const DEFAULT_ARTWORK_ID: ProfileArtworkId = 'grove';

export function isProfileArtworkId(value: unknown): value is ProfileArtworkId {
	return typeof value === 'string' && PROFILE_ARTWORK.some((artwork) => artwork.id === value);
}

export function getProfileArtwork(value: unknown) {
	return PROFILE_ARTWORK.find((artwork) => artwork.id === value) ?? PROFILE_ARTWORK[0];
}
