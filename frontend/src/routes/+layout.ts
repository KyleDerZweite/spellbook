import { demoGeneration } from '#lib/demo/storage.ts';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ data, url }) => {
	let demoWriteGeneration: string | undefined;
	if (data.demoSession && typeof window !== 'undefined') {
		// Read the URL so SvelteKit reloads the generation with each workspace navigation.
		void url.href;
		demoWriteGeneration = await demoGeneration(data.demoSession);
	}
	return { ...data, demoWriteGeneration };
};
