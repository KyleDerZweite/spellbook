import type { PowerSearchResponse } from '@spellbook/contracts/power-search.ts';

export type PowerSearchKind =
	'catalog' | 'inventory' | 'deck' | 'deck-card' | 'setting' | 'page' | 'action';
export interface PowerSearchRow {
	id: string;
	kind: PowerSearchKind;
	name: string;
	description: string;
	href: string;
}
export interface PowerSearchGroup {
	id: string;
	label: string;
	rows: PowerSearchRow[];
}

const targets: (PowerSearchRow & { aliases: string[] })[] = [
	{
		id: 'new-deck',
		kind: 'action',
		name: 'New deck',
		description: '',
		href: '/mtg/decks?flow=create',
		aliases: ['deck erstellen', 'create deck']
	},
	{
		id: 'import-deck',
		kind: 'action',
		name: 'Import deck',
		description: '',
		href: '/mtg/decks?flow=import',
		aliases: ['deck importieren']
	},
	{
		id: 'search',
		kind: 'page',
		name: 'Card Search',
		description: 'Search the complete catalog',
		href: '/mtg/search',
		aliases: ['karten suchen', 'kartensuche', 'catalog']
	},
	{
		id: 'inventory',
		kind: 'inventory',
		name: 'Inventory',
		description: 'Your owned cards',
		href: '/mtg/inventory',
		aliases: ['inventar', 'sammlung', 'owned cards']
	},
	{
		id: 'decks',
		kind: 'deck',
		name: 'Decks',
		description: 'Your deck library',
		href: '/mtg/decks',
		aliases: ['deckbibliothek']
	},
	{
		id: 'profile',
		kind: 'setting',
		name: 'Profile',
		description: 'Settings',
		href: '/settings',
		aliases: ['settings', 'einstellungen', 'profil', 'account', 'email']
	},
	{
		id: 'profile-card',
		kind: 'setting',
		name: 'Profile card',
		description: 'Settings',
		href: '/settings/profile-card',
		aliases: ['profilkarte', 'artwork']
	},
	{
		id: 'password',
		kind: 'setting',
		name: 'Password',
		description: 'Settings',
		href: '/settings/password',
		aliases: ['passwort ändern', 'change password', 'passwort']
	},
	{
		id: 'keybind',
		kind: 'setting',
		name: 'Power-user search',
		description: 'Keyboard shortcut in Settings',
		href: '/settings#power-user-search',
		aliases: ['keybind', 'shortcut', 'tastenkürzel', 'keyboard', 'strg k', 'ctrl k']
	}
];

function normalize(value: string) {
	return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

export function powerSearchNavigation(query: string): PowerSearchGroup[] {
	const words = normalize(query).split(' ').filter(Boolean);
	const matches = targets.filter(
		(target) =>
			!words.length ||
			[target.name, ...target.aliases].some((text) =>
				words.every((word) =>
					normalize(text)
						.split(' ')
						.some((part) => part.startsWith(word))
				)
			)
	);
	return [
		{ id: 'actions', label: 'Actions', rows: matches.filter((row) => row.kind === 'action') },
		{
			id: 'navigation',
			label: 'Pages',
			rows: matches.filter((row) => row.kind !== 'action' && row.kind !== 'setting')
		},
		{ id: 'settings', label: 'Settings', rows: matches.filter((row) => row.kind === 'setting') }
	].filter((group) => group.rows.length);
}

/** A canonical identity stays distinct in every source and every Deck. */
export function powerSearchGroups(
	value: PowerSearchResponse,
	accountId: string | null
): PowerSearchGroup[] {
	const privateAllowed = !!accountId && value.accountId === accountId;
	const groups: PowerSearchGroup[] = [
		{
			id: 'catalog',
			label: 'Card Search',
			rows: value.cards.map((hit) => ({
				id: `catalog:${hit.canonicalCardId}`,
				kind: hit.kind,
				name: hit.name,
				description: 'Card Search',
				href: `/mtg/search?${new URLSearchParams({ q: hit.name, printing: hit.catalogCardId })}`
			}))
		},
		{
			id: 'inventory',
			label: 'Inventory',
			rows: privateAllowed
				? value.inventory.map((hit) => ({
						id: `inventory:${hit.canonicalCardId}`,
						kind: hit.kind,
						name: hit.name,
						description: `${hit.quantity} owned ${hit.quantity === 1 ? 'copy' : 'copies'}`,
						href: `/mtg/inventory?${new URLSearchParams({ q: hit.name })}`
					}))
				: []
		},
		{
			id: 'decks',
			label: 'Decks',
			rows: privateAllowed
				? value.decks.map((hit) => ({
						id:
							hit.kind === 'deck'
								? `deck:${hit.deckId}`
								: `deck-card:${hit.deckId}:${hit.canonicalCardId}`,
						kind: hit.kind,
						name: hit.name,
						description:
							hit.kind === 'deck'
								? hit.format
								: `${hit.deckName} · ${hit.quantity} ${hit.quantity === 1 ? 'copy' : 'copies'}`,
						href: `/mtg/decks?${new URLSearchParams({ deck: hit.deckId })}`
					}))
				: []
		}
	];
	return groups.filter((group) => group.rows.length);
}

export interface PowerSearchReadState {
	groups: PowerSearchGroup[];
	pending: boolean;
	error: string;
}

/** One read owner handles debounce, cancellation and account/publication fencing. */
export function createPowerSearchReader(input: {
	read?: typeof fetch;
	account: () => string | null;
	changed: (state: PowerSearchReadState) => void;
}) {
	let sequence = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let controller: AbortController | undefined;
	function clear() {
		sequence++;
		clearTimeout(timer);
		controller?.abort();
		input.changed({ groups: [], pending: false, error: '' });
	}
	return {
		clear,
		search(query: string, accountId: string | null, publication: () => boolean = () => true) {
			clear();
			if (query.trim().length < 2) return;
			const current = sequence;
			const request = new AbortController();
			controller = request;
			const valid = () =>
				current === sequence &&
				!request.signal.aborted &&
				input.account() === accountId &&
				publication();
			input.changed({ groups: [], pending: true, error: '' });
			timer = setTimeout(async () => {
				try {
					const response = await (input.read ?? fetch)(
						`/api/v1/mtg/power-search?${new URLSearchParams({ query })}`,
						{
							cache: 'no-store',
							credentials: 'same-origin',
							signal: request.signal
						}
					);
					if (!response.ok) throw new Error('Search unavailable');
					const value: PowerSearchResponse = await response.json();
					if (valid())
						input.changed({
							groups: powerSearchGroups(value, accountId),
							pending: false,
							error: ''
						});
				} catch {
					if (valid())
						input.changed({
							groups: [],
							pending: false,
							error: 'Search unavailable. Page and Settings matches remain usable.'
						});
				}
			}, 150);
		}
	};
}
