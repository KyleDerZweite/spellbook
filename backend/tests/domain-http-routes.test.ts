import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import pg from 'pg';
import type { CardDocument } from '@spellbook/contracts/catalog.ts';
import { createApplication } from '../src/application.ts';
import { errorResponse } from '../src/http/errors.ts';
import { createCatalogRoutes } from '../src/http/routes/catalog.ts';
import { createInventoryRoutes } from '../src/http/routes/inventory.ts';
import { createValuationRoutes } from '../src/http/routes/valuation.ts';
import { createScanRoutes } from '../src/http/routes/scan.ts';
import type { HttpRoute, RouteContext } from '../src/http/types.ts';

// Original SvelteKit routes map one for one to colon parameters with the same methods.
const originalRoutes: [string, string[]][] = [
	['/api/catalog/search', ['GET', 'POST']],
	['/api/catalog/cards/[oracleId]/printings', ['GET']],
	['/api/mobile/v1/mtg/search', ['GET', 'POST']],
	['/api/mobile/v1/mtg/cards/[oracleId]/printings', ['GET']],
	['/api/mobile/v1/mtg/inventory', ['GET', 'POST']],
	['/api/mobile/v1/mtg/inventory/batch-add', ['POST']],
	['/api/mobile/v1/mtg/inventory/[entryId]', ['GET', 'PATCH', 'DELETE']],
	['/api/mobile/v1/mtg/inventory/[entryId]/groups', ['PUT']],
	['/api/mobile/v1/mtg/inventory/[entryId]/position', ['PATCH']],
	['/api/mobile/v1/mtg/inventory/[entryId]/location', ['GET']],
	['/api/mobile/v1/mtg/inventory/bulk', ['POST']],
	['/api/mobile/v1/mtg/inventory/groups', ['GET', 'POST']],
	['/api/mobile/v1/mtg/inventory/groups/[groupId]', ['PATCH', 'DELETE']],
	['/api/mobile/v1/mtg/inventory/import/preview', ['POST']],
	['/api/mobile/v1/mtg/inventory/import/commit', ['POST']],
	['/api/mobile/v1/mtg/prices', ['GET']],
	['/api/mobile/v1/mtg/prices/history', ['GET']],
	['/api/mobile/v1/mtg/inventory/prices', ['POST']],
	['/api/mobile/v1/mtg/inventory/value', ['GET']],
	['/api/mobile/v1/mtg/inventory/value-history', ['GET']],
	['/api/mobile/v1/mtg/scan/sessions', ['GET', 'POST']],
	['/api/mobile/v1/mtg/scan/sessions/[sessionId]/frames', ['POST']],
	['/api/mobile/v1/mtg/scan/sessions/[sessionId]/result', ['GET']],
	['/api/mobile/v1/mtg/scan/sessions/[sessionId]/artifacts/[artifactId]/result', ['POST']],
	['/api/mobile/v1/mtg/scan/artifacts/[artifactId]/image', ['GET']],
	['/api/mobile/v1/mtg/scan/review/commit', ['POST']]
];

async function publishRecordedPrinting(pool: pg.Pool) {
	const documents: CardDocument[] = JSON.parse(
		await readFile(new URL('../scripts/demo/cards.json', import.meta.url), 'utf8')
	);
	const card = documents.find((document) => document.name === 'Sol Ring');
	assert.ok(card, 'Recorded public Sol Ring printing must exist');
	const generation = randomUUID();
	await pool.query(
		"INSERT INTO catalog_generations(id,source_type,source_updated_at,document_count,published_at) VALUES($1,'domain-route-test',now(),1,now())",
		[generation]
	);
	await pool.query(
		'INSERT INTO catalog_printings(generation_id,id,oracle_id,name,normalized_name,printed_name,lang,set_code,collector_number,rarity,cmc,colors,card_types,legalities,search_name,search_text,document) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)',
		[
			generation,
			card.id,
			card.oracle_id,
			card.name,
			card.name.toLowerCase(),
			card.printed_name || '',
			card.lang,
			card.set_code,
			card.collector_number,
			card.rarity,
			card.cmc,
			card.colors,
			card.card_types,
			JSON.stringify(card.legalities),
			card.name.toLowerCase(),
			`${card.name} ${card.oracle_text}`,
			JSON.stringify({ ...card, internalOnly: 'must never reach the public DTO' })
		]
	);
	await pool.query(
		'INSERT INTO catalog_state(id,active_generation) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET active_generation=excluded.active_generation',
		[generation]
	);
	return { card, generation };
}

