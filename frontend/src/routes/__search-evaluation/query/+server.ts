import { error, json, type RequestHandler } from '@sveltejs/kit';
import { searchEvaluationOrigin } from '#lib/server/search-evaluation.ts';

export const POST: RequestHandler = async ({ request, fetch }) => {
	const origin = searchEvaluationOrigin();
	const raw = await request.text();
	if (raw.length > 1024) error(400, 'Search input is too long');
	let input: unknown;
	try {
		input = JSON.parse(raw);
	} catch {
		error(400, 'Invalid search input');
	}
	if (
		!input ||
		typeof input !== 'object' ||
		!('query' in input) ||
		typeof input.query !== 'string' ||
		input.query.length > 300 ||
		!('variant' in input) ||
		typeof input.variant !== 'string'
	)
		error(400, 'Invalid search input');
	const response = await fetch(`${origin}/search`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query: input.query, variant: input.variant }),
		signal: request.signal
	});
	if (!response.ok) error(503, 'The search experiment could not complete this query');
	return json(await response.json(), { headers: { 'cache-control': 'no-store' } });
};
