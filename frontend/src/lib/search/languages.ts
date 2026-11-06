import type { CatalogLanguage } from './types.ts';

export const DEFAULT_SEARCH_LANGUAGES: CatalogLanguage[] = ['de', 'en'];
export const LANGUAGE_OPTIONS: { id: CatalogLanguage; label: string }[] = [
	{ id: 'de', label: 'German' },
	{ id: 'en', label: 'English' },
	{ id: 'es', label: 'Spanish' },
	{ id: 'fr', label: 'French' },
	{ id: 'it', label: 'Italian' },
	{ id: 'pt', label: 'Portuguese' },
	{ id: 'ja', label: 'Japanese' },
	{ id: 'ko', label: 'Korean' },
	{ id: 'ru', label: 'Russian' },
	{ id: 'zhs', label: 'Simplified Chinese' },
	{ id: 'zht', label: 'Traditional Chinese' },
	{ id: 'he', label: 'Hebrew' },
	{ id: 'la', label: 'Latin' },
	{ id: 'grc', label: 'Ancient Greek' },
	{ id: 'ar', label: 'Arabic' },
	{ id: 'sa', label: 'Sanskrit' },
	{ id: 'ph', label: 'Phyrexian' },
	{ id: 'qya', label: 'Quenya' },
	{ id: 'dw', label: 'Dwarvish' },
	{ id: 'tlh', label: 'Klingon' }
];
