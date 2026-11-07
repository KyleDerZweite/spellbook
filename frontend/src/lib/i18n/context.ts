import { getContext, setContext } from 'svelte';
import type { Locale } from './locale.ts';
import { translate, pluralKey, type MessageKey, type MessageValues } from './messages.ts';
const KEY = Symbol('website-language');
export function createLanguage(locale: () => Locale) {
	return {
		get locale() {
			return locale();
		},
		t: <K extends MessageKey>(
			key: K,
			...args: K extends keyof import('./parameters.ts').MessageParameters
				? [values: MessageValues<K>]
				: [values?: MessageValues<K>]
		) => translate(locale(), key, ...args),
		plural: (count: number) => pluralKey(locale(), count),
		number: (value: number | bigint, options?: Intl.NumberFormatOptions) =>
			new Intl.NumberFormat(locale(), options).format(value),
		date: (value: Date | number, options?: Intl.DateTimeFormatOptions) =>
			new Intl.DateTimeFormat(locale(), options).format(value)
	};
}
export function provideLanguage(locale: () => Locale) {
	return setContext(KEY, createLanguage(locale));
}
export function useLanguage() {
	return getContext<ReturnType<typeof createLanguage>>(KEY) ?? createLanguage(() => 'en');
}
