import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';

// Run after pnpm build. This executes the built worker without servers or account data.
test('built PWA worker preserves the public-only cache and explicit update boundary', async () => {
	const frontend = new URL('../', import.meta.url);

	const origin = 'https://spellbook.test';
	const handlers = new Map<string, (event: unknown) => void>();
	const stores = new Map<string, Map<string, Response>>([
		['spellbook-public-stale', new Map()],
		['unrelated-app', new Map()]
	]);
	let skipWaiting = 0;
	let claimed = 0;
	let fetched = 0;
	const key = (request: Request | string) => (typeof request === 'string' ? request : request.url);
	const caches = {
		async open(name: string) {
			const data = stores.get(name) ?? new Map<string, Response>();
			stores.set(name, data);
			return {
				async put(request: Request, response: Response) {
					data.set(key(request), response);
				},
				async match(request: Request | string) {
					return data.get(key(request))?.clone();
				}
			};
		},
		async keys() {
			return [...stores.keys()];
		},
		async delete(name: string) {
			return stores.delete(name);
		}
	};
	const worker = {
		registration: { scope: origin + '/' },
		location: new URL(origin + '/service-worker.js'),
		clients: {
			async claim() {
				claimed++;
			}
		},
		async skipWaiting() {
			skipWaiting++;
		},
		addEventListener(type: string, handler: (event: unknown) => void) {
			handlers.set(type, handler);
		}
	};
	const context = {
		self: worker,
		location: worker.location,
		caches,
		Request,
		Response,
		URL,
		async fetch(request: Request) {
			fetched++;
			assert.equal(request.credentials, 'omit');
			assert.equal(request.redirect, 'error');
			assert.equal(request.cache, 'reload');
			const path = new URL(request.url).pathname.slice(1);
			const extension = path.split('.').at(-1)!;
			const types: Record<string, string> = {
				js: 'text/javascript',
				css: 'text/css',
				png: 'image/png',
				ico: 'image/x-icon',
				webp: 'image/webp',
				html: 'text/html'
			};
			const content = await readFile(
				new URL(
					path.startsWith('_app/') ? '.svelte-kit/output/client/' + path : 'static/' + path,
					frontend
				)
			);
			return new Response(content, { headers: { 'content-type': types[extension] } });
		}
	};
	vm.runInNewContext(
		await readFile(new URL('.svelte-kit/output/client/service-worker.js', frontend), 'utf8'),
		context
	);
	async function lifetime(type: string, data: Record<string, unknown> = {}) {
		const tasks: Promise<unknown>[] = [];
		const handler = handlers.get(type);
		assert.ok(handler);
		handler({
			...data,
			waitUntil(task: Promise<unknown>) {
				tasks.push(task);
			}
		});
		await Promise.all(tasks);
	}
	await lifetime('install');
	const cacheName = [...stores.keys()].find(
		(name) => name.startsWith('spellbook-public-') && name !== 'spellbook-public-stale'
	);
	assert.ok(cacheName);
	const stored = stores.get(cacheName);
	assert.ok(stored);
	const allowedStatic = new Set([
		'offline.html',
		'logo.webp',
		'favicon.ico',
		'favicon.png',
		'apple-touch-icon.png',
		'icon-192.png',
		'icon-512.png',
		'icon-maskable-512.png'
	]);
	for (const path of allowedStatic) assert.ok(stored.has(origin + '/' + path), path);
	assert.ok([...stored.keys()].some((url) => url.endsWith('.css')));
	for (const url of stored.keys()) {
		const path = new URL(url).pathname.slice(1);
		assert.ok(/^_app\/immutable\/.+\.(js|css)$/.test(path) || allowedStatic.has(path), path);
	}
	assert.equal(skipWaiting, 0);
	await lifetime('activate');
	assert.equal(claimed, 1);
	assert.equal(stores.has('spellbook-public-stale'), false);
	assert.equal(stores.has('unrelated-app'), true);
	function dispatch(
		path: string,
		{ navigate = false, ...options }: RequestInit & { navigate?: boolean } = {}
	) {
		const request = new Request(new URL(path, origin), options);
		if (navigate) Object.defineProperty(request, 'mode', { value: 'navigate' });
		let response: Promise<Response> | undefined;
		const handler = handlers.get('fetch');
		assert.ok(handler);
		handler({
			request,
			respondWith(value: Response | Promise<Response>) {
				response = Promise.resolve(value);
			}
		});
		return response;
	}
	const size = stored.size;
	for (const path of [
		'/api/v1/account/profile',
		'/api/v1/auth/qr/requests/code',
		'/api/v1/account/events',
		'/api/v1/mtg/catalog/search',
		'/api/v1/mtg/scan/artifacts/photo.png',
		'/auth/login',
		'/app',
		'/showcase/sol-ring.webp'
	]) {
		assert.equal(dispatch(path), undefined, path);
	}
	assert.equal(dispatch('/auth/logout', { method: 'POST', navigate: true }), undefined);
	assert.equal(dispatch('https://elsewhere.test/icon-192.png'), undefined);
	const immutable = [...stored.keys()].find((path) => path.endsWith('.js'));
	assert.ok(immutable);
	assert.equal(dispatch(immutable + '?secret=private'), undefined);
	assert.equal(dispatch(immutable, { headers: { Authorization: 'Bearer private' } }), undefined);
	const priorFetches = fetched;
	assert.equal((await dispatch(immutable)!).status, 200);
	assert.equal(fetched, priorFetches);
	context.fetch = async () => new Response('private account HTML');
	assert.equal(
		await (await dispatch('/mtg/inventory', { navigate: true })!).text(),
		'private account HTML'
	);
	context.fetch = async () => new Response('server unavailable', { status: 503 });
	assert.equal((await dispatch('/auth/login', { navigate: true })!).status, 503);
	context.fetch = async () => {
		throw new TypeError('network offline');
	};
	assert.match(
		await (await dispatch('/auth/qr/code', { navigate: true })!).text(),
		/Spellbook is offline/
	);
	assert.equal(stored.size, size);
	await lifetime('message', { data: { type: 'ignore' } });
	assert.equal(skipWaiting, 0);
	await lifetime('message', { data: { type: 'SKIP_WAITING' } });
	assert.equal(skipWaiting, 1);
	assert.equal(stored.size, fetched);
});
