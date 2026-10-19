import golden from '../../../contracts/compatibility/golden.json' with { type: 'json' };
import transfer from '../../../contracts/compatibility/transfer.json' with { type: 'json' };
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import inventory from '../../../contracts/compatibility/inventory.json' with { type: 'json' };
import document from '../../../contracts/openapi.json' with { type: 'json' };
import { openapi } from '../../src/http/openapi.ts';
import { createAuthRoutes } from '../../src/http/routes/auth.ts';
import { createAccountRoutes } from '../../src/http/routes/account.ts';
import { createCatalogRoutes } from '../../src/http/routes/catalog.ts';
import { createCategoryRoutes } from '../../src/http/routes/categories.ts';
import { createDeckRoutes } from '../../src/http/routes/decks.ts';
import { createInventoryRoutes } from '../../src/http/routes/inventory.ts';
import { createSavedStateRoutes } from '../../src/http/routes/saved-state.ts';
import { createScanRoutes } from '../../src/http/routes/scan.ts';
import { createValuationRoutes } from '../../src/http/routes/valuation.ts';
import { createWebRoutes } from '../../src/http/routes/web.ts';
import { createHttpApplication } from '../../src/http/application.ts';
import { createNodeHttpServer } from '../../src/http/node.ts';
import { createHttpFixture, publicOrigin } from './http-fixture.ts';

const lifetime = await createHttpFixture();
afterAll(() => lifetime.close());
const dependencies = { application: lifetime.application, publicOrigin };
const key = (row: { method: string; path: string }) =>
	`${row.method.toLowerCase()} ${row.path.replace(/:([A-Za-z][A-Za-z0-9]*)/g, '{$1}')}`;

it('inventory-registered-operations', () => {
	const registered = [
		createAuthRoutes,
		createAccountRoutes,
		createCatalogRoutes,
		createCategoryRoutes,
		createDeckRoutes,
		createInventoryRoutes,
		createSavedStateRoutes,
		createScanRoutes,
		createValuationRoutes,
		createWebRoutes
	].flatMap((create) => create(dependencies));
	expect(registered.map(key).sort()).toEqual(
		inventory.routes
			.filter((row) => row.transport === 'api')
			.map(key)
			.sort()
	);
	expect(new Set(registered.map(key)).size).toBe(registered.length);
	const documented = Object.entries(document.paths).flatMap(([path, item]) =>
		Object.keys(item)
			.filter((method) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
			.map((method) => `${method} ${path}`)
	);
	expect(documented.sort()).toEqual(
		inventory.routes
			.filter((row) => row.transport !== 'discovery')
			.map(key)
			.sort()
	);
	for (const row of inventory.routes) {
		expect(row.slice).toMatch(/^P\d\d/);
		expect(existsSync(new URL(`../../../${row.owner}`, import.meta.url))).toBe(true);
	}
});

it('inventory-closed-commands-and-runner-owners', () => {
	const command =
		document.paths['/api/web/v1/commands'].post.requestBody.content['application/json'].schema;
	expect(command.oneOf.map((value) => value.properties.operation.const).sort()).toEqual(
		inventory.commands.map((row) => row.operation).sort()
	);
	const source = readFileSync(new URL('../../src/http/routes/web.ts', import.meta.url), 'utf8');
	expect([...source.matchAll(/case '([^']+)':/g)].map((match) => match[1]).sort()).toEqual(
		inventory.commands.map((row) => row.operation).sort()
	);
	for (const row of inventory.runners) {
		expect(existsSync(new URL(`../../../${row.owner}`, import.meta.url)), row.name).toBe(true);
		expect(row.slice).toMatch(/^P\d\d/);
	}
});

it('openapi-extraction-exact-baseline', () => {
	// Hash recorded from the original b835eee builder with servers=[{url:'/'}].
	expect(createHash('sha256').update(JSON.stringify(document)).digest('hex')).toBe(
		'2278d5ffc597f59dde47974b9d4835a849be9abe5f023870c2ccbde801ce6979'
	);
	expect(openapi(publicOrigin)).toEqual({
		...document,
		servers: [{ url: publicOrigin }]
	});
	expect(document.openapi).toBe('3.1.0');
});

it('openapi-node-http-discovery-head-options', async () => {
	const application = createHttpApplication(lifetime.application, {
		publicOrigin
	});
	const server = createNodeHttpServer(application, { publicOrigin });
	try {
		const address = await server.listen(0, '127.0.0.1');
		const url = `http://127.0.0.1:${address.port}/openapi.json`;
		const response = await fetch(url);
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
		expect(await response.text()).toBe(JSON.stringify(openapi(publicOrigin)));
		const head = await fetch(url, { method: 'HEAD' });
		expect(head.status).toBe(200);
		expect(await head.text()).toBe('');
		const options = await fetch(url, { method: 'OPTIONS' });
		expect(options.status).toBe(204);
		expect(options.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
		const wrong = await fetch(url, { method: 'PUT' });
		expect(wrong.status).toBe(405);
		expect(await wrong.json()).toEqual({ message: 'Method Not Allowed' });
	} finally {
		await server.close();
	}
});

it('inventory-transfer-complete', () => {
	const fixtureIds = Object.values(golden).flatMap((value) =>
		Array.isArray(value) ? value.map((row) => row.id) : []
	);
	const staticIds = [
		'compatibility-golden.test.ts',
		'compatibility-http.test.ts',
		'compatibility-inventory.test.ts'
	].flatMap((file) => {
		const source = readFileSync(new URL(file, import.meta.url), 'utf8');
		return [...source.matchAll(/\bit\(['"]([^'"]+)['"]/g)].map((match) => match[1]);
	});
	const mapped = transfer.groups.flatMap((group) => group.cases);
	expect(new Set(mapped).size).toBe(mapped.length);
	expect(mapped.sort()).toEqual([...fixtureIds, ...staticIds].sort());
	for (const group of transfer.groups) {
		expect(group.nodeDirect).toContain('backend/tests/unit/');
		expect(group.dualRuntimeHttp.length).toBeGreaterThan(20);
		expect(group.pythonApplication.length).toBeGreaterThan(20);
	}
});
