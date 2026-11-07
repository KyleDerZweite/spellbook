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
