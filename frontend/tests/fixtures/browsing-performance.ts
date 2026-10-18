import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool, PoolClient } from 'pg';
import type { CardDocument } from '@spellbook/contracts/catalog.ts';
import { httpTestOrigin } from '../http-runtime.ts';
import type { ScalePrinting } from './account-scale.ts';

export const frontendDirectory = fileURLToPath(new URL('../../', import.meta.url));
export const repositoryDirectory = resolve(frontendDirectory, '..');
const localDirectory = resolve(repositoryDirectory, '.local');
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const headPattern = /^[0-9a-f]{40}$/;

export function performanceConfiguration(env: NodeJS.ProcessEnv = process.env) {
	if (env.TEST_BROWSING_PERFORMANCE !== '1')
		throw new Error(
			'Set TEST_BROWSING_PERFORMANCE=1 to authorize disposable performance fixtures.'
		);
	const database = env.TEST_DATABASE_URL;
	if (!database || database !== env.DATABASE_URL)
		throw new Error('Matching DATABASE_URL and TEST_DATABASE_URL are required.');
	let target: URL;
	try {
		target = new URL(database);
	} catch {
		throw new Error('A valid PostgreSQL target is required.');
	}
	if (!['postgres:', 'postgresql:'].includes(target.protocol))
		throw new Error('A PostgreSQL target is required.');
	const databaseName = decodeURIComponent(target.pathname.slice(1));
	if (!databaseName || env.TEST_PERFORMANCE_DISPOSABLE_DB !== databaseName)
		throw new Error(
			'TEST_PERFORMANCE_DISPOSABLE_DB must explicitly confirm the target database name.'
		);
	if (!env.TEST_HTTP_PORT || !env.APP_ORIGIN)
		throw new Error('Explicit matching TEST_HTTP_PORT and APP_ORIGIN are required.');
	const origin = httpTestOrigin(env);
	if (env.TEST_PERFORMANCE_KEEP_FIXTURES && env.TEST_PERFORMANCE_KEEP_FIXTURES !== '1')
		throw new Error('TEST_PERFORMANCE_KEEP_FIXTURES accepts only 1 or omission.');
	const repetitions = Number(env.TEST_PERFORMANCE_REPETITIONS ?? 3);
	if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 20)
		throw new Error('TEST_PERFORMANCE_REPETITIONS must be an integer from 1 to 20.');
	const runId = randomUUID();
	const directory = localPath(
		env.TEST_PERFORMANCE_OUTPUT ?? `.local/browsing-performance/${runId}`
	);
	const cleanupManifest = env.TEST_PERFORMANCE_CLEANUP_MANIFEST
		? localPath(env.TEST_PERFORMANCE_CLEANUP_MANIFEST)
		: undefined;
	if (!cleanupManifest && !env.TEST_PERFORMANCE_BUILD_STAMP)
		throw new Error('TEST_PERFORMANCE_BUILD_STAMP must identify the tested build source revision.');
	return {
		database,
		databaseName,
		origin,
		runId,
		directory,
		cleanupManifest,
		repetitions,
		keepFixtures: env.TEST_PERFORMANCE_KEEP_FIXTURES === '1',
		entrypoint: resolve(frontendDirectory, env.TEST_PERFORMANCE_ENTRYPOINT ?? 'build/index.js'),
		buildStamp: env.TEST_PERFORMANCE_BUILD_STAMP
			? resolve(frontendDirectory, env.TEST_PERFORMANCE_BUILD_STAMP)
			: undefined
	};
}

function localPath(path: string) {
	const absolute = resolve(repositoryDirectory, path);
	const inside = relative(localDirectory, absolute);
	if (!inside || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside))
		throw new Error('Performance evidence and credentials must be inside repository .local/.');
	return absolute;
}

export async function writePerformanceJson(path: string, value: unknown, protectedFile = false) {
	localPath(path);
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	const temporary = `${path}.${randomUUID()}.tmp`;
	await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
	await rename(temporary, path);
	await chmod(path, protectedFile ? 0o600 : 0o644);
}

async function fileDigest(path: string) {
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(path)) hash.update(chunk);
	return hash.digest('hex');
}

