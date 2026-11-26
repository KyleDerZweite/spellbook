export const DEFAULT_PHASE_RS_URL = 'https://phase-rs.dev';
export const PHASE_RS_URL_STORAGE_KEY = 'spellbook.phaseRsUrl';

const DEFAULT_PHASE_RS_HREF = new URL(DEFAULT_PHASE_RS_URL).href;

export function normalizePhaseRsUrl(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return '';
	if (trimmed.length > 500) return null;
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		return null;
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
	if (parsed.href === DEFAULT_PHASE_RS_HREF) return DEFAULT_PHASE_RS_URL;
	const normalized =
		parsed.pathname === '/' && !parsed.search && !parsed.hash ? parsed.origin : parsed.toString();
	if (normalized.length > 500) return null;
	return normalized;
}

function defaultStorage(): Storage | null {
	if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) return null;
	try {
		return globalThis.localStorage;
	} catch {
		return null;
	}
}

export function getSavedPhaseRsUrl(
	storage: Pick<Storage, 'getItem'> | null = defaultStorage()
): string {
	if (!storage) return '';
	try {
		const raw = storage.getItem(PHASE_RS_URL_STORAGE_KEY);
		if (!raw) return '';
		const normalized = normalizePhaseRsUrl(raw);
		return normalized && normalized !== DEFAULT_PHASE_RS_URL ? normalized : '';
	} catch {
		return '';
	}
}

export function getPhaseRsUrl(storage: Pick<Storage, 'getItem'> | null = defaultStorage()): string {
	return getSavedPhaseRsUrl(storage) || DEFAULT_PHASE_RS_URL;
}

export function savePhaseRsUrl(
	value: string,
	storage: Pick<Storage, 'setItem' | 'removeItem'> | null = defaultStorage()
): string | null {
	const normalized = normalizePhaseRsUrl(value);
	if (normalized === null) return null;
	if (storage) {
		try {
			if (!normalized || normalized === DEFAULT_PHASE_RS_URL) {
				storage.removeItem(PHASE_RS_URL_STORAGE_KEY);
			} else {
				storage.setItem(PHASE_RS_URL_STORAGE_KEY, normalized);
			}
		} catch {
			return null;
		}
	}
	return normalized || DEFAULT_PHASE_RS_URL;
}
