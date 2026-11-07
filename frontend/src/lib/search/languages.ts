import { translate } from '#lib/i18n/messages.ts';
import type { Locale } from '#lib/i18n/locale.ts';
import type { CatalogLanguage } from './types.ts';

export const DEFAULT_SEARCH_LANGUAGES: CatalogLanguage[] = ['de', 'en'];
export const LANGUAGE_OPTIONS: { id: CatalogLanguage; label: string; flag: string }[] = [
	{ id: 'de', label: 'German', flag: '🇩🇪' },
	{ id: 'en', label: 'English', flag: '🇬🇧' },
	{ id: 'es', label: 'Spanish', flag: '🇪🇸' },
	{ id: 'fr', label: 'French', flag: '🇫🇷' },
	{ id: 'it', label: 'Italian', flag: '🇮🇹' },
	{ id: 'pt', label: 'Portuguese', flag: '🇵🇹' },
	{ id: 'ja', label: 'Japanese', flag: '🇯🇵' },
	{ id: 'ko', label: 'Korean', flag: '🇰🇷' },
	{ id: 'ru', label: 'Russian', flag: '🇷🇺' },
	{ id: 'zhs', label: 'Simplified Chinese', flag: '🇨🇳' },
	{ id: 'zht', label: 'Traditional Chinese', flag: '🇹🇼' },
	{ id: 'he', label: 'Hebrew', flag: '🇮🇱' },
	{ id: 'la', label: 'Latin', flag: '🇻🇦' },
	{ id: 'grc', label: 'Ancient Greek', flag: '🇬🇷' },
	{ id: 'ar', label: 'Arabic', flag: '🇸🇦' },
	{ id: 'sa', label: 'Sanskrit', flag: '🇮🇳' },
	{ id: 'ph', label: 'Phyrexian', flag: '⚑' },
	{ id: 'qya', label: 'Quenya', flag: '⚑' },
	{ id: 'dw', label: 'Dwarvish', flag: '⚑' },
	{ id: 'tlh', label: 'Klingon', flag: '⚑' }
];

export function printingLanguageOptions(locale: Locale) {
	return LANGUAGE_OPTIONS.map((option) => ({
		...option,
		label: translate(locale, `printingLanguage.${option.id}`)
	}));
}
