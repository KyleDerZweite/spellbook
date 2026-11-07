import en from './en.json';
import { translate, type MessageKey } from './messages.ts';
import type { Locale } from './locale.ts';
// API validation messages currently have no stable codes. Match only complete known
// messages at presentation boundaries. Never traverse payloads or translate user data.
// Unknown messages retain useful validation details until an explicit mapping exists.
const known = new Map(
	Object.entries(en)
		.filter(([, value]) => !value.includes('{'))
		.map(([key, value]) => [value, key as MessageKey])
);
export function localizeMessage(locale: Locale, message: string): string {
	const characters = /^Use at most (\d+) characters\.$/.exec(message);
	if (characters) return translate(locale, 'validation.characters', { count: characters[1] });
	const lines = /^Use at most (\d+) lines\.$/.exec(message);
	if (lines) return translate(locale, 'validation.lines', { count: lines[1] });
	const placeholder = /^Unknown placeholder (\{[^{}]+\}). Choose a value from Insert KPI\.$/.exec(
		message
	);
	if (placeholder) return translate(locale, 'validation.placeholder', { token: placeholder[1] });
	if (message === 'Close each placeholder with braces, for example {total_owned_cards}.')
		return translate(locale, 'validation.braces', { example: '{total_owned_cards}' });
	if (message === 'Use up to 8 mana symbols in braces, for example {2}{U}.')
		return translate(locale, 'validation.mana', { example: '{2}{U}' });
	const key = known.get(message);
	return key ? translate(locale, key) : message;
}
