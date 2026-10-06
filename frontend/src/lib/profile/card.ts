import type { ProfileTotals } from './types';

export const PROFILE_CARD_FRAMES = [
	{ value: 'white', label: 'White' },
	{ value: 'blue', label: 'Blue' },
	{ value: 'black', label: 'Black' },
	{ value: 'red', label: 'Red' },
	{ value: 'green', label: 'Green' },
	{ value: 'gold', label: 'Multicolor' },
	{ value: 'colorless', label: 'Colorless' }
] as const;

export const PROFILE_CARD_RARITIES = [
	{ value: 'common', label: 'Common' },
	{ value: 'uncommon', label: 'Uncommon' },
	{ value: 'rare', label: 'Rare' },
	{ value: 'mythic', label: 'Mythic' }
] as const;

export interface ProfileCardDefinition {
	template: 'mtg';
	name: string;
	frame: (typeof PROFILE_CARD_FRAMES)[number]['value'];
	legendary: boolean;
	rarity: (typeof PROFILE_CARD_RARITIES)[number]['value'];
	manaCost: string;
	typeLine: string;
	rulesText: string;
	flavorText: string;
	power: string;
	toughness: string;
}

export const PROFILE_CARD_LIMITS = {
	name: 40,
	manaCost: 80,
	typeLine: 60,
	rulesText: 400,
	flavorText: 120,
	power: 24,
	toughness: 24
} as const;

export const PROFILE_CARD_LINE_LIMITS = { rulesText: 8, flavorText: 3 } as const;

export const PROFILE_KPIS = [
	{ key: 'total_owned_cards', label: 'Owned copies', metric: 'total' },
	{ key: 'unique_card_names', label: 'Card names', metric: 'names' },
	{ key: 'owned_printings', label: 'Printings', metric: 'printings' },
	{ key: 'owned_sets', label: 'Sets represented', metric: 'sets' },
	{ key: 'foil_copies', label: 'Foil copies', metric: 'foils' },
	{ key: 'total_decks', label: 'Decks', metric: 'decks' }
] as const satisfies readonly { key: string; label: string; metric: keyof ProfileTotals }[];

export type ProfileKpiKey = (typeof PROFILE_KPIS)[number]['key'];
export type ProfileTemplateField = 'rulesText' | 'flavorText' | 'power' | 'toughness';
export type ProfileCardErrors = Partial<Record<keyof ProfileCardDefinition | 'form', string>>;

const manaSymbols = new Set([
	...Array.from({ length: 21 }, (_, i) => String(i)),
	'W',
	'U',
	'B',
	'R',
	'G',
	'C',
	'X',
	'Y',
	'Z',
	'S',
	'W/U',
	'W/B',
	'U/B',
	'U/R',
	'B/R',
	'B/G',
	'R/G',
	'R/W',
	'G/W',
	'G/U',
	'2/W',
	'2/U',
	'2/B',
	'2/R',
	'2/G',
	'W/P',
	'U/P',
	'B/P',
	'R/P',
	'G/P',
	'100',
	'1000000',
	'C/W',
	'C/U',
	'C/B',
	'C/R',
	'C/G',
	'W/U/P',
	'W/B/P',
	'U/B/P',
	'U/R/P',
	'B/R/P',
	'B/G/P',
	'R/G/P',
	'R/W/P',
	'G/W/P',
	'G/U/P'
]);

export function isProfileManaSymbol(value: string): boolean {
	return manaSymbols.has(value);
}

function isProfileTextSymbol(value: string): boolean {
	return isProfileManaSymbol(value) || ['T', 'Q', 'E'].includes(value);
}

export function validProfileManaCost(value: string): boolean {
	if (!value) return true;
	const symbols = [...value.matchAll(/\{([^{}]+)\}/g)];
	return (
		symbols.length <= 8 &&
		symbols.map((m) => m[0]).join('') === value &&
		symbols.every((m) => isProfileManaSymbol(m[1]))
	);
}

export function defaultProfileCard(username: string): ProfileCardDefinition {
	return {
		template: 'mtg',
		name: username,
		frame: 'green',
		legendary: true,
		rarity: 'rare',
		manaCost: '{2}{G}',
		typeLine: 'Legendary Creature · Collector',
		rulesText:
			'I own {total_owned_cards} cards across {unique_card_names} card names.\nMy collection spans {owned_sets} sets.',
		flavorText: '',
		power: '',
		toughness: ''
	};
}

export function demoProfileCard(): ProfileCardDefinition {
	return {
		...defaultProfileCard('demo'),
		name: 'Demo, Collection Keeper',
		rulesText:
			'Your inventory holds {total_owned_cards} copies.\n{unique_card_names} card names. {total_decks} decks.',
		flavorText: 'Every deck starts with a card worth keeping.'
	};
}

function templateError(value: string, allowMana: boolean): string | undefined {
	let error: string | undefined;
	const rest = value.replace(/\{([^{}]+)\}/g, (token, key: string) => {
		if (!PROFILE_KPIS.some((kpi) => kpi.key === key) && !(allowMana && isProfileTextSymbol(key))) {
			error ??= `Unknown placeholder ${token}. Choose a value from Insert KPI.`;
		}
		return '';
	});
	return (
		error ??
		(/[{}]/.test(rest)
			? 'Close each placeholder with braces, for example {total_owned_cards}.'
			: undefined)
	);
}

