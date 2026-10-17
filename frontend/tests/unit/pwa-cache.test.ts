import { describe, expect, it, vi } from 'vitest';
import {
	isPublicAssetResponse,
	navigationResponse,
	publicCachePaths
} from '../../src/lib/pwa/cache.ts';

describe('PWA public cache boundary', () => {
	it('selects only build-listed immutable JS/CSS, public icons and the static fallback', () => {
		const privatePaths = [
			'app',
			'mtg/inventory',
			'auth/login',
			'auth/qr/approve',
			'api/auth/qr/requests/code',
			'api/account/profile',
			'api/mtg/scan/artifacts/photo.png',
			'showcase/sol-ring.webp',
			'profile/frames/green-creature.webp',
			'theme.js',
			'manifest.webmanifest',
			'_app/env.js'
		];
		expect(
			publicCachePaths(
				[
					'_app/immutable/entry/start.ABC.js',
					'_app/immutable/assets/main.ABC.css',
					'_app/immutable/assets/photo.ABC.png',
					'_app/immutable/entry/start.ABC.js.map',
					...privatePaths
				].map((path) => ({ path })),
				['offline.html', 'icon-192.png', 'logo.webp', ...privatePaths].map((path) => ({ path }))
			)
		).toEqual([
			'_app/immutable/entry/start.ABC.js',
			'_app/immutable/assets/main.ABC.css',
			'offline.html',
			'icon-192.png',
			'logo.webp'
		]);
	});

	it('rejects HTML masquerading as a script/icon, HTTP errors and private/no-store responses', () => {
		const html = new Response('private page', { headers: { 'content-type': 'text/html' } });
		expect(isPublicAssetResponse('_app/immutable/start.hash.js', html)).toBe(false);
		expect(isPublicAssetResponse('icon-192.png', html)).toBe(false);
		for (const value of ['private, max-age=60', 'no-store']) {
			expect(
				isPublicAssetResponse(
					'offline.html',
					new Response('', {
						headers: {
							'content-type': 'text/html',
							'cache-control': value
						}
					})
				)
			).toBe(false);
		}
		expect(isPublicAssetResponse('offline.html', new Response('', { status: 404 }))).toBe(false);
		expect(
			isPublicAssetResponse(
				'_app/immutable/start.hash.js',
				new Response('', {
					headers: { 'content-type': 'text/javascript; charset=utf-8' }
				})
			)
		).toBe(true);
		expect(isPublicAssetResponse('offline.html', html)).toBe(true);
	});

	it.each([200, 401, 403, 404, 500, 503])(
		'preserves HTTP %s navigation instead of hiding it offline',
		async (status) => {
			const response = new Response('network page', { status });
			const fallback = vi.fn();
			expect(await navigationResponse(async () => response, fallback)).toBe(response);
			expect(fallback).not.toHaveBeenCalled();
		}
	);

	it('uses only the static public fallback after a rejected navigation and handles a missing fallback', async () => {
		const offline = new Response('public offline page');
		const network = () => Promise.reject(new TypeError('Failed to fetch'));
		expect(await navigationResponse(network, async () => offline)).toBe(offline);
		const missing = await navigationResponse(network, async () => undefined);
		expect(missing.status).toBe(503);
		expect(missing.headers.get('cache-control')).toBe('no-store');
	});
});
