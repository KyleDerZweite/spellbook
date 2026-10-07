import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { ScanSession, ScanSessionResult } from '@spellbook/contracts/scan.ts';

export const load: PageServerLoad = async ({ locals, url, fetch }) => {
	if (!locals.user)
		redirect(303, `/auth/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`);
	const response = await fetch('/api/mobile/v1/mtg/scan/sessions');
	if (!response.ok) error(response.status, 'Unable to load scan sessions');
	const { sessions } = (await response.json()) as { sessions: ScanSession[] };
	const sessionId = url.searchParams.get('session');
	let result: ScanSessionResult | null = null;
	if (sessionId) {
		if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sessionId))
			error(400, 'Invalid scan session');
		const resultResponse = await fetch(`/api/mobile/v1/mtg/scan/sessions/${sessionId}/result`);
		if (!resultResponse.ok) error(resultResponse.status, 'Unable to load scan session');
		result = (await resultResponse.json()) as ScanSessionResult;
		if (!result.session) error(404, 'Scan session not found');
	}
	return { sessions, result };
};
