import { dev } from '$app/env';
import { error } from '@sveltejs/kit';

/** The experiment has no production entry point or database handle in Web. */
export function searchEvaluationOrigin() {
	if (!dev || !process.env.SEARCH_EVALUATION_URL) error(404, 'Not found');
	const origin = new URL(process.env.SEARCH_EVALUATION_URL);
	if (
		origin.protocol !== 'http:' ||
		!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) ||
		origin.username ||
		origin.password
	)
		error(503, 'The local search experiment is not configured');
	return origin.origin;
}
