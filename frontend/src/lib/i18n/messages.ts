import en from './en.json';
import de from './de.json';
import type { Locale } from './locale.ts';
export type MessageKey = keyof typeof en;
// JSON imports widen values to string; the generated parameter contract preserves literal names.
import type { MessageParameters } from './parameters.ts';
export type MessageValues<K extends MessageKey> = K extends keyof MessageParameters
	? MessageParameters[K]
	: Record<string, never>;
const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, de };
const placeholders = (message: string) =>
	[...message.matchAll(/\{(\w+)\}/g)]
		.map((match) => match[1])
		.sort()
		.join(',');
export function validateDictionaries(): void {
	if (Object.keys(en).sort().join() !== Object.keys(de).sort().join())
		throw new Error('Translation keys differ');
	for (const key of Object.keys(en) as MessageKey[]) {
		if (!en[key] || !de[key] || placeholders(en[key]) !== placeholders(de[key]))
			throw new Error(`Invalid translation: ${key}`);
	}
}
validateDictionaries();
export function translate<K extends MessageKey>(
	locale: Locale,
	key: K,
	...args: K extends keyof MessageParameters
		? [values: MessageValues<K>]
		: [values?: MessageValues<K>]
): string {
	const values = args[0] ?? {};
	return dictionaries[locale ?? 'en'][key].replace(/\{(\w+)\}/g, (_, name: string) => {
		if (!(name in values)) throw new Error(`Missing translation parameter: ${key}.${name}`);
		return String((values as Record<string, string | number>)[name]);
	});
}
export function pluralKey(locale: Locale, count: number): 'one' | 'other' {
	return new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other';
}