/** A stamp attributes a build; its separate tree digest identifies the bytes actually executed. */
export async function performanceArtifact(entrypoint: string, stampPath: string) {
	const stamp = await readFile(stampPath, 'utf8');
	const artifactHead = stamp.trim();
	if (!headPattern.test(artifactHead))
		throw new Error('The build stamp must contain exactly one full Git commit SHA.');
	const root = dirname(entrypoint);
	const files: Array<{ path: string; sha256: string }> = [];
	async function visit(directory: string): Promise<void> {
		for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
			a.name.localeCompare(b.name, 'en')
		)) {
			const path = resolve(directory, entry.name);
			if (entry.isSymbolicLink()) throw new Error('Tested build must not contain symbolic links.');
			if (entry.isDirectory()) await visit(path);
			else if (entry.isFile())
				files.push({ path: relative(root, path), sha256: await fileDigest(path) });
		}
	}
	const entrypointSHA256 = await fileDigest(entrypoint);
	await visit(root);
	return {
		artifactHead,
		sourceAttribution: 'Caller-provided build stamp; tree digest identifies tested bytes.',
		sourceDirtyState: 'Unrecorded by commit-only stamp; artifact bytes are hashed independently.',
		stampSHA256: createHash('sha256').update(stamp).digest('hex'),
		entrypoint,
		entrypointSHA256,
		treeSHA256: createHash('sha256').update(JSON.stringify(files)).digest('hex'),
		fileCount: files.length
	};
}

export function performanceRunner() {
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd: repositoryDirectory, encoding: 'utf8' });
	const status = git('status', '--porcelain', '--untracked-files=all');
	const diff = git('diff', 'HEAD', '--binary');
	return {
		head: git('rev-parse', 'HEAD').trim(),
		workspace: repositoryDirectory,
		branch: git('branch', '--show-current').trim(),
		dirty: status.length > 0,
		diffSHA256: createHash('sha256').update(status).update(diff).digest('hex')
	};
}

export interface RecordedPerformancePrinting {
	document: CardDocument;
	search_name: string;
	search_text: string;
	raw_oracle_id: string;
	types: string[] | null;
}
interface BundleManifest {
	bundleVersion: string;
	catalogTransformVersion: number;
	gzipSHA256: string;
	jsonlSHA256: string;
	sourceSHA256: string;
	sourceTimeCaveat: string;
	providerUpdatedAt: null;
	counts: { documents: number };
	canonicalCount: number;
}
interface VerifiedBundle {
	manifest: BundleManifest;
	file: URL;
}
export interface PerformanceBundleSource {
	verifyBundle(): Promise<VerifiedBundle>;
	bundleBatches(bundle: VerifiedBundle): AsyncIterable<RecordedPerformancePrinting[]>;
}

async function nativeBundleSource(): Promise<PerformanceBundleSource> {
	const url = new URL('../../scripts/demo/catalog-bundle.mjs', import.meta.url);
	return import(/* @vite-ignore */ url.href);
}

/** Resolves only after the native generator's final digest/count checks, including its tail. */
export async function consumePerformanceBundle(
	consume: (batch: RecordedPerformancePrinting[]) => Promise<void>,
	source?: PerformanceBundleSource
) {
	source ??= await nativeBundleSource();
	const bundle = await source.verifyBundle();
	const records: ScalePrinting[] = [];
	let documents = 0;
	for await (const batch of source.bundleBatches(bundle)) {
		await consume(batch);
		documents += batch.length;
		for (const { document } of batch) {
			if (records.length === 10000) break;
			const finish = document.is_nonfoil_available
				? 'nonfoil'
				: document.is_foil_available
					? 'foil'
					: null;
			if (finish) records.push({ document, supportedInventoryFinishes: [finish] });
		}
	}
	assert.equal(documents, bundle.manifest.counts.documents);
	assert.equal(records.length, 10000, 'Recorded fixture needs 10,000 supported actual printings.');
	assert.equal(new Set(records.map((record) => record.document.id)).size, 10000);
	return {
		records,
		provenance: { source: 'recordedEnglish', ...bundle.manifest, verifiedDocuments: documents }
	};
}

