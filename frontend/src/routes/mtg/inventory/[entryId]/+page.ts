import { translate } from '#lib/i18n/messages.ts';
import { error } from '@sveltejs/kit';
import { demoInventoryEntry, readDemoInventory } from '#lib/demo/inventory.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data, parent, params }) => {
	const { demoSession, locale } = await parent();
	if (!demoSession || typeof window === 'undefined') return data;
	const state = await readDemoInventory(demoSession);
	const detail = state ? demoInventoryEntry(state, params.entryId.toLowerCase()) : data.detail;
	if (!detail) error(404, translate(locale, 'notice.Inventory.entry.not.found'));
	return { ...data, detail, groups: state?.groups ?? data.groups };
};
