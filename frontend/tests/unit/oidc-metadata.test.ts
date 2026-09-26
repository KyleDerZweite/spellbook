import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAuthorizationUrl, type OidcAuthConfig } from '../../src/lib/server/auth/oidc';

const DISCOVERY = {
	issuer: 'https://auth.discovery.test',
	authorization_endpoint: 'https://auth.discovery.test/authorize',
	token_endpoint: 'https://auth.discovery.test/token',
	userinfo_endpoint: 'https://auth.discovery.test/userinfo',
	jwks_uri: 'https://auth.discovery.test/jwks'
};

const OPTIONS = { state: 'state-1', nonce: 'nonce-1', codeVerifier: 'verifier-1' };

function configFor(issuer: string): OidcAuthConfig {
	return {
		issuer,
		clientId: 'spellbook-client',
		appOrigin: 'https://spellbook.example.test'
	};
}

function jsonResponse(payload: unknown): Response {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('OIDC discovery caching', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('retries discovery after a transient failure instead of caching the rejection', async () => {
		const config = configFor('https://auth.retry-after-failure.test');
		const fetchMock = vi.fn();
		fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
		fetchMock.mockResolvedValueOnce(jsonResponse(DISCOVERY));
		vi.stubGlobal('fetch', fetchMock);

		await expect(buildAuthorizationUrl(config, OPTIONS)).rejects.toThrow();

		const url = await buildAuthorizationUrl(config, OPTIONS);
		expect(url).toContain('https://auth.discovery.test/authorize');
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('keeps serving cached metadata once discovery succeeded', async () => {
		const config = configFor('https://auth.cached-metadata.test');
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(DISCOVERY));
		vi.stubGlobal('fetch', fetchMock);

		await buildAuthorizationUrl(config, OPTIONS);
		await buildAuthorizationUrl(config, OPTIONS);

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