const databaseUrl = process.env.TEST_DATABASE_URL;
test(
	'domain HTTP factories with actual application, PostgreSQL and Scan worker',
	{ skip: !databaseUrl && 'Set matching DATABASE_URL/TEST_DATABASE_URL to an owned disposable DB' },
	async (t) => {
		assert.equal(databaseUrl, process.env.DATABASE_URL);
		const name = new URL(databaseUrl!).pathname.slice(1);
		assert.equal(name, process.env.TEST_DOMAIN_DATABASE_NAME);
		assert.match(name, /^spellbook_domain_routes_[a-z0-9_]+$/);
		const worker = new URL(process.env.SCAN_WORKER_URL!);
		assert.equal(worker.hostname, '127.0.0.1');
		assert.ok(Number(worker.port) > 0, 'A task-owned loopback worker port is required');
		assert.equal((await fetch(new URL('/health', worker))).status, 200);

		const pool = new pg.Pool({ connectionString: databaseUrl });
		const storage = await mkdtemp(join(tmpdir(), 'spellbook-domain-routes-'));
		const lifetime = await createApplication({
			databaseUrl,
			valueHistoryEnabled: 'false',
			scan: { storageDriver: 'local', localStorageDir: storage, workerUrl: worker.origin }
		});
		const application = lifetime.application;
		const deps = { application, publicOrigin: 'http://127.0.0.1:56543' };
		const accounts: string[] = [];
		let generation: string | undefined;
		t.after(async () => {
			await lifetime.close();
			try {
				await pool.query(
					'DELETE FROM inventory_mutation_requests WHERE account_id=ANY($1::text[])',
					[accounts]
				);
				await pool.query('DELETE FROM user_profiles WHERE account_id=ANY($1::text[])', [accounts]);
				if (generation) {
					await pool.query('DELETE FROM catalog_state WHERE active_generation=$1', [generation]);
					await pool.query('DELETE FROM catalog_generations WHERE id=$1', [generation]);
				}
			} finally {
				await pool.end();
				await rm(storage, { recursive: true, force: true });
			}
		});
		assert.equal(
			(await pool.query('SELECT count(*)::int AS count FROM catalog_generations')).rows[0].count,
			0,
			'The route fixture requires an empty task-owned Catalog'
		);
		const fixture = await publishRecordedPrinting(pool);
		generation = fixture.generation;
		const card = fixture.card;
		async function account() {
			const result = await application.auth.authenticate(
				'register',
				`routes_${randomUUID().slice(0, 8)}`,
				'domain-route-private-password'
			);
			assert.ok(result);
			accounts.push(result.user.accountId);
			return result;
		}
		const a = await account(),
			b = await account();
		const routes: HttpRoute[] = [
			...createCatalogRoutes(deps),
			...createInventoryRoutes(deps),
			...createValuationRoutes(deps),
			...createScanRoutes(deps)
		];
		const prefix = '/api/mobile/v1/mtg';
		const inventory = `${prefix}/inventory`,
			scan = `${prefix}/scan`;
		// This is a route-adapter test. The parent verifies the real Node host and proxy separately.
		async function invoke(
			path: string,
			method = 'GET',
			body?: BodyInit | null,
			headers: HeadersInit = {}
		) {
			const request = new Request(deps.publicOrigin + path, { method, body, headers });
			const url = new URL(request.url);
			// Literal routes from other factories, including Inventory values, precede parameters.
			for (const route of [...routes].sort(
				(a, b) => a.path.split(':').length - b.path.split(':').length
			)) {
				if (route.method !== method) continue;
				const names: string[] = [];
				const pattern = route.path.replace(/:(\w+)/g, (_, name) => {
					names.push(name);
					return '([^/]+)';
				});
				const match = new RegExp(`^${pattern}$`).exec(url.pathname);
				if (!match) continue;
				const context: RouteContext = {
					request,
					url,
					clientAddress: '127.0.0.1',
					params: Object.fromEntries(names.map((name, i) => [name, match[i + 1]]))
				};
				try {
					return await route.handle(context);
				} catch (cause) {
					return errorResponse(cause);
				}
			}
			throw new Error(`No assigned route for ${method} ${path}`);
		}
		const bearer = { authorization: `Bearer ${a.session.token}` };
		const foreign = { authorization: `Bearer ${b.session.token}` };
		function json(path: string, method: string, body: unknown, headers: HeadersInit = bearer) {
			return invoke(path, method, JSON.stringify(body), {
				...Object.fromEntries(new Headers(headers)),
				'content-type': 'application/json'
			});
		}
		async function success(response: Response, status = 200) {
			const body = await response.json();
			assert.equal(response.status, status, JSON.stringify(body));
			return body;
		}

		await t.test(
			'every original method maps to its unchanged path and the new safe Printing read',
			() => {
				const expected = originalRoutes.flatMap(([path, methods]) =>
					methods.map((method) => `${method} ${path.replace(/\[(\w+)\]/g, ':$1')}`)
				);
				expected.push('GET /api/catalog/printings/:printingId');
				assert.equal(expected.length, 35);
				assert.deepEqual(
					routes.map((route) => `${route.method} ${route.path}`).sort(),
					expected.sort()
				);
			}
		);
		await t.test(
			'public Catalog DTOs, authenticated aliases and strict pagination retain parity',
			async () => {
				const publicResponse = await invoke('/api/catalog/search?q=Sol%20Ring');
				assert.equal(publicResponse.headers.get('cache-control'), 'no-store');
				const publicResult = await success(publicResponse);
				const alias = await success(
					await invoke(`${prefix}/search?q=Sol%20Ring`, 'GET', undefined, bearer)
				);
				assert.deepEqual(alias.hits, publicResult.hits);
				assert.equal(alias.generationId, generation);
				assert.equal(publicResult.hits[0].internalOnly, undefined);
				const printing = await success(await invoke(`/api/catalog/printings/${card.id}`));
				assert.equal(printing.id, card.id);
				assert.equal(printing.internalOnly, undefined);
				assert.equal((await invoke(`/api/catalog/printings/${randomUUID()}`)).status, 404);
				const printings = `/api/catalog/cards/${card.oracle_id}/printings`;
				assert.equal((await success(await invoke(printings))).hits[0].id, card.id);
				assert.equal(
					(
						await success(
							await invoke(`${prefix}/cards/${card.oracle_id}/printings`, 'GET', undefined, bearer)
						)
					).hits[0].id,
					card.id
				);
				for (const value of ['-1', '1.5', '1e2', 'Infinity', '', '501'])
					assert.equal((await invoke(`/api/catalog/search?limit=${value}`)).status, 400);
				for (const value of ['0', '101', '1e1'])
					assert.equal((await invoke(`${printings}?limit=${value}`)).status, 400);
				assert.equal((await invoke('/api/catalog/search?offset=1000001')).status, 400);
				assert.equal((await invoke('/api/catalog/printings/invalid')).status, 400);
				assert.equal((await invoke(`${prefix}/search`)).status, 401);
				assert.equal(
					(
						await invoke(`${prefix}/search`, 'GET', undefined, {
							authorization: 'Bearer invalid',
							cookie: `spellbook_session=${a.session.token}`
						})
					).status,
					401
				);
				assert.equal(
					(
						await json(
							'/api/catalog/search',
							'POST',
							{ filters: { colorIdentity: ['U'] }, facets: true },
							{}
						)
					).status,
					200
				);
				assert.equal(
					(await json('/api/catalog/search', 'POST', { filters: { expression: 'anything' } }, {}))
						.status,
					400
				);
			}
		);
		await t.test('JSON media, UTF-8, object and byte limits fail before any mutation', async () => {
			assert.equal((await invoke(inventory, 'POST', '{}', bearer)).status, 415);
			for (const body of ['{', '[]', 'null'])
				assert.equal(
					(await invoke(inventory, 'POST', body, { ...bearer, 'content-type': 'application/json' }))
						.status,
					400
				);
			assert.equal(
				(
					await invoke(inventory, 'POST', new Uint8Array([0xff]), {
						...bearer,
						'content-type': 'application/json'
					})
				).status,
				400
			);
			assert.equal(
				(
					await invoke(inventory, 'POST', ' '.repeat(1024 * 1024 + 1), {
						...bearer,
						'content-type': 'application/json'
					})
				).status,
				413
			);
			assert.equal(
				(
					await json(inventory, 'POST', {
						requestId: randomUUID(),
						items: [{ catalogCardId: card.id, quantity: '2' }]
					})
				).status,
				400
			);
			assert.equal(
				(await json(inventory, 'POST', { requestId: randomUUID(), source: 5, items: [] })).status,
				400
			);
			assert.equal(
				(
					await json(
						inventory,
						'POST',
						{},
						{ cookie: `spellbook_session=${a.session.token}`, origin: 'https://foreign.invalid' }
					)
				).status,
				403
			);
		});
		let entryId = '',
			notesRevision = '',
			revision = '';
		await t.test(
			'Inventory aliases, original receipts, optional fields and public conflict details survive extraction',
			async () => {
				const intent = {
					requestId: randomUUID(),
					items: [{ catalogCardId: card.id, quantity: 3 }]
				};
				const acknowledgement = await success(await json(inventory, 'POST', intent));
				entryId = acknowledgement.changes[0].entryId;
				assert.equal(acknowledgement.changes[0].quantity, 3);
				let detail = await success(
					await invoke(`${inventory}/${entryId}`, 'GET', undefined, bearer)
				);
				notesRevision = detail.entry.notesRevision;
				assert.equal(detail.entry.finish, 'nonfoil');
				assert.equal(detail.entry.condition, 'NM');
				assert.equal(detail.entry.notes, '');
				const patch = { requestId: randomUUID(), delta: 2, notes: 'retained notes', notesRevision };
				await success(await json(`${inventory}/${entryId}`, 'PATCH', patch));
				assert.deepEqual(
					await success(await json(`${inventory}/batch-add`, 'POST', intent)),
					acknowledgement
				);
				assert.equal(
					(
						await json(inventory, 'POST', {
							...intent,
							items: [{ catalogCardId: card.id, quantity: 4 }]
						})
					).status,
					409
				);
				const conflict = await json(`${inventory}/${entryId}`, 'PATCH', {
					requestId: randomUUID(),
					notes: 'stale',
					notesRevision
				});
				const conflictBody = await conflict.json();
				assert.equal(conflict.status, 409);
				assert.equal(conflictBody.kind, 'NotesConflict');
				assert.equal(conflictBody.notes, 'retained notes');
				assert.equal(conflictBody.entryId, entryId);
				assert.notEqual(conflictBody.notesRevision, notesRevision);
				const changedQuantity = await json(`${inventory}/${entryId}`, 'DELETE', {
					requestId: randomUUID(),
					expectedQuantity: 3
				});
				assert.equal(changedQuantity.status, 409);
				assert.equal((await changedQuantity.json()).latestQuantity, 5);
				await success(
					await json(`${inventory}/${entryId}`, 'PATCH', { requestId: randomUUID(), quantity: 4 })
				);
				detail = await success(await invoke(`${inventory}/${entryId}`, 'GET', undefined, bearer));
				assert.equal(detail.entry.notes, 'retained notes');
				revision = detail.revision;
				assert.equal(
					(await invoke(`${inventory}/${entryId}`, 'GET', undefined, foreign)).status,
					404
				);
				assert.equal(
					(await invoke(`${inventory}?revision=0`, 'GET', undefined, bearer)).status,
					409
				);
				assert.equal(
					(await invoke(`${inventory}/${entryId}/location`, 'GET', undefined, bearer)).status,
					400
				);
				assert.equal(
					(await invoke(`${inventory}/${entryId}/location?revision=0`, 'GET', undefined, bearer))
						.status,
					409
				);
				assert.equal(
					(
						await success(
							await invoke(
								`${inventory}/${entryId}/location?revision=${revision}`,
								'GET',
								undefined,
								bearer
							)
						)
					).index,
					0
				);
			}
		);
		await t.test(
			'Groups, Membership, position, bulk and import retain their real use-case contracts',
			async () => {
				const created = await success(
					await json(`${inventory}/groups`, 'POST', { requestId: randomUUID(), name: 'Box A' })
				);
				const groupId = created.groups[0].groupId;
				await success(
					await json(`${inventory}/groups/${groupId}`, 'PATCH', {
						requestId: randomUUID(),
						name: 'Box B'
					})
				);
				await success(
					await json(`${inventory}/${entryId}/groups`, 'PUT', {
						requestId: randomUUID(),
						groupIds: [groupId]
					})
				);
				const detail = await success(
					await invoke(`${inventory}/${entryId}`, 'GET', undefined, bearer)
				);
				assert.deepEqual(detail.memberships, [groupId]);
				const groups = await success(await invoke(`${inventory}/groups`, 'GET', undefined, bearer));
				assert.equal(groups.groups[0].name, 'Box B');
				assert.equal(groups.groups[0].quantity, 4);
				assert.equal(
					(
						await json(
							`${inventory}/groups/${groupId}`,
							'PATCH',
							{ requestId: randomUUID(), name: 'Foreign' },
							foreign
						)
					).status,
					404
				);
				await success(
					await json(`${inventory}/${entryId}/position`, 'PATCH', {
						requestId: randomUUID(),
						position: 1
					})
				);
				await success(
					await json(`${inventory}/bulk`, 'POST', {
						requestId: randomUUID(),
						operations: [{ op: 'set', target: { entryId }, quantity: 6 }]
					})
				);
				const text = `1 ${card.name} (${card.set_code}) ${card.collector_number}`;
				await success(await json(`${inventory}/import/preview`, 'POST', { text }));
				const imported = await success(
					await json(`${inventory}/import/commit`, 'POST', { requestId: randomUUID(), text })
				);
				assert.equal(imported.import.resolvedCount, 1);
				await success(
					await json(`${inventory}/groups/${groupId}`, 'DELETE', { requestId: randomUUID() })
				);
				assert.deepEqual(
					(await success(await invoke(`${inventory}/${entryId}`, 'GET', undefined, bearer)))
						.memberships,
					[]
				);
			}
		);
		await t.test(
			'public prices and private values retain validation, no-store and ownership',
			async () => {
				const query = `printingId=${card.id}&finish=nonfoil`;
				for (const path of [
					`${prefix}/prices?${query}`,
					`${prefix}/prices/history?${query}&source=Scryfall`
				]) {
					const response = await invoke(path);
					assert.equal(response.headers.get('cache-control'), 'no-store');
					await success(response);
				}
				for (const path of [
					`${prefix}/prices?${query}&finish=foil`,
					`${prefix}/prices?${query}&accountId=${a.user.accountId}`,
					`${prefix}/prices/history?${query}&days=1e1`,
					`${prefix}/prices/history?${query}&days=91`
				])
					assert.equal((await invoke(path)).status, 400);
				await success(await json(`${inventory}/prices`, 'POST', { entryIds: [entryId] }));
				assert.equal(
					(await json(`${inventory}/prices`, 'POST', { entryIds: [entryId] }, foreign)).status,
					404
				);
				for (const suffix of ['value', 'value-history?days=3']) {
					assert.equal((await invoke(`${inventory}/${suffix}`)).status, 401);
					const response = await invoke(`${inventory}/${suffix}`, 'GET', undefined, bearer);
					assert.equal(response.headers.get('cache-control'), 'private, no-store');
					await success(response);
				}
				for (const suffix of [
					'value?days=3',
					'value-history?days=01',
					'value-history?days=367',
					'value-history?days=2&days=3',
					'value-history?accountId=foreign'
				])
					assert.equal(
						(await invoke(`${inventory}/${suffix}`, 'GET', undefined, bearer)).status,
						400
					);
			}
		);
		await t.test(
			'Scan actual-worker upload, image, authoritative results and commit replay preserve lifecycle',
			async () => {
				const created = await invoke(`${scan}/sessions`, 'POST', undefined, bearer);
				assert.equal(created.headers.get('cache-control'), 'no-store');
				const session = (await success(created)).session;
				assert.equal(session.accountId, undefined);
				assert.equal(
					(await success(await invoke(`${scan}/sessions`, 'GET', undefined, bearer))).sessions[0]
						.id,
					session.id
				);
				const frames = `${scan}/sessions/${session.id}/frames`;
				assert.equal(
					(await invoke(frames, 'POST', '{}', { ...bearer, 'content-type': 'application/json' }))
						.status,
					415
				);
				assert.equal(
					(
						await invoke(frames, 'POST', 'broken', {
							...bearer,
							'content-type': 'multipart/form-data'
						})
					).status,
					400
				);
				assert.equal(
					(
						await invoke(frames, 'POST', new Uint8Array(12 * 1024 * 1024 + 1), {
							...bearer,
							'content-type': 'multipart/form-data; boundary=test'
						})
					).status,
					413
				);
				function image(bytes: Uint8Array = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])) {
					const form = new FormData();
					form.set('file', new File([new Uint8Array(bytes)], 'card.png', { type: 'image/png' }));
					return form;
				}
				assert.equal(
					(await invoke(frames, 'POST', image(new Uint8Array([1, 2, 3])), bearer)).status,
					415
				);
				assert.equal(
					(await invoke(frames, 'POST', image(new Uint8Array(10 * 1024 * 1024 + 1)), bearer))
						.status,
					413
				);
				const uploaded = await success(await invoke(frames, 'POST', image(), bearer));
				assert.equal(uploaded.result.status, 'no_match');
				assert.equal(uploaded.result.embeddingModelVersion, 'stub-v1');
				assert.equal(uploaded.artifact.originalObjectKey, undefined);
				assert.equal(uploaded.artifact.accountId, undefined);
				const artifactId = uploaded.artifact.id;
				const imagePath = `${scan}/artifacts/${artifactId}/image`;
				const read = await invoke(imagePath, 'GET', undefined, bearer);
				assert.equal(read.headers.get('cache-control'), 'no-store');
				assert.equal(read.headers.get('x-content-type-options'), 'nosniff');
				assert.equal(read.headers.get('content-type'), 'image/png');
				assert.equal(read.headers.get('content-length'), '8');
				assert.deepEqual(
					new Uint8Array(await read.arrayBuffer()),
					Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
				);
				assert.equal((await invoke(imagePath, 'GET', undefined, foreign)).status, 404);
				const resultPath = `${scan}/sessions/${session.id}/artifacts/${artifactId}/result`;
				const result = await success(
					await json(resultPath, 'POST', {
						status: 'matched',
						modelVersion: 'external-test-v1',
						candidates: [{ catalogCardId: card.id, confidence: 0.8, name: 'untrusted' }]
					})
				);
				assert.equal(result.result.candidates[0].name, card.name);
				const selectedPath = `${scan}/sessions/${session.id}/result`;
				assert.equal(
					(await invoke(`${selectedPath}?limit=1e1`, 'GET', undefined, bearer)).status,
					400
				);
				assert.equal((await invoke(selectedPath, 'GET', undefined, foreign)).status, 404);
				assert.equal(
					(await success(await invoke(selectedPath, 'GET', undefined, bearer))).artifactCount,
					1
				);
				const commit = {
					requestId: randomUUID(),
					sessionId: session.id,
					items: [
						{
							scanArtifactId: artifactId,
							catalogCardId: card.id,
							finish: 'nonfoil',
							condition: 'NM',
							quantity: 2
						}
					]
				};
				const saved = await success(await json(`${scan}/review/commit`, 'POST', commit));
				assert.equal(saved.kind, 'Committed');
				assert.equal(saved.sessionId, session.id);
				assert.deepEqual(await success(await json(`${scan}/review/commit`, 'POST', commit)), saved);
				assert.equal(
					(
						await json(`${scan}/review/commit`, 'POST', {
							...commit,
							items: [{ ...commit.items[0], quantity: 3 }]
						})
					).status,
					409
				);
				assert.equal(
					(
						await json(resultPath, 'POST', {
							status: 'no_match',
							modelVersion: 'late',
							candidates: []
						})
					).status,
					409
				);
				assert.equal((await invoke(frames, 'POST', image(), bearer)).status, 409);
			}
		);
		await t.test('reviewed removal and revoked credentials remain authoritative', async () => {
			const detail = await success(
				await invoke(`${inventory}/${entryId}`, 'GET', undefined, bearer)
			);
			await success(
				await json(`${inventory}/${entryId}`, 'DELETE', {
					requestId: randomUUID(),
					expectedQuantity: detail.entry.quantity
				})
			);
			assert.equal((await invoke(`${inventory}/${entryId}`, 'GET', undefined, bearer)).status, 404);
			await application.auth.revokeSession(a.session.token);
			assert.equal((await invoke(inventory, 'GET', undefined, bearer)).status, 401);
			assert.equal((await invoke(`${scan}/sessions`, 'GET', undefined, bearer)).status, 401);
		});
	}
);
