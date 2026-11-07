import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';

test('built Web isolates language requests and persists native language selection', async () => {
	const { handler } = await import(new URL('../build/handler.js', import.meta.url).href);
	const { origin: buildOrigin } = await import(
		new URL('../build/adapter-node.js', import.meta.url).href
	);
	const server = createServer(handler);
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const address = server.address();
	assert.ok(address && typeof address !== 'string');
	const origin = `http://127.0.0.1:${address.port}`;
	// Adapter-node fixes the public Origin at build time, even on an ephemeral listener.
	const requestOrigin = buildOrigin || origin;
	try {
		const replies = await Promise.all(
			Array.from({ length: 12 }, (_, index) => {
				const locale = index % 2 ? 'de' : 'en';
				return fetch(`${origin}/auth/login`, {
					headers: {
						Cookie: `website-language=${locale}`,
						'Accept-Language': locale === 'de' ? 'en' : 'de'
					}
				}).then(async (response) => ({ locale, response, html: await response.text() }));
			})
		);
		for (const { locale, response, html } of replies) {
			assert.equal(response.status, 200);
			assert.equal(response.headers.get('content-language'), locale);
			assert.match(response.headers.get('vary') ?? '', /Cookie/);
			assert.match(html, new RegExp(`<html lang="${locale}"`));
			assert.ok(html.includes(locale === 'de' ? 'Benutzername' : 'Username'));
		}
		const negotiated = await fetch(`${origin}/auth/login`, {
			headers: { 'Accept-Language': 'fr, de-DE;q=0.8, en;q=0.3' }
		});
		assert.equal(negotiated.headers.get('content-language'), 'de');
		const native = await fetch(`${origin}/language`, {
			method: 'POST',
			redirect: 'manual',
			headers: { Origin: requestOrigin },
			body: new URLSearchParams({ locale: 'de', returnTo: '/auth/login?returnTo=%2Fsettings' })
		});
		assert.equal(native.status, 303);
		assert.equal(native.headers.get('location'), '/auth/login?returnTo=%2Fsettings');
		assert.match(native.headers.get('set-cookie') ?? '', /website-language=de;/);
		const cookie = native.headers.get('set-cookie');
		assert.ok(cookie);
		const restored = await fetch(`${origin}/auth/login`, {
			headers: { Cookie: cookie.split(';')[0] }
		});
		assert.equal(restored.headers.get('content-language'), 'de');
		for (const { locale, origin: submittedOrigin, expected } of [
			{ locale: 'fr', origin: requestOrigin, expected: 400 },
			{ locale: 'de', origin: 'https://foreign.test', expected: 403 }
		]) {
			const denied = await fetch(`${origin}/language`, {
				method: 'POST',
				redirect: 'manual',
				headers: { Origin: submittedOrigin },
				body: new URLSearchParams({ locale, returnTo: '/' })
			});
			assert.equal(denied.status, expected);
			assert.equal(denied.headers.get('set-cookie'), null);
		}
	} finally {
		await new Promise((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve(undefined)))
		);
	}
});
