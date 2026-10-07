import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { error, isHttpError } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { GET } from '../../src/routes/openapi.json/+server';
import {
	DECK_OPERATION_TYPES,
	DECK_ROLES,
	INVENTORY_OPERATION_TYPES
} from '../../src/lib/server/mtg/validation';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface Operation {
	security?: Record<string, string[]>[];
	parameters?: { name: string; in: string; required?: boolean }[];
	requestBody?: { content: Record<string, { schema: Json }> };
	responses: Record<string, { description: string; content?: Record<string, { schema: Json }> }>;
}
interface Document {
	paths: Record<string, Record<string, Operation> & { parameters?: Operation['parameters'] }>;
	components: { schemas: Record<string, Json>; securitySchemes: Record<string, Json> };
}

const routes = new URL('../../src/routes/', import.meta.url).pathname;
const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

function files(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? files(path) : [path];
	});
}

function implementedOperations(): string[] {
	return files(routes)
		.flatMap((file) => {
			const route = relative(routes, file).replaceAll('\\', '/');
			if (!route.startsWith('api/') && !route.startsWith('auth/')) return [];
			const path = `/${route.replace(/\/\+[^/]+$/, '').replace(/\[([^\]]+)\]/g, '{$1}')}`;
			const source = readFileSync(file, 'utf8');
			if (route.endsWith('/+server.ts')) {
				return [
					...source.matchAll(
						/\bexport\s+(?:async\s+)?(?:const|function)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g
					)
				].map((match) => `${match[1]?.toLowerCase()} ${path}`);
			}
			if (route.endsWith('/+page.server.ts')) {
				return [
					...(/export\s+const\s+load\b/.test(source) ? [`get ${path}`] : []),
					...(/export\s+const\s+actions\b/.test(source) ? [`post ${path}`] : [])
				];
			}
			return [];
		})
		.sort();
}

function visit(value: Json, visitor: (value: Record<string, Json>) => void): void {
	if (!value || typeof value !== 'object') return;
	if (Array.isArray(value)) value.forEach((child) => visit(child, visitor));
	else {
		visitor(value);
		Object.values(value).forEach((child) => visit(child, visitor));
	}
}

