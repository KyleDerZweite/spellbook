import { error } from '@sveltejs/kit';
import { searchEvaluationOrigin } from '#lib/server/search-evaluation.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
	const origin = searchEvaluationOrigin();
	setHeaders({ 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' });
	const response = await fetch(`${origin}/state`);
	if (!response.ok) error(503, 'Start the local search evaluation service');
	return { experiment: await response.json() };
};
