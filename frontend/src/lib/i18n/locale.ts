export const locales = ['en', 'de'] as const;
export type Locale = (typeof locales)[number];
export const LOCALE_COOKIE = 'website-language';
export function isLocale(value: unknown): value is Locale {
	return value === 'en' || value === 'de';
}
/** Respect preference weights, ignore invalid ranges and explicitly excluded languages. */
export function negotiateLocale(cookie: unknown, acceptLanguage: string | null): Locale {
	if (isLocale(cookie)) return cookie;
	const preferences = (acceptLanguage ?? '')
		.split(',')
		.map((range, index) => {
			const [tag, ...parameters] = range.trim().toLowerCase().split(';');
			const weight = parameters.find((part) => part.trim().startsWith('q='));
			const q = weight ? Number(weight.trim().slice(2)) : 1;
			return { tag: tag.split('-')[0], q, index };
		})
		.filter(({ q }) => Number.isFinite(q) && q > 0 && q <= 1)
		.sort((a, b) => b.q - a.q || a.index - b.index);
	return (preferences.find(({ tag }) => isLocale(tag))?.tag as Locale) ?? 'en';
}