export interface CatalogState {
	id: number;
	active_generation: string | null;
	previous_generation: string | null;
	updated_at: string;
}
export interface PerformanceManifest {
	format: 'spellbook-browsing-performance-v1';
	runId: string;
	databaseName: string;
	origin: string;
	generationId: string;
	previousState: CatalogState | null;
	accounts: Array<{ accountId: string; username: string; size: number }>;
	cleanup: 'pending' | 'retained' | 'complete' | 'failed';
	cleanupCommand?: string;
	reportFile?: string;
	credentialsFile?: string;
	browser?: Array<{
		size: number;
		entryCount: number;
		copyCount: number;
		canonicalCardCount: number;
		accountId: string;
		groups: Array<{ id: string; name: string }>;
		inventoryURLs: string[];
	}>;
	searchURLs?: string[];
}
const stateSelection =
	'SELECT id,active_generation,previous_generation,updated_at::text AS updated_at FROM catalog_state WHERE id=1';

export async function publishPerformanceCatalog(
	pool: Pool,
	manifest: PerformanceManifest,
	checkpoint: () => Promise<void>
) {
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		await client.query('SELECT pg_advisory_xact_lock($1,$2)', [1936747619, 1]);
		manifest.previousState = (await client.query(stateSelection + ' FOR UPDATE')).rows[0] ?? null;
		await checkpoint();
		await client.query(
			"INSERT INTO catalog_generations(id,source_type,source_updated_at,schema_version) VALUES($1,'test-recorded-browsing-bundle','2026-10-07T00:00:00Z',2)",
			[manifest.generationId]
		);
		const verified = await consumePerformanceBundle(async (batch) => {
			await client.query(
				`INSERT INTO catalog_printings(generation_id,id,oracle_id,name,normalized_name,printed_name,lang,set_code,collector_number,rarity,cmc,colors,card_types,legalities,search_name,search_text,document)
				 SELECT $1,d.id,d.oracle_id,d.name,d.normalized_name,d.printed_name,d.lang,d.set_code,d.collector_number,d.rarity,d.cmc,d.colors,d.card_types,d.legalities,r.search_name,r.search_text,r.document
				 FROM jsonb_to_recordset($2::jsonb) r(document jsonb,search_name text,search_text text)
				 CROSS JOIN LATERAL jsonb_to_record(r.document) d(id uuid,oracle_id uuid,name text,normalized_name text,printed_name text,lang text,set_code text,collector_number text,rarity text,cmc double precision,colors text[],card_types text[],legalities jsonb)`,
				[manifest.generationId, JSON.stringify(batch)]
			);
			await client.query(
				`INSERT INTO catalog_oracle_facts(generation_id,printing_id,raw_oracle_id,types,transform_version)
				 SELECT $1,(r.document->>'id')::uuid,r.raw_oracle_id,r.types,2
				 FROM jsonb_to_recordset($2::jsonb) r(document jsonb,raw_oracle_id uuid,types text[])`,
				[manifest.generationId, JSON.stringify(batch)]
			);
		});
		assert.equal(verified.provenance.verifiedDocuments, 109393);
		const counts = (
			await client.query(
				'SELECT count(*)::int AS documents,count(DISTINCT oracle_id)::int AS canonical FROM catalog_printings WHERE generation_id=$1',
				[manifest.generationId]
			)
		).rows[0];
		assert.equal(counts.documents, verified.provenance.counts.documents);
		assert.equal(counts.canonical, verified.provenance.canonicalCount);
		await client.query(
			'UPDATE catalog_generations SET document_count=$2,source_updated_at=$3,schema_version=$4,published_at=now() WHERE id=$1',
			[
				manifest.generationId,
				counts.documents,
				verified.provenance.bundleVersion,
				verified.provenance.catalogTransformVersion
			]
		);
		await client.query(
			`INSERT INTO catalog_state(id,active_generation) VALUES(1,$1)
			 ON CONFLICT(id) DO UPDATE SET active_generation=excluded.active_generation,updated_at=now()`,
			[manifest.generationId]
		);
		await client.query('COMMIT');
		return verified;
	} catch (cause) {
		await client.query('ROLLBACK');
		throw cause;
	} finally {
		client.release();
	}
}

