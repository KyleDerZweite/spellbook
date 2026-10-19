import { test } from 'vitest';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { stat, unlink } from 'node:fs/promises';
import { cpus, freemem, platform, release, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import pg from 'pg';
import type {
	InventoryAcknowledgement,
	InventoryPage,
	InventoryQuery
} from '@spellbook/contracts/inventory.ts';
import type { CatalogSearchRequest, SearchResult } from '@spellbook/contracts/catalog.ts';
import { InventoryWindow, inventoryUrl } from '#lib/inventory/window.ts';
import { CatalogWindow, type CatalogWindowSnapshot } from '#lib/search/catalogWindow.ts';
import type { SearchContextInput } from '#lib/search/requestContext.ts';
import { fixtureAuthRequest } from './fixtures/http-auth.ts';
import { seedAccountScaleInventoryRecords } from './fixtures/account-scale.ts';
import {
	cleanupPerformanceFixture,
	performanceArtifact,
	performanceConfiguration,
	performanceRunner,
	publishPerformanceCatalog,
	readPerformanceManifest,
	seedPerformanceGroups,
	writePerformanceJson,
	type PerformanceManifest
} from './fixtures/browsing-performance.ts';
import { startHttpApplication, stopHttpApplication } from './http-runtime.ts';

interface Sample {
	owner: string;
	step: string;
	size?: number;
	offset?: number;
	limit?: number;
	state: string;
	milliseconds: number;
	headersMs: number;
	bodyMs: number;
	decodeMs: number;
	bytes: number;
	rows: number;
	publication?: string | null;
	reportedProcessingTimeMs?: number;
}
const query: InventoryQuery = {
	q: '',
	sets: [],
	finish: 'all',
	condition: 'all',
	sort: 'name',
	dir: 'asc',
	variant: null,
	variantDir: 'asc',
	view: 'cards',
	group: null,
	offset: 0,
	limit: 200
};

function ranges(total: number) {
	return [...new Set([0, Math.floor(total / 400) * 200, Math.floor((total - 1) / 200) * 200])];
}
async function untilIdle(idle: () => boolean) {
	const deadline = performance.now() + 60_000;
	while (!idle()) {
		assert.ok(performance.now() < deadline, 'Production window did not settle within 60 seconds.');
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}
function inventoryBounds(metrics: ReturnType<InventoryWindow['metrics']>) {
	assert.ok(metrics.requests <= 3);
	assert.ok(metrics.contexts <= 4);
	assert.ok(metrics.entries <= 1000);
	assert.ok(metrics.pages <= 20);
	assert.equal(metrics.byteTarget, 32 * 1024 * 1024);
	// Required active pages and metadata can exceed the target. Never impose a wire-byte cap.
	assert.equal(metrics.byteOverflow, Math.max(0, metrics.serializedBytes - metrics.byteTarget));
}
function catalogBounds(snapshot: CatalogWindowSnapshot) {
	if (!snapshot.resources) return;
	assert.ok(snapshot.resources.physicalRequests <= 3);
	assert.ok(snapshot.resources.contexts <= 4);
	assert.ok(snapshot.resources.records <= 1000);
	assert.ok(snapshot.resources.pages <= 20);
	assert.equal(
		snapshot.resources.byteOverflow,
		Math.max(0, snapshot.resources.bytes - 8 * 1024 * 1024)
	);
}

/** Hold transport settlement after a real HTTP read, including after logical cancellation. */
function heldReads<Input, Result>(read: (input: Input) => Promise<Result>) {
	let held = true;
	let active = 0;
	let peak = 0;
	const calls: Array<{ input: Input; signal: AbortSignal }> = [];
	const releases: Array<() => void> = [];
	return {
		calls,
		get peak() {
			return peak;
		},
		async load(input: Input, signal: AbortSignal): Promise<Result> {
			calls.push({ input, signal });
			active++;
			peak = Math.max(peak, active);
			assert.ok(active <= 3, 'Unsettled transports retain their physical admission permits.');
			const gate = held
				? new Promise<void>((resolve) => releases.push(resolve))
				: Promise.resolve();
			try {
				// Deliberately ignore abort until settlement to model slow cancellation.
				const result = await read(input);
				await gate;
				return result;
			} finally {
				active--;
			}
		},
		release() {
			held = false;
			for (const release of releases.splice(0)) release();
		}
	};
}

// Even `vitest run` selecting every project cannot access fixture data without this opt-in.
test.skipIf(process.env.TEST_BROWSING_PERFORMANCE !== '1')(
	'recordedEnglish built HTTP and actual production browsing windows',
	async () => {
		const config = performanceConfiguration();
		if (config.cleanupManifest) {
			const manifest = await readPerformanceManifest(
				config.cleanupManifest,
				config.databaseName,
				config.origin
			);
			const pool = new pg.Pool({
				connectionString: config.database,
				connectionTimeoutMillis: 10_000
			});
			try {
				await cleanupPerformanceFixture(pool, manifest);
				await unlink(resolve(config.cleanupManifest, '../credentials.json')).catch(() => {});
			} finally {
				try {
					await writePerformanceJson(config.cleanupManifest, manifest);
				} finally {
					await pool.end();
				}
			}
			return;
		}
		assert.ok(config.buildStamp);
		const alreadyExists = await stat(config.directory).then(
			() => true,
			(cause: NodeJS.ErrnoException) => {
				if (cause.code === 'ENOENT') return false;
				throw new Error('Cannot inspect the requested performance evidence directory.');
			}
		);
		assert.ok(!alreadyExists, 'Use a new TEST_PERFORMANCE_OUTPUT directory for each run.');
		const artifact = await performanceArtifact(config.entrypoint, config.buildStamp);
		const runner = performanceRunner();
		// This is deliberately before Pool creation, registration, publication or fixture writes.
		const child = await startHttpApplication(
			config.origin,
			new URL('../', import.meta.url),
			config.entrypoint
		);
		const pool = new pg.Pool({
			connectionString: config.database,
			connectionTimeoutMillis: 10_000
		});
		const manifest: PerformanceManifest = {
			format: 'spellbook-browsing-performance-v1',
			runId: config.runId,
			databaseName: config.databaseName,
			origin: config.origin,
			generationId: randomUUID(),
			previousState: null,
			accounts: [],
			cleanup: 'pending'
		};
		const manifestPath = resolve(config.directory, 'manifest.json');
		const credentialsPath = resolve(config.directory, 'credentials.json');
		const checkpoint = () => writePerformanceJson(manifestPath, manifest);
		const credentials: Array<{
			accountId: string;
			username: string;
			password: string;
			token: string;
			size: number;
		}> = [];
		const samples: Sample[] = [];
		const windows: unknown[] = [];
		const browser: NonNullable<PerformanceManifest['browser']> = [];
		const shellValue = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
		manifest.cleanupCommand = `TEST_BROWSING_PERFORMANCE=1 TEST_PERFORMANCE_DISPOSABLE_DB=${shellValue(config.databaseName)} APP_ORIGIN=${shellValue(config.origin)} TEST_HTTP_PORT=${new URL(config.origin).port} TEST_PERFORMANCE_CLEANUP_MANIFEST=${shellValue(manifestPath)} fnm exec --using 26.10.0 pnpm --dir frontend test:performance`;
		manifest.browser = browser;
		manifest.reportFile = 'report.json';
		manifest.credentialsFile = 'credentials.json';
		const report: Record<string, unknown> = {
			startedAt: new Date().toISOString(),
			runtime: { pid: child.web.pid, entrypoint: config.entrypoint },
			windowImplementation: { source: 'runner checkout transformed by Vitest', head: runner.head },
			runner,
			artifact,
			parameters: {
				origin: config.origin,
				repetitions: config.repetitions,
				sizes: [1000, 10000, 50000],
				range: 200,
				keepFixtures: config.keepFixtures
			},
			machine: {
				platform: platform(),
				release: release(),
				cpu: cpus()[0]?.model,
				logicalCPUs: cpus().length,
				ramBytes: totalmem(),
				availableRAMBytes: freemem()
			},
			node: process.version,
			observability: {
				clientCold: 'New production Window with empty caches; HTTP cache disabled.',
				warm: 'Repeated identical HTTP reads and retained Window cache revisit, labeled separately.',
				postgresBufferCold: 'unmeasured; no shared-buffer or OS-cache reset',
				sqlDuration: 'unmeasured',
				queryPlans: 'unmeasured; use existing SQL scale owner separately',
				domRows: 'unmeasured; browser owner must verify maximum 200',
				activeDTOSnapshots: 'unmeasured; browser owner must verify maximum 8',
				longTasks: 'unmeasured',
				layout: 'unmeasured',
				productionUpdateSegment:
					'unmeasured; Window command durations include transport and publication',
				browserHeap: 'unmeasured',
				sourceFreshness: 'recordedEnglish does not satisfy current full-Catalog acceptance'
			},
			samples,
			windows,
			browser
		};
		let fixturePrepared = false;
		let succeeded = false;
		let phase = 'database metadata';
		try {
			const version = (await pool.query('SHOW server_version')).rows[0].server_version;
			assert.match(version, /^18\./, 'Performance fixtures require PostgreSQL 18.');
			report.postgres = version;
			report.migrations = (
				await pool.query('SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id')
			).rows;
			phase = 'verified Catalog publication';
			const verified = await publishPerformanceCatalog(pool, manifest, async () => {
				await checkpoint();
				fixturePrepared = true;
			});
			report.source = { ...verified.provenance, generation: manifest.generationId };
			await pool.query('ANALYZE catalog_printings');
			await pool.query('ANALYZE catalog_oracle_facts');

			async function measured<T>(
				owner: string,
				step: string,
				path: string,
				init: RequestInit,
				context: Partial<Sample> = {}
			) {
				const started = performance.now();
				const timeout = AbortSignal.timeout(60_000);
				const response = await fetch(config.origin + path, {
					...init,
					cache: 'no-store',
					signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
				});
				const headersAt = performance.now();
				assert.equal(response.status, 200, `${owner} ${step} HTTP status`);
				assert.match(response.headers.get('content-type') ?? '', /application\/json/);
				const text = await response.text();
				const bodyAt = performance.now();
				const data: T = JSON.parse(text);
				const decodedAt = performance.now();
				const sample: Sample = {
					owner,
					step,
					state: 'HTTP first observation; database warmth unknown',
					milliseconds: decodedAt - started,
					headersMs: headersAt - started,
					bodyMs: bodyAt - headersAt,
					decodeMs: decodedAt - bodyAt,
					bytes: Buffer.byteLength(text, 'utf8'),
					rows: 0,
					...context
				};
				samples.push(sample);
				return { data, sample };
			}
			for (const size of [1000, 10000, 50000] as const) {
				phase = `Inventory ${size} fixture and reads`;
				const username = `perf_${config.runId.slice(0, 8)}_${size}`;
				const password = randomUUID() + 'A7!';
				const registered = await fixtureAuthRequest(
					config.origin,
					'/api/auth/register',
					{ username, password },
					{}
				);
				assert.equal(registered.status, 201);
				const actor: { user: { accountId: string }; token: string } = await registered.json();
				const account = {
					accountId: actor.user.accountId,
					username,
					password,
					token: actor.token,
					size
				};
				manifest.accounts.push({ accountId: account.accountId, username, size });
				credentials.push(account);
				await checkpoint();
				await writePerformanceJson(
					credentialsPath,
					{ origin: config.origin, accounts: credentials },
					true
				);
				const fixture = await seedAccountScaleInventoryRecords(
					pool,
					account.accountId,
					verified.records,
					size
				);
				const groups = await seedPerformanceGroups(
					pool,
					fixture.inventoryId,
					fixture.entries.map((entry) => entry.id)
				);
				for (const table of [
					'inventory_cards',
					'inventories',
					'inventory_groups',
					'inventory_group_memberships'
				])
					await pool.query(`ANALYZE ${table}`);
				const headers = { cookie: `spellbook_session=${account.token}` };
				const selected = new Map<string, (typeof fixture.entries)[number]>(
					fixture.entries.map((entry) => [entry.id, entry])
				);
				const canonicalCount = new Set(fixture.entries.map((entry) => entry.canonicalCardId)).size;
				const membershipByEntry = new Map<string, string[]>();
				for (const membership of groups.memberships) {
					const owned = membershipByEntry.get(membership.entryId) ?? [];
					owned.push(`${membership.entryId}:${membership.groupId}`);
					membershipByEntry.set(membership.entryId, owned);
				}
				let revision: string | undefined;
				async function inventory(
					input: InventoryQuery,
					expectedRevision?: string,
					signal?: AbortSignal,
					step = 'range',
					state?: string
				) {
					const { data, sample } = await measured<InventoryPage>(
						'Inventory',
						step,
						`/api/mobile/v1/mtg/inventory?${inventoryUrl(input, expectedRevision)}`,
						{ headers, signal },
						{ size, offset: input.offset, limit: input.limit, ...(state ? { state } : {}) }
					);
					assert.equal(data.kind, 'Page');
					assert.equal(data.query.offset, input.offset);
					assert.equal(data.query.limit, input.limit);
					assert.equal(data.totals.entryCount, size);
					assert.equal(data.totals.copyCount, size);
					assert.equal(data.totals.canonicalCardCount, canonicalCount);
					assert.equal(data.matching.copyCount, data.matching.entryCount);
					assert.ok(canonicalCount < size, 'Canonical cards repeat across genuine variants.');
					assert.equal(data.revision, revision ?? data.revision);
					revision ??= data.revision;
					assert.equal(
						data.entries.length,
						Math.min(input.limit, Math.max(0, data.matching.entryCount - input.offset))
					);
					assert.equal(new Set(data.entries.map((entry) => entry.id)).size, data.entries.length);
					for (const entry of data.entries) {
						const expected = selected.get(entry.id);
						assert.ok(expected, 'Read contains only this owned fixture.');
						assert.equal(entry.accountId, account.accountId);
						assert.equal(entry.catalogCardId, expected.catalogCardId);
						assert.equal(entry.finish, expected.finish);
						assert.equal(entry.condition, expected.condition);
						assert.equal(entry.quantity, expected.quantity);
					}
					assert.deepEqual(
						data.memberships.map((item) => `${item.entryId}:${item.groupId}`).sort(),
						data.entries.flatMap((entry) => membershipByEntry.get(entry.id) ?? []).sort()
					);
					assert.equal(data.groupCount, 3);
					for (const group of groups.groups) {
						const actual = data.groups.find((item) => item.id === group.id);
						assert.equal(
							actual?.entryCount,
							groups.memberships.filter((item) => item.groupId === group.id).length
						);
					}
					if (input.group)
						assert.equal(
							data.matching.entryCount,
							groups.memberships.filter((item) => item.groupId === input.group).length
						);
					else if (input.condition !== 'all') assert.equal(data.matching.entryCount, size / 5);
					else if (!input.q && !input.sets.length && input.finish === 'all')
						assert.equal(data.matching.entryCount, size);
					sample.rows = data.entries.length;
					sample.publication = data.revision;
					return data;
				}
				const defaults = await measured<InventoryPage>(
					'Inventory',
					'omitted limit',
					'/api/mobile/v1/mtg/inventory',
					{ headers },
					{ size }
				);
				assert.equal(defaults.data.entries.length, 50);
				defaults.sample.rows = 50;
				for (const offset of ranges(size)) {
					let ids: string[] | undefined;
					for (let repetition = 0; repetition < config.repetitions; repetition++) {
						const page = await inventory(
							{ ...query, offset },
							revision,
							undefined,
							'200 range',
							repetition ? 'Repeated identical HTTP read' : undefined
						);
						if (ids)
							assert.deepEqual(
								page.entries.map((entry) => entry.id),
								ids
							);
						ids = page.entries.map((entry) => entry.id);
					}
				}
				await inventory({ ...query, limit: 500 });
				assert.equal(
					(await fetch(`${config.origin}/api/mobile/v1/mtg/inventory?limit=501`, { headers }))
						.status,
					400
				);
				const filtered = await inventory({ ...query, condition: 'NM', dir: 'desc' });
				assert.ok(filtered.entries.every((entry) => entry.condition === 'NM'));
				// Check the declared descending name order with the database's existing collation.
				const expectedNames = (
					await pool.query(
						`SELECT name FROM inventory_cards WHERE inventory_id=$1 AND condition='NM' ORDER BY name COLLATE "inventory_root" DESC LIMIT 200`,
						[fixture.inventoryId]
					)
				).rows.map((row) => row.name);
				assert.deepEqual(
					filtered.entries.map((entry) => entry.name),
					expectedNames
				);
				for (const group of groups.groups) await inventory({ ...query, group: group.id });
				const setCode = fixture.entries[0].setCode;
				const setPage = await inventory({ ...query, sets: [setCode] });
				assert.equal(
					setPage.matching.entryCount,
					fixture.entries.filter((entry) => entry.setCode === setCode).length
				);
				assert.ok(setPage.entries.every((entry) => entry.setCode === setCode));

				const offsets: number[] = [];
				let peak = {
					requests: 0,
					entries: 0,
					pages: 0,
					contexts: 0,
					serializedBytes: 0,
					byteOverflow: 0
				};
				let window!: InventoryWindow;
				window = new InventoryWindow(
					async (input, expected, signal) => {
						offsets.push(input.offset);
						return inventory(input, expected, signal, 'production Window transport');
					},
					() => {
						const metrics = window.metrics();
						inventoryBounds(metrics);
						for (const key of Object.keys(peak) as Array<keyof typeof peak>)
							peak[key] = Math.max(peak[key], metrics[key]);
					}
				);
				try {
					for (const offset of ranges(size)) {
						window.clear(true);
						const before = offsets.length;
						const started = performance.now();
						await window.open(
							account.accountId,
							{ ...query, offset },
							new AbortController().signal
						);
						assert.equal(window.error, '');
						assert.deepEqual(
							offsets.slice(before),
							[offset],
							'A stable deep open reads its address directly.'
						);
						assert.equal(window.current?.matching.entryCount, size);
						assert.deepEqual(window.span, { start: offset, end: Math.min(size, offset + 200) });
						const warmAt = performance.now();
						await window.request(offset);
						assert.equal(offsets.length, before + 1, 'Retained range revisit has no transport.');
						windows.push({
							owner: 'Inventory',
							size,
							offset,
							coldOpenMs: warmAt - started,
							warmCacheRevisitMs: performance.now() - warmAt
						});
					}
					await window.open(account.accountId, query, new AbortController().signal);
					for (let offset = 200; offset <= Math.min(size - 200, 1800); offset += 200) {
						window.plan(offset - 40, offset, true);
						await untilIdle(() => window.metrics().requests === 0 && window.metrics().queued === 0);
						assert.equal(window.error, '');
					}
					await window.request(0);
					for (const condition of ['NM', 'LP', 'MP', 'HP', 'DMG'] as const)
						await window.open(
							account.accountId,
							{ ...query, condition },
							new AbortController().signal
						);
					windows.push({ owner: 'Inventory', size, peak, final: window.metrics() });
				} finally {
					window.clear(true);
				}

				if (size === 50000) {
					const held = heldReads((input: InventoryQuery) =>
						inventory(input, undefined, undefined, 'held abort transport')
					);
					const bounded = new InventoryWindow(
						(input, _revision, signal) => held.load(input, signal),
						() => {}
					);
					bounded.seed(account.accountId, await inventory(query));
					const pending = [200, 400, 600].map((offset) => bounded.request(offset));
					const replacements = (['NM', 'LP', 'MP', 'HP', 'DMG'] as const).map((condition) =>
						bounded.open(account.accountId, { ...query, condition }, new AbortController().signal)
					);
					try {
						assert.equal(held.calls.length, 3);
						assert.ok(held.calls.every((call) => call.signal.aborted));
						held.release();
						await Promise.all([...pending, ...replacements]);
						assert.equal(bounded.error, '');
						assert.equal(bounded.current?.query.condition, 'DMG');
						assert.equal(
							held.calls.length,
							4,
							'Defined held burst has one current coalesced follow-up.'
						);
						assert.equal(held.peak, 3);
						inventoryBounds(bounded.metrics());
						windows.push({
							owner: 'Inventory',
							size,
							step: 'held abort and replacement burst',
							physicalPeak: held.peak,
							calls: held.calls.length
						});
					} finally {
						held.release();
						bounded.clear(true);
						await Promise.allSettled([...pending, ...replacements]);
					}
				}

				// One compact receipt checks its shape; existing mutation-scale suites retain benchmark ownership.
				const entry = fixture.entries[0];
				const receipt = await measured<InventoryAcknowledgement>(
					'Inventory',
					'single confirmed receipt',
					`/api/mobile/v1/mtg/inventory/${entry.id}`,
					{
						headers: { ...headers, origin: config.origin, 'content-type': 'application/json' },
						method: 'PATCH',
						body: JSON.stringify({ requestId: randomUUID(), quantity: 1 })
					},
					{ size }
				);
				assert.deepEqual(
					receipt.data.changes.map((change) => change.entryId),
					[entry.id]
				);
				assert.equal(receipt.data.changes[0].quantity, 1);
				assert.deepEqual(receipt.data.removedEntryIds, []);
				assert.deepEqual(receipt.data.groups, []);
				assert.deepEqual(receipt.data.memberships, []);
				assert.ok(!('entries' in receipt.data) && !('cards' in receipt.data));
				receipt.sample.rows = 1;
				browser.push({
					size,
					entryCount: size,
					copyCount: size,
					canonicalCardCount: canonicalCount,
					accountId: account.accountId,
					groups: groups.groups,
					inventoryURLs: ranges(size).map(
						(offset) => `${config.origin}/mtg/inventory?page=${offset / 200 + 1}`
					)
				});
			}

			phase = 'Catalog HTTP and production Window';
			const canonicalCount = verified.provenance.canonicalCount;
			async function catalog(
				input: CatalogSearchRequest,
				signal?: AbortSignal,
				step = 'range',
				state?: string
			) {
				const { data, sample } = await measured<SearchResult>(
					'Catalog',
					step,
					'/api/catalog/search',
					{
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(input),
						signal
					},
					{ offset: input.offset ?? 0, limit: input.limit ?? 20, ...(state ? { state } : {}) }
				);
				assert.equal(data.generationId, manifest.generationId);
				assert.equal(
					data.hits.length,
					Math.min(input.limit ?? 20, Math.max(0, data.estimatedTotalHits - (input.offset ?? 0)))
				);
				assert.equal(new Set(data.hits.map((hit) => hit.id)).size, data.hits.length);
				assert.equal(new Set(data.hits.map((hit) => hit.oracle_id)).size, data.hits.length);
				assert.ok(
					data.hits.every(
						(hit) =>
							hit.lang === 'en' &&
							Array.isArray(hit.color_identity) &&
							typeof hit.oracle_text === 'string'
					)
				);
				if (!input.query && !input.filters) assert.equal(data.estimatedTotalHits, canonicalCount);
				sample.rows = data.hits.length;
				sample.publication = data.generationId;
				sample.reportedProcessingTimeMs = data.processingTimeMs;
				return data;
			}
			await catalog({ query: '' }, undefined, 'omitted limit');
			const token = credentials[0].token;
			const authenticated = await measured<SearchResult>(
				'Catalog',
				'authenticated omitted limit',
				'/api/mobile/v1/mtg/search',
				{ headers: { cookie: `spellbook_session=${token}` } }
			);
			assert.equal(authenticated.data.hits.length, 20);
			assert.equal(authenticated.data.generationId, manifest.generationId);
			authenticated.sample.rows = 20;
			assert.equal((await fetch(config.origin + '/api/mobile/v1/mtg/search')).status, 401);
			for (const offset of ranges(canonicalCount)) {
				let ids: string[] | undefined;
				for (let repetition = 0; repetition < config.repetitions; repetition++) {
					const page = await catalog(
						{ query: '', limit: 200, offset, sort: 'name:asc', facets: true },
						undefined,
						'200 range',
						repetition ? 'Repeated identical HTTP read' : undefined
					);
					if (ids)
						assert.deepEqual(
							page.hits.map((hit) => hit.id),
							ids
						);
					ids = page.hits.map((hit) => hit.id);
				}
			}
			await catalog({ query: '', limit: 500 });
			assert.equal(
				(
					await fetch(config.origin + '/api/catalog/search', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ query: '', limit: 501 })
					})
				).status,
				400
			);
			const filtered = await catalog({
				query: '',
				filters: { sets: [verified.records[0].document.set_code] },
				limit: 200,
				sort: 'name:desc'
			});
			assert.ok(
				filtered.hits.every((hit) => hit.set_code === verified.records[0].document.set_code)
			);
			const expectedFilteredCount = (
				await pool.query(
					'SELECT count(DISTINCT oracle_id)::int AS count FROM catalog_printings WHERE generation_id=$1 AND set_code=$2',
					[manifest.generationId, verified.records[0].document.set_code]
				)
			).rows[0].count;
			assert.equal(filtered.estimatedTotalHits, expectedFilteredCount);
			const names = filtered.hits.map((hit) => hit.name);
			const orderedNames = (
				await pool.query(
					'SELECT name FROM jsonb_array_elements_text($1::jsonb) AS names(name) ORDER BY name DESC',
					[JSON.stringify(names)]
				)
			).rows.map((row) => row.name);
			assert.deepEqual(names, orderedNames);
			await catalog(
				{ query: verified.records[0].document.name, limit: 200 },
				undefined,
				'literal recorded name search'
			);
			const offsets: number[] = [];
			let snapshot!: CatalogWindowSnapshot;
			let peak = {
				physicalRequests: 0,
				records: 0,
				pages: 0,
				contexts: 0,
				bytes: 0,
				byteOverflow: 0
			};
			const createCatalogWindow = () =>
				new CatalogWindow(
					(next) => {
						snapshot = next;
						catalogBounds(next);
						if (next.resources)
							for (const key of Object.keys(peak) as Array<keyof typeof peak>)
								peak[key] = Math.max(peak[key], next.resources[key]);
					},
					async (input, offset, signal) => {
						offsets.push(offset);
						return catalog(
							{
								query: input.query,
								filters: Object.keys(input.filters).length ? input.filters : undefined,
								sort: input.sort,
								limit: input.limit,
								offset,
								facets: true
							},
							signal,
							'production Window transport'
						);
					}
				);
			let window = createCatalogWindow();
			try {
				for (const offset of ranges(canonicalCount)) {
					window.dispose();
					window = createCatalogWindow();
					const before = offsets.length;
					const started = performance.now();
					window.activate({
						game: 'mtg',
						query: '',
						filters: {},
						limit: 200,
						offset,
						browsingMode: 'lazy',
						sort: 'name:asc'
					});
					window.start();
					await untilIdle(() => snapshot.resources?.physicalRequests === 0 && !snapshot.loading);
					assert.equal(snapshot.error, null);
					assert.equal(snapshot.generation, manifest.generationId);
					assert.equal(snapshot.total, canonicalCount);
					assert.deepEqual(offsets.slice(before), [offset]);
					assert.deepEqual(snapshot.span, {
						start: offset,
						end: Math.min(canonicalCount, offset + 200)
					});
					const warmAt = performance.now();
					window.setRange({ start: offset, end: offset + 20, direction: 1 });
					assert.equal(offsets.length, before + 1);
					windows.push({
						owner: 'Catalog',
						offset,
						coldOpenMs: warmAt - started,
						warmCacheRevisitMs: performance.now() - warmAt
					});
				}
				window.loadEarlier();
				await untilIdle(() => snapshot.resources?.physicalRequests === 0 && !snapshot.loading);
				for (const input of [
					{ query: '', filters: {} },
					{ query: '', filters: { sets: [verified.records[0].document.set_code] } },
					{ query: verified.records[0].document.name, filters: {} },
					{ query: 'dragon', filters: {} },
					{ query: 'elf', filters: {} }
				] satisfies Array<Pick<SearchContextInput, 'query' | 'filters'>>) {
					window.activate({ game: 'mtg', ...input, limit: 200 });
					window.start();
					await untilIdle(() => snapshot.resources?.physicalRequests === 0 && !snapshot.loading);
					assert.equal(snapshot.error, null);
				}
				windows.push({ owner: 'Catalog', peak, final: snapshot.resources });
			} finally {
				window.dispose();
			}
			const held = heldReads((input: { context: SearchContextInput; offset: number }) =>
				catalog(
					{
						query: input.context.query,
						filters: input.context.filters,
						limit: 200,
						offset: input.offset
					},
					undefined,
					'held abort transport'
				)
			);
			let heldSnapshot!: CatalogWindowSnapshot;
			const bounded = new CatalogWindow(
				(next) => {
					heldSnapshot = next;
					catalogBounds(next);
				},
				(context, offset, signal) => held.load({ context, offset }, signal)
			);
			try {
				for (const offset of [0, 200, 400]) {
					bounded.activate({
						game: 'mtg',
						query: '',
						filters: {},
						limit: 200,
						offset,
						browsingMode: 'numeric'
					});
					bounded.start();
				}
				for (const offset of [600, 800, 1000, 1200]) {
					bounded.activate({
						game: 'mtg',
						query: '',
						filters: {},
						limit: 200,
						offset,
						browsingMode: 'numeric'
					});
					bounded.start();
				}
				assert.equal(held.calls.length, 3);
				assert.ok(held.calls.every((call) => call.signal.aborted));
				held.release();
				await untilIdle(
					() => heldSnapshot.resources?.physicalRequests === 0 && !heldSnapshot.loading
				);
				assert.equal(heldSnapshot.error, null);
				assert.equal(heldSnapshot.anchor, 1200);
				assert.equal(
					held.calls.length,
					4,
					'Defined held burst has one current coalesced follow-up.'
				);
				assert.equal(held.calls[3].input.offset, 1200);
				assert.equal(held.peak, 3);
				windows.push({
					owner: 'Catalog',
					step: 'held abort and context burst',
					physicalPeak: held.peak,
					calls: held.calls.length
				});
			} finally {
				held.release();
				bounded.dispose();
			}

			manifest.searchURLs = ranges(canonicalCount).map(
				(offset) => `${config.origin}/mtg/search?page=${offset / 200 + 1}`
			);
			report.searchURLs = manifest.searchURLs;
			assert.equal(
				(await pool.query('SELECT active_generation FROM catalog_state WHERE id=1')).rows[0]
					?.active_generation,
				manifest.generationId
			);
			// A changed build invalidates attribution even if every request happened to pass.
			assert.deepEqual(await performanceArtifact(config.entrypoint, config.buildStamp), artifact);
			succeeded = true;
		} catch (cause) {
			report.failure = {
				phase,
				kind: cause instanceof Error ? cause.name : 'Unknown',
				detail:
					'Inspect this phase using the protected target environment; raw provider errors are not written.'
			};
			throw new Error(
				`Browsing performance failed during ${phase}. ${cause instanceof assert.AssertionError ? cause.message : 'Provider details withheld from normal reports.'}`
			);
		} finally {
			const cleanupErrors: string[] = [];
			try {
				await stopHttpApplication(child);
			} catch {
				cleanupErrors.push(
					'Owned HTTP child did not stop gracefully; inspect its retained process.'
				);
			}
			if (fixturePrepared) {
				if (succeeded && config.keepFixtures) manifest.cleanup = 'retained';
				else {
					try {
						await cleanupPerformanceFixture(pool, manifest);
					} catch {
						manifest.cleanup = 'failed';
						cleanupErrors.push('Owned fixture cleanup failed; use the manifest to recover.');
					}
				}
				await checkpoint();
			}
			if (manifest.cleanup === 'complete') await unlink(credentialsPath).catch(() => {});
			const latencyGroups = new Map<string, number[]>();
			for (const sample of samples) {
				const key = JSON.stringify({
					owner: sample.owner,
					step: sample.step,
					size: sample.size,
					offset: sample.offset,
					limit: sample.limit,
					state: sample.state
				});
				const values = latencyGroups.get(key) ?? [];
				values.push(sample.milliseconds);
				latencyGroups.set(key, values);
			}
			report.latencySummary = [...latencyGroups].map(([key, values]) => {
				values.sort((a, b) => a - b);
				return {
					...JSON.parse(key),
					samples: values.length,
					p50Ms: values[Math.ceil(values.length * 0.5) - 1],
					p95Ms: values[Math.ceil(values.length * 0.95) - 1],
					worstMs: values.at(-1)
				};
			});
			report.completedAt = new Date().toISOString();
			report.cleanup = manifest.cleanup;
			report.cleanupErrors = cleanupErrors;
			report.manifest = manifestPath;
			report.cleanupCommand = manifest.cleanupCommand;
			try {
				await writePerformanceJson(resolve(config.directory, 'report.json'), report);
			} finally {
				await pool.end();
			}
			console.info(`Performance evidence: ${config.directory}; fixture state: ${manifest.cleanup}`);
			if (cleanupErrors.length) throw new Error(cleanupErrors.join(' '));
		}
	}
);
