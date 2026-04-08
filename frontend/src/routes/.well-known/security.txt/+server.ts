import { privateEnv } from '$lib/env/private';

function buildExpires(): string {
	const expires = new Date();
	expires.setUTCFullYear(expires.getUTCFullYear() + 1);
	return expires.toISOString();
}

export const GET = () => {
	const origin = privateEnv.APP_ORIGIN;
	const body = [
		'Contact: mailto:privacy@kylehub.dev',
		'Contact: mailto:support@kylehub.dev',
		'Preferred-Languages: en, de',
		`Expires: ${buildExpires()}`,
		`Canonical: ${new URL('/.well-known/security.txt', origin).toString()}`,
		`Policy: ${new URL('/privacy', origin).toString()}`,
		''
	].join('\n');

	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8'
		}
	});
};
