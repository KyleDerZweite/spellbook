import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user,
		spacetimeToken: locals.spacetimeToken,
		meiliSearchKey: locals.meiliSearchKey
	};
};
