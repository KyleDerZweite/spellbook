import AsyncStorage from '@react-native-async-storage/async-storage';

export type Language = 'en' | 'de';
export type Theme = 'system' | 'light' | 'dark';
export type Preferences = { origin: string; language: Language; theme: Theme };

export const defaults: Preferences = {
	origin: '',
	language: Intl.DateTimeFormat().resolvedOptions().locale.startsWith('de') ? 'de' : 'en',
	theme: 'system'
};

export function normalizeOrigin(input: string) {
	try {
		const url = new URL(input.trim());
		const localHttp =
			__DEV__ &&
			url.protocol === 'http:' &&
			['localhost', '127.0.0.1', '[::1]', '10.0.2.2'].includes(url.hostname);
		if (
			(!localHttp && url.protocol !== 'https:') ||
			url.username ||
			url.password ||
			url.pathname !== '/' ||
			url.search ||
			url.hash
		)
			return '';
		return url.origin;
	} catch {
		return '';
	}
}

const key = 'spellbook.preferences';

export async function loadPreferences(): Promise<Preferences> {
	const raw = await AsyncStorage.getItem(key);
	if (!raw) return defaults;
	const saved: Partial<Preferences> = JSON.parse(raw);
	return {
		origin: normalizeOrigin(saved.origin ?? ''),
		language:
			saved.language === 'de' || saved.language === 'en' ? saved.language : defaults.language,
		theme: saved.theme === 'dark' || saved.theme === 'light' ? saved.theme : 'system'
	};
}

export function savePreferences(preferences: Preferences) {
	return AsyncStorage.setItem(key, JSON.stringify(preferences));
}