describe('OpenAPI contract', () => {
	it('documents bounded reference decimals with a literal decimal point', async () => {
		const schema = await GET().json();
		const amount = schema.components.schemas.PriceReference.oneOf[0].properties.amount;
		const pattern = new RegExp(amount.pattern);
		expect(amount.maxLength).toBe(128);
		expect(pattern.test('0.005')).toBe(true);
		expect(pattern.test('0x005')).toBe(false);
		expect(pattern.test('0.' + '1'.repeat(19))).toBe(false);
	});
	it('includes the status and message returned by SvelteKit errors', async () => {
		const schema = (await GET().json()) as Document;
		let body: unknown;
		try {
			error(400, 'Invalid request');
		} catch (cause) {
			if (!isHttpError(cause)) throw cause;
			body = cause.body;
		}
		expect(body).toEqual({ status: 400, message: 'Invalid request' });
		expect(schema.components.schemas.ErrorResponse).toMatchObject({
			properties: {
				status: { type: 'integer', minimum: 400, maximum: 599 },
				message: { type: 'string' }
			},
			required: Object.keys(body as object)
		});
	});

	it('covers every implemented API and authentication route and method without stale routes', async () => {
		const schema = (await GET().json()) as Document;
		const documented = Object.entries(schema.paths)
			.flatMap(([path, item]) =>
				Object.keys(item)
					.filter((key) => methods.includes(key))
					.map((method) => `${method} ${path}`)
			)
			.sort();
		expect(documented).toEqual(implementedOperations());
	});

	it('resolves every local schema reference and declares every path parameter', async () => {
		const schema = (await GET().json()) as Document;
		visit(schema as unknown as Json, (value) => {
			if (typeof value.$ref !== 'string') return;
			expect(value.$ref).toMatch(/^#\//);
			let resolved: unknown = schema;
			for (const segment of value.$ref.slice(2).split('/')) {
				const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
				resolved = (resolved as Record<string, unknown> | undefined)?.[key];
			}
			expect(resolved, value.$ref).toBeDefined();
		});
		for (const [path, item] of Object.entries(schema.paths)) {
			const names = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort();
			for (const method of methods) {
				const operation = item[method];
				if (!operation) continue;
				const parameters = [...(item.parameters ?? []), ...(operation.parameters ?? [])].filter(
					(parameter) => parameter.in === 'path'
				);
				expect(parameters.map((parameter) => parameter.name).sort(), `${method} ${path}`).toEqual(
					names
				);
				expect(parameters.every((parameter) => parameter.required)).toBe(true);
			}
		}
	});

	it('documents cookie or bearer authentication, content, and errors for every versioned operation', async () => {
		const schema = (await GET().json()) as Document;
		expect(schema.components.securitySchemes.sessionCookie).toMatchObject({
			type: 'apiKey',
			in: 'cookie',
			name: 'spellbook_session'
		});
		expect(schema.components.securitySchemes.bearerToken).toMatchObject({
			type: 'http',
			scheme: 'bearer'
		});
		for (const [path, item] of Object.entries(schema.paths)) {
			if (!path.startsWith('/api/mobile/v1/')) continue;
			for (const method of methods) {
				const operation = item[method];
				if (!operation) continue;
				if (path === '/api/mobile/v1/mtg/prices' && method === 'get') {
					expect(operation.security).toEqual([]);
					for (const status of ['200', '400', '503'])
						expect(operation.responses[status]?.content).toBeDefined();
					continue;
				}
				expect(operation.security, `${method} ${path}`).toEqual([
					{ sessionCookie: [] },
					{ bearerToken: [] }
				]);
				expect(operation.responses['200']?.content, `${method} ${path}`).toBeDefined();
				for (const status of ['400', '401', '500']) {
					expect(operation.responses[status]?.content?.['application/json']?.schema).toEqual({
						$ref: '#/components/schemas/ErrorResponse'
					});
				}
				if (['post', 'patch'].includes(method) && !path.endsWith('/scan/sessions')) {
					expect(operation.requestBody?.content, `${method} ${path}`).toBeDefined();
				}
			}
		}
	});

	it('matches local credential issuance, bearer-only revocation, and multipart upload contracts', async () => {
		const schema = (await GET().json()) as Document;
		const login = schema.paths['/api/auth/login']!.post!;
		const register = schema.paths['/api/auth/register']!.post!;
		const logout = schema.paths['/api/auth/logout']!.post!;
		expect(login.security).toEqual([]);
		expect(login.responses['200']?.content?.['application/json']?.schema).toEqual({
			$ref: '#/components/schemas/AuthSession'
		});
		expect(register.responses['201']).toBeDefined();
		expect(register.responses['409']).toBeUndefined();
		for (const operation of [login, register]) {
			for (const status of ['400', '403', '415', '429'])
				expect(operation.responses[status]).toBeDefined();
		}
		expect(logout.security).toEqual([{ bearerToken: [] }]);
		expect(logout.responses['204']).toBeDefined();
		expect(logout.responses['204']?.content).toBeUndefined();
		expect(
			schema.paths['/api/mobile/v1/mtg/scan/sessions/{sessionId}/frames']!.post!.requestBody
				?.content['multipart/form-data']
		).toBeDefined();
		expect(
			schema.paths['/api/mobile/v1/mtg/decks/{deckId}/export']!.get!.responses['200']?.content?.[
				'text/plain'
			]
		).toBeDefined();
	});

	it('documents Inventory as the default browser authentication destination', async () => {
		const schema = (await GET().json()) as Document;
		for (const path of ['/auth/login', '/auth/register']) {
			expect(schema.paths[path]!.parameters).toContainEqual({
				name: 'returnTo',
				in: 'query',
				schema: { type: 'string', default: '/mtg/inventory' },
				description:
					'Local path used after authentication; invalid or external paths become /mtg/inventory.'
			});
		}
	});

	it('keeps artwork optional for registration and documents persisted profile choices', async () => {
		const schema = (await GET().json()) as Document;
		expect(schema.components.schemas.RegisterRequest).toMatchObject({
			required: ['username', 'password'],
			properties: { artworkId: { enum: ['grove', 'tide', 'ember', 'astral'], default: 'grove' } }
		});
		expect(schema.components.schemas.AuthSession).toMatchObject({
			properties: {
				user: { properties: { avatarId: { type: 'string' }, artworkId: { type: 'string' } } }
			}
		});
	});

	it('documents bounded catalog filtering and generation-aware search responses', async () => {
		const schema = (await GET().json()) as Document;
		const search = schema.paths['/api/mobile/v1/mtg/search']!;
		expect(search.post!.requestBody?.content['application/json']?.schema).toEqual({
			$ref: '#/components/schemas/CatalogSearchRequest'
		});
		for (const status of ['400', '401', '403', '413', '415'])
			expect(search.post!.responses[status]).toBeDefined();
		expect(schema.components.schemas.CatalogSearchRequest).toMatchObject({
			properties: {
				query: { type: 'string', maxLength: 300 },
				limit: { type: 'integer', minimum: 0, maximum: 100 },
				offset: { type: 'integer', minimum: 0, maximum: 1_000_000 },
				facets: { type: 'boolean', default: false },
				sort: { enum: ['name:asc', 'name:desc'] }
			}
		});
		expect(schema.components.schemas.CatalogFilters).toMatchObject({
			additionalProperties: false,
			properties: {
				colors: { maxItems: 100, items: { enum: ['W', 'U', 'B', 'R', 'G', 'C'] } },
				colorIdentity: { maxItems: 100, items: { enum: ['W', 'U', 'B', 'R', 'G', 'C'] } },
				sets: { maxItems: 100, items: { pattern: '^[A-Za-z0-9]{1,12}$' } }
			}
		});
		expect(schema.components.schemas.SearchResponse).toMatchObject({
			properties: {
				generationId: { type: ['string', 'null'] },
				facets: { $ref: '#/components/schemas/CatalogFacets' }
			},
			required: ['query', 'hits', 'estimatedTotalHits', 'processingTimeMs', 'generationId']
		});
	});

	it('covers the accepted bulk operation kinds and deck roles', async () => {
		const schema = (await GET().json()) as Document;
		for (const [prefix, accepted] of [
			['Inventory', INVENTORY_OPERATION_TYPES],
			['Deck', [...DECK_OPERATION_TYPES, 'increment', 'replace']]
		] as const) {
			const kinds: string[] = [];
			for (const name of [`${prefix}AddOperation`, `${prefix}TargetOperation`]) {
				visit(schema.components.schemas[name]!, (value) => {
					const properties = value.properties as Record<string, Json> | undefined;
					const op = properties?.op as Record<string, Json> | undefined;
					if (typeof op?.const === 'string') kinds.push(op.const);
				});
			}
			expect(kinds.sort()).toEqual([...accepted].sort());
		}
		expect(schema.components.schemas.DeckCardUpdateRequest).toMatchObject({
			properties: { role: { enum: [...DECK_ROLES] } },
			required: ['requestId']
		});
		visit(schema as unknown as Json, (value) => {
			if (!Array.isArray(value.required) || !value.properties) return;
			for (const name of value.required) {
				expect(
					(value.properties as Record<string, Json>)[String(name)],
					`Required property ${name}`
				).toBeDefined();
			}
		});
	});

	it('documents bounded external recognition and authenticated image retrieval', async () => {
		const schema = (await GET().json()) as Document;
		const result =
			schema.paths['/api/mobile/v1/mtg/scan/sessions/{sessionId}/artifacts/{artifactId}/result']!
				.post!;
		expect(result.requestBody?.content['application/json']?.schema).toEqual({
			$ref: '#/components/schemas/ExternalScanResultRequest'
		});
		for (const status of ['400', '401', '404', '409'])
			expect(result.responses[status]).toBeDefined();
		expect(schema.components.schemas.ExternalScanResultRequest).toMatchObject({
			required: ['status', 'modelVersion', 'candidates'],
			properties: {
				modelVersion: { minLength: 1, maxLength: 128 },
				candidates: {
					maxItems: 20,
					items: {
						required: ['catalogCardId', 'confidence'],
						properties: {
							catalogCardId: { format: 'uuid' },
							confidence: { minimum: 0, maximum: 1 },
							notes: { maxLength: 500 }
						}
					}
				}
			}
		});
		const image = schema.paths['/api/mobile/v1/mtg/scan/artifacts/{artifactId}/image']!.get!;
		expect(Object.keys(image.responses['200']!.content!)).toEqual([
			'image/jpeg',
			'image/png',
			'image/webp'
		]);
		for (const status of ['401', '404', '413', '415'])
			expect(image.responses[status]).toBeDefined();
		expect(schema.paths['/api/mobile/v1/mtg/scan/sessions']!.get).toBeDefined();
	});

	it('documents request limits, conflicting retries, availability, and mutation fingerprints', async () => {
		const schema = (await GET().json()) as Document;
		for (const [path, item] of Object.entries(schema.paths)) {
			if (!path.startsWith('/api/mobile/v1/')) continue;
			for (const method of methods) {
				const operation = item[method];
				if (!operation?.requestBody?.content['application/json']) continue;
				for (const status of ['400', '413', '415']) {
					expect(operation.responses[status], `${method} ${path} ${status}`).toBeDefined();
				}
			}
		}
		for (const path of [
			'inventory',
			'inventory/batch-add',
			'inventory/bulk',
			'inventory/import/commit',
			'decks/{deckId}/cards/bulk',
			'decks/import/commit',
			'scan/review/commit'
		]) {
			expect(
				schema.paths[`/api/mobile/v1/mtg/${path}`]!.post!.responses['409'],
				path
			).toBeDefined();
		}
		const frames = schema.paths['/api/mobile/v1/mtg/scan/sessions/{sessionId}/frames']!.post!;
		for (const status of ['413', '415', '502']) expect(frames.responses[status]).toBeDefined();
		const availability = schema.paths['/api/mobile/v1/mtg/decks/{deckId}/availability']!.get!;
		expect(availability.responses['404']).toBeDefined();
		expect(availability.responses['200']?.content?.['application/json']?.schema).toEqual({
			$ref: '#/components/schemas/DeckAvailability'
		});
		expect(schema.components.schemas.MutationRequestRecord).toMatchObject({
			properties: { requestHash: { type: ['string', 'null'] } }
		});
	});
});