export function validateProfileCard(
	input: unknown
): { success: true; value: ProfileCardDefinition } | { success: false; errors: ProfileCardErrors } {
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		return { success: false, errors: { form: 'Choose a valid card design.' } };
	}
	const fields = input as Record<string, unknown>;
	const errors: ProfileCardErrors = {};
	const allowed = ['template', 'frame', 'legendary', 'rarity', ...Object.keys(PROFILE_CARD_LIMITS)];
	if (Object.keys(fields).some((key) => !allowed.includes(key)))
		errors.form = 'The card contains unsupported fields.';
	if (fields.template !== 'mtg') errors.template = 'Magic is the available card template.';
	if (!PROFILE_CARD_FRAMES.some((frame) => frame.value === fields.frame))
		errors.frame = 'Choose a frame color.';
	if (typeof fields.legendary !== 'boolean')
		errors.legendary = 'Choose a standard or legendary frame.';
	if (!PROFILE_CARD_RARITIES.some((rarity) => rarity.value === fields.rarity))
		errors.rarity = 'Choose a rarity.';

	const text: Record<string, string> = {};
	for (const [key, limit] of Object.entries(PROFILE_CARD_LIMITS)) {
		const field = key as keyof typeof PROFILE_CARD_LIMITS;
		const value = fields[field];
		if (typeof value !== 'string') {
			errors[field] = 'Enter text for this field.';
			continue;
		}
		text[field] = value.replace(/\r\n?/g, '\n').trim();
		if (text[field].length > limit) errors[field] = `Use at most ${limit} characters.`;
		if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))
			errors[field] = 'Remove control characters.';
		if (!['rulesText', 'flavorText'].includes(field) && /\n/.test(text[field]))
			errors[field] = 'Use one line for this field.';
	}
	for (const [field, limit] of Object.entries(PROFILE_CARD_LINE_LIMITS)) {
		if (text[field] && text[field].split('\n').length > limit)
			errors[field as keyof typeof PROFILE_CARD_LINE_LIMITS] = `Use at most ${limit} lines.`;
	}

	for (const field of ['name', 'typeLine'] as const) {
		if (field in text && !text[field])
			errors[field] = field === 'name' ? 'Enter a card name.' : 'Enter a type line.';
	}
	if ('manaCost' in text && !validProfileManaCost(text.manaCost)) {
		errors.manaCost = 'Use up to 8 mana symbols in braces, for example {2}{U}.';
	}
	for (const field of ['rulesText', 'flavorText', 'power', 'toughness'] as const) {
		if (field in text)
			errors[field] ??= templateError(text[field], field === 'rulesText' || field === 'flavorText');
	}
	for (const field of ['power', 'toughness'] as const) {
		const value = text[field];
		if (
			value &&
			!/^(?:-?\d{1,7}|[*XYZ](?:[+-]\d{1,2})?|\d{1,2}[+-][*XYZ])$/.test(value) &&
			!PROFILE_KPIS.some((kpi) => value === `{${kpi.key}}`)
		)
			errors[field] ??=
				'Use a number, *, X, a simple card value such as 1+*, or one KPI placeholder.';
	}

	if ('power' in text && 'toughness' in text && Boolean(text.power) !== Boolean(text.toughness)) {
		errors[text.power ? 'toughness' : 'power'] =
			'Fill both Power and Toughness, or leave both empty.';
	}
	if (Object.values(errors).some(Boolean)) return { success: false, errors };
	return { success: true, value: { ...fields, ...text } as unknown as ProfileCardDefinition };
}

const number = new Intl.NumberFormat('en');

export function profileKpiValue(key: string, totals: ProfileTotals | null): string | undefined {
	const kpi = PROFILE_KPIS.find((entry) => entry.key === key);
	if (!kpi) return undefined;
	return totals ? number.format(totals[kpi.metric]) : 'unavailable';
}

export function resolveProfileText(text: string, totals: ProfileTotals | null): string {
	return text.replace(
		/\{([^{}]+)\}/g,
		(token, key: string) => profileKpiValue(key, totals) ?? token
	);
}

export function profileTextSegments(
	text: string,
	totals: ProfileTotals | null
): Array<{ type: 'text' | 'mana'; value: string }> {
	return resolveProfileText(text, totals)
		.split(/(\{[^{}]+\})/g)
		.filter(Boolean)
		.map((value) => {
			const symbol = value.slice(1, -1);
			return {
				type: value.startsWith('{') && isProfileTextSymbol(symbol) ? 'mana' : 'text',
				value
			};
		});
}

export function insertProfileKpi(text: string, start: number, end: number, key: ProfileKpiKey) {
	const from = Math.max(0, Math.min(start, text.length));
	const to = Math.max(from, Math.min(end, text.length));
	const token = `{${key}}`;
	return { text: text.slice(0, from) + token + text.slice(to), caret: from + token.length };
}
