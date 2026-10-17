import { version } from '$app/env';
import { immutable, assets } from '$app/manifest';
import { self } from '$app/service-worker';
import { isPublicAssetResponse, navigationResponse, publicCachePaths } from '../lib/pwa/cache.ts';

const CACHE_PREFIX = 'spellbook-public-';
const CACHE = `${CACHE_PREFIX}${version}`;
const paths = publicCachePaths(immutable, assets);
const urls = new Set(paths.map((path) => new URL(path, self.registration.scope).href));
const offlineUrl = new URL('offline.html', self.registration.scope).href;

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await Promise.all(
				paths.map(async (path) => {
					const request = new Request(new URL(path, self.registration.scope), {
						credentials: 'omit',
						redirect: 'error',
						cache: 'reload'
					});
					const response = await fetch(request);
					if (!isPublicAssetResponse(path, response)) {
						throw new Error(`Cannot precache public asset: ${path}`);
					}
					await cache.put(request, response);
				})
			);
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const name of await caches.keys()) {
				if (name.startsWith(CACHE_PREFIX) && name !== CACHE) await caches.delete(name);
			}
			await self.clients.claim();
		})()
	);
});

// A waiting update stays waiting until the user explicitly chooses to reload.
self.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);
	if (request.method !== 'GET' || url.origin !== self.location.origin) return;
	if (request.mode === 'navigate') {
		event.respondWith(
			navigationResponse(
				() => fetch(request),
				async () => (await caches.open(CACHE)).match(offlineUrl)
			)
		);
	} else if (urls.has(url.href) && !request.headers.has('Authorization')) {
		// No runtime writes, including for cache misses. API/auth/QR/artifacts never enter this branch.
		event.respondWith(
			caches.open(CACHE).then(async (cache) => (await cache.match(request)) ?? fetch(request))
		);
	}
});
