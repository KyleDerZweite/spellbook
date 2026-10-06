export * from '@spellbook/contracts/profile-card.ts';
import {
	PROFILE_KPIS,
	isProfileTextSymbol,
	type ProfileKpiKey
} from '@spellbook/contracts/profile-card.ts';
import type { ProfileTotals } from '@spellbook/contracts/profile.ts';

const number = new Intl.NumberFormat('en');

export function profileKpiValue(key: string, totals: ProfileTotals | null): string | undefined {
	const kpi = PROFILE_KPIS.find((entry) => entry.key === key);
	if (!kpi) return undefined;
	return totals ? number.format(totals[kpi.metric]) : 'unavailable';
}

export function resolveProfileText(text: string, totals: ProfileTotals | null): string {
	return text.replace(
		/\{([^{}]+)\}/g,
		(token, key: string) => profileKpiValue(key, totals) ?? token
	);
}

export function profileTextSegments(
	text: string,
	totals: ProfileTotals | null
): Array<{ type: 'text' | 'mana'; value: string }> {
	return resolveProfileText(text, totals)
		.split(/(\{[^{}]+\})/g)
		.filter(Boolean)
		.map((value) => {
			const symbol = value.slice(1, -1);
			return {
				type: value.startsWith('{') && isProfileTextSymbol(symbol) ? 'mana' : 'text',
				value
			};
		});
}

export function insertProfileKpi(text: string, start: number, end: number, key: ProfileKpiKey) {
	const from = Math.max(0, Math.min(start, text.length));
	const to = Math.max(from, Math.min(end, text.length));
	const token = `{${key}}`;
	return { text: text.slice(0, from) + token + text.slice(to), caret: from + token.length };
}
