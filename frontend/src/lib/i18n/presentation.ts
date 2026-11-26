import type { LegalityWarning } from '@spellbook/contracts/decks.ts';
import en from './en.json';
import de from './de.json';
import { translate, type MessageKey } from './messages.ts';
import { locales, type Locale } from './locale.ts';
// API validation messages currently have no stable codes. Match only complete known
// messages at presentation boundaries. Never traverse payloads or translate user data.
// Both dictionaries are recognized so retained action errors follow later language changes.
// Unknown messages retain useful validation details until an explicit mapping exists.
const known = new Map(
	[...Object.entries(en), ...Object.entries(de)]
		.filter(([, value]) => !value.includes('{'))
		.map(([key, value]) => [value, key as MessageKey])
);
export function localizeMessage(locale: Locale, message: string): string {
	const characters = /^(?:Use at most (\d+) characters\.|Verwende höchstens (\d+) Zeichen\.)$/.exec(
		message
	);
	if (characters)
		return translate(locale, 'validation.characters', { count: characters[1] ?? characters[2] });
	const lines = /^(?:Use at most (\d+) lines\.|Verwende höchstens (\d+) Zeilen\.)$/.exec(message);
	if (lines) return translate(locale, 'validation.lines', { count: lines[1] ?? lines[2] });
	const placeholder =
		/^(?:Unknown placeholder (\{[^{}]+\}). Choose a value from Insert KPI\.|Unbekannter Platzhalter (\{[^{}]+\}). Wähle einen Wert aus KPI einfügen\.)$/.exec(
			message
		);
	if (placeholder)
		return translate(locale, 'validation.placeholder', { token: placeholder[1] ?? placeholder[2] });
	if (
		locales.some(
			(source) =>
				message === translate(source, 'validation.braces', { example: '{total_owned_cards}' })
		)
	)
		return translate(locale, 'validation.braces', { example: '{total_owned_cards}' });
	if (
		locales.some(
			(source) => message === translate(source, 'validation.mana', { example: '{2}{U}' })
		)
	)
		return translate(locale, 'validation.mana', { example: '{2}{U}' });
	const key = known.get(message);
	return key ? translate(locale, key) : message;
}

export function localizeLegalityWarning(locale: Locale, warning: LegalityWarning): string {
	switch (warning.code) {
		case 'main_under_60':
			return translate(locale, 'deck.legality.warning.main_under_60');
		case 'sideboard_over_15':
			return translate(locale, 'deck.legality.warning.sideboard_over_15');
		case 'commander_size':
			return translate(locale, 'deck.legality.warning.commander_size');
		case 'commander_count':
			return translate(locale, 'deck.legality.warning.commander_count');
		case 'commander_color_identity':
			return warning.cardName
				? translate(locale, 'deck.legality.warning.commander_color_identity', {
						card: warning.cardName
					})
				: warning.message;
		case 'commander_ineligible':
			return warning.cardName
				? translate(locale, 'deck.legality.warning.commander_ineligible', {
						card: warning.cardName
					})
				: warning.message;
		case 'commander_invalid_pairing': {
			const match = /^(.+) and (.+) cannot be paired as commanders\.$/.exec(warning.message);
			return match
				? translate(locale, 'deck.legality.warning.commander_invalid_pairing', {
						first: match[1],
						second: match[2]
					})
				: warning.message;
		}
		case 'too_many_copies':
		case 'restricted_copies':
		case 'commander_singleton': {
			const match = /^(.+) exceeds the (\d+)-copy limit in (.+)\.$/.exec(warning.message);
			return match
				? translate(locale, 'deck.legality.warning.copy_limit', {
						card: warning.cardName || match[1],
						limit: match[2],
						format: match[3]
					})
				: warning.message;
		}
		case 'format_illegal': {
			const match = /^(.+) is ([^\s]+) in (.+)\.$/.exec(warning.message);
			if (!match) return warning.message;
			const rawStatus = match[2];
			const status =
				rawStatus === 'not_legal'
					? translate(locale, 'deck.legality.status.not_legal')
					: rawStatus === 'banned'
						? translate(locale, 'deck.legality.status.banned')
						: rawStatus;
			return translate(locale, 'deck.legality.warning.format_illegal', {
				card: warning.cardName || match[1],
				status,
				format: match[3]
			});
		}
		default:
			return warning.message;
	}
}
