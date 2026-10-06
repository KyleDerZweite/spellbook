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

export const PROFILE_AVATAR_IDS = [
	'wizard',
	'knight',
	'ranger',
	'rogue',
	'dragon',
	'slime'
] as const;
export type AvatarId = (typeof PROFILE_AVATAR_IDS)[number];
export function isAvatarId(value: unknown): value is AvatarId {
	return typeof value === 'string' && PROFILE_AVATAR_IDS.some((id) => id === value);
}

export interface ProfileTotals {
	total: number;
	names: number;
	printings: number;
	sets: number;
	foils: number;
	decks: number;
}
export interface ProfileSettings {
	user: import('./auth.ts').AuthUser;
	card: ProfileCardDefinition;
	totals: ProfileTotals | null;
	statsError: string | null;
}
export interface ProfilePatch {
	email?: string;
	avatarId?: AvatarId;
	artworkId?: ProfileArtworkId;
	profileCard?: Partial<ProfileCardDefinition>;
}
export interface ProfileApplication {
	get(actor: import('./auth.ts').AuthUser): Promise<ProfileSettings>;
	patch(actor: import('./auth.ts').AuthUser, input: ProfilePatch): Promise<ProfileSettings>;
}
export type ProfileFailure =
	| { kind: 'ValidationFailed'; message: string; fields: Record<string, string> }
	| { kind: 'Unauthenticated'; message: string };

export function normalizeContactEmail(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const email = value.trim();
	return email.length <= 254 &&
		(email === '' ||
			/^[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)+$/i.test(
				email
			))
		? email
		: null;
}

export interface SummaryFailure {
	kind: 'SummaryOutOfRange';
	message: string;
}

export const SUMMARY_RANGE_MESSAGE = 'Your collection totals exceed the supported reporting range.';
export interface SummaryOutOfRangeResponse {
	status: 503;
	message: typeof SUMMARY_RANGE_MESSAGE;
}