export async function seedPerformanceGroups(pool: Pool, inventoryId: string, entryIds: string[]) {
	const groups = ['Overlap A', 'Overlap B', 'Empty'].map((name) => ({ id: randomUUID(), name }));
	for (const group of groups)
		await pool.query('INSERT INTO inventory_groups(id,inventory_id,name) VALUES($1,$2,$3)', [
			group.id,
			inventoryId,
			group.name
		]);
	const memberships = entryIds.flatMap((entryId, index) =>
		groups
			.slice(0, 2)
			.flatMap((group, groupIndex) =>
				index % (groupIndex + 2) === 0 ? [{ entryId, groupId: group.id }] : []
			)
	);
	for (let offset = 0; offset < memberships.length; offset += 1000)
		await pool.query(
			`INSERT INTO inventory_group_memberships(entry_id,group_id)
			 SELECT x."entryId"::uuid,x."groupId"::uuid FROM jsonb_to_recordset($1::jsonb) x("entryId" text,"groupId" text)`,
			[JSON.stringify(memberships.slice(offset, offset + 1000))]
		);
	return { groups, memberships };
}

export async function readPerformanceManifest(path: string, databaseName: string, origin: string) {
	const value: PerformanceManifest = JSON.parse(await readFile(localPath(path), 'utf8'));
	assert.equal(value.format, 'spellbook-browsing-performance-v1');
	assert.equal(
		value.databaseName,
		databaseName,
		'Cleanup must use the original disposable database.'
	);
	assert.equal(value.origin, origin, 'Cleanup must use the original origin.');
	assert.match(value.runId, uuid);
	assert.match(value.generationId, uuid);
	assert.ok(['pending', 'retained', 'failed'].includes(value.cleanup));
	for (const account of value.accounts) {
		assert.ok(account.accountId && account.username.startsWith(`perf_${value.runId.slice(0, 8)}_`));
		assert.ok([1000, 10000, 50000].includes(account.size));
	}
	return value;
}

/** Foreign publication is a failure. Never overwrite it or delete any ambient generation. */
export async function cleanupPerformanceFixture(pool: Pool, manifest: PerformanceManifest) {
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		await client.query("SET LOCAL statement_timeout='30s'");
		await client.query('SELECT pg_advisory_xact_lock($1,$2)', [1936747619, 1]);
		const current: CatalogState | null =
			(await client.query(stateSelection + ' FOR UPDATE')).rows[0] ?? null;
		const generation = await client.query(
			'SELECT source_type FROM catalog_generations WHERE id=$1',
			[manifest.generationId]
		);
		if (generation.rows.length) {
			assert.equal(generation.rows[0].source_type, 'test-recorded-browsing-bundle');
			assert.equal(
				current?.active_generation,
				manifest.generationId,
				'Cleanup found a foreign Catalog publication; owned fixtures remain for explicit recovery.'
			);
			await restoreState(client, manifest.previousState);
		} else {
			assert.deepEqual(
				current,
				manifest.previousState,
				'Catalog changed after failed fixture publication.'
			);
		}
		for (const account of manifest.accounts)
			await client.query('DELETE FROM user_profiles WHERE account_id=$1 AND username=$2', [
				account.accountId,
				account.username
			]);
		await client.query('DELETE FROM catalog_generations WHERE id=$1', [manifest.generationId]);
		assert.deepEqual((await client.query(stateSelection)).rows[0] ?? null, manifest.previousState);
		await client.query('COMMIT');
		manifest.cleanup = 'complete';
	} catch (cause) {
		await client.query('ROLLBACK');
		manifest.cleanup = 'failed';
		throw cause;
	} finally {
		client.release();
	}
}

async function restoreState(client: PoolClient, previous: CatalogState | null) {
	if (previous)
		await client.query(
			'UPDATE catalog_state SET active_generation=$1,previous_generation=$2,updated_at=$3 WHERE id=1',
			[previous.active_generation, previous.previous_generation, previous.updated_at]
		);
	else await client.query('DELETE FROM catalog_state WHERE id=1');
}
