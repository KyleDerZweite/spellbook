import { afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import {
	cleanupPerformanceFixture,
	consumePerformanceBundle,
	performanceArtifact,
	performanceConfiguration,
	publishPerformanceCatalog,
	repositoryDirectory,
	writePerformanceJson,
	type PerformanceBundleSource,
	type PerformanceManifest
} from '../fixtures/browsing-performance.ts';
import {
	seedAccountScaleInventory,
	seedAccountScaleInventoryRecords
} from '../fixtures/account-scale.ts';

const directory = resolve(repositoryDirectory, '.local/browsing-performance-unit', randomUUID());
afterAll(async () => {
	await rm(directory, { recursive: true, force: true });
});
const environment = {
	TEST_BROWSING_PERFORMANCE: '1',
	DATABASE_URL: 'postgres://fixture:example@127.0.0.1/performance_test',
	TEST_DATABASE_URL: 'postgres://fixture:example@127.0.0.1/performance_test',
	TEST_PERFORMANCE_DISPOSABLE_DB: 'performance_test',
	TEST_HTTP_PORT: '5999',
	APP_ORIGIN: 'http://127.0.0.1:5999',
	TEST_PERFORMANCE_BUILD_STAMP: '/build/head.txt'
};

describe('portable performance target guards', () => {
	it('requires the additional opt-in even with every other target configured', () => {
		expect(() =>
			performanceConfiguration({ ...environment, TEST_BROWSING_PERFORMANCE: undefined })
		).toThrow(/TEST_BROWSING_PERFORMANCE/);
	});
	it.each([
		{ DATABASE_URL: undefined },
		{ TEST_DATABASE_URL: 'postgres://other/db' },
		{ TEST_PERFORMANCE_DISPOSABLE_DB: undefined },
		{ TEST_PERFORMANCE_DISPOSABLE_DB: 'another_database' },
		{ TEST_HTTP_PORT: undefined },
		{ TEST_HTTP_PORT: '0' },
		{ APP_ORIGIN: undefined },
		{ APP_ORIGIN: 'http://127.0.0.1:6000' },
		{ TEST_PERFORMANCE_BUILD_STAMP: undefined },
		{ TEST_PERFORMANCE_KEEP_FIXTURES: 'true' },
		{ TEST_PERFORMANCE_REPETITIONS: '0' },
		{ TEST_PERFORMANCE_OUTPUT: '/tmp/performance' }
	])('rejects unsafe target or attribution configuration %j', (override) => {
		expect(() => performanceConfiguration({ ...environment, ...override })).toThrow();
	});
	it('accepts explicit origin/database confirmation and a separate parent artifact', () => {
		const config = performanceConfiguration({
			...environment,
			TEST_PERFORMANCE_ENTRYPOINT: '/saved-parent/index.js',
			TEST_PERFORMANCE_KEEP_FIXTURES: '1'
		});
		expect(config).toMatchObject({
			databaseName: 'performance_test',
			origin: environment.APP_ORIGIN,
			entrypoint: '/saved-parent/index.js',
			keepFixtures: true,
			repetitions: 3
		});
	});
});

it('distinguishes stamped source identity from actual artifact bytes and protects credentials', async () => {
	await mkdir(resolve(directory, 'artifact'), { recursive: true });
	const entrypoint = resolve(directory, 'artifact/index.js');
	const stamp = resolve(directory, 'head.txt');
	await writeFile(stamp, '1'.repeat(40) + '\n');
	await writeFile(entrypoint, 'console.log("first");\n');
	const first = await performanceArtifact(entrypoint, stamp);
	await writeFile(entrypoint, 'console.log("second");\n');
	const second = await performanceArtifact(entrypoint, stamp);
	expect(second.artifactHead).toBe(first.artifactHead);
	expect(second.treeSHA256).not.toBe(first.treeSHA256);
	expect(second.entrypointSHA256).not.toBe(first.entrypointSHA256);
	await writeFile(stamp, 'main\n');
	await expect(performanceArtifact(entrypoint, stamp)).rejects.toThrow(/full Git commit/);
	const protectedPath = resolve(directory, 'credentials.json');
	await writePerformanceJson(protectedPath, { password: 'unit fixture only' }, true);
	expect((await stat(protectedPath)).mode & 0o777).toBe(0o600);
	expect(JSON.parse(await readFile(protectedPath, 'utf8'))).toEqual({
		password: 'unit fixture only'
	});
});

// Load the unchanged native verifier once. This uses the tracked public bundle and no database.
const recorded = consumePerformanceBundle(async () => {});
it('fully verifies the recordedEnglish source and chooses genuine deterministic supported finishes', async () => {
	const result = await recorded;
	expect(result.provenance).toMatchObject({
		source: 'recordedEnglish',
		verifiedDocuments: 109393,
		canonicalCount: 34948,
		providerUpdatedAt: null
	});
	expect(result.records).toHaveLength(10000);
	expect(new Set(result.records.map((record) => record.document.id)).size).toBe(10000);
	for (const record of result.records) {
		const finish = record.supportedInventoryFinishes[0];
		expect(
			finish === 'nonfoil'
				? record.document.is_nonfoil_available
				: record.document.is_foil_available
		).toBe(true);
	}
}, 20_000);

it('does not report success if the native stream fails after its last useful batch', async () => {
	const verified = await recorded;
	const source: PerformanceBundleSource = {
		async verifyBundle() {
			return { file: new URL('file:///unused'), manifest: verified.provenance };
		},
		async *bundleBatches() {
			yield verified.records.map(({ document }) => ({
				document,
				search_name: document.name,
				search_text: document.name,
				raw_oracle_id: document.oracle_id,
				types: document.card_types
			}));
			throw new Error('Native tail digest mismatch');
		}
	};
	const consume = vi.fn(async () => {});
	await expect(consumePerformanceBundle(consume, source)).rejects.toThrow(
		'Native tail digest mismatch'
	);
	expect(consume).toHaveBeenCalledTimes(1);
});

it('preserves the old path entrypoint and its 10,000-printing requirement', async () => {
	const verified = await recorded;
	const queries: Array<{ text: string; values: unknown[] }> = [];
	const pool = {
		query: vi.fn(async (text: string, values: unknown[]) => {
			queries.push({ text, values });
		})
	} as unknown as Pool;
	const path = resolve(directory, 'small.jsonl');
	await mkdir(directory, { recursive: true });
	await writeFile(path, JSON.stringify(verified.records[0]) + '\n');
	await expect(seedAccountScaleInventory(pool, 'owned', path, 1000)).rejects.toThrow(
		'10,000 actual printings'
	);
	expect(queries).toHaveLength(0);
	for (const size of [1000, 10000, 50000] as const) {
		queries.length = 0;
		const seeded = await seedAccountScaleInventoryRecords(pool, 'owned', verified.records, size);
		expect(seeded.entries).toHaveLength(size);
		expect(
			new Set(
				seeded.entries.map((entry) => `${entry.catalogCardId}:${entry.finish}:${entry.condition}`)
			).size
		).toBe(size);
		expect(seeded.entries.reduce((sum, entry) => sum + entry.quantity, 0)).toBe(size);
		expect(new Set(seeded.entries.map((entry) => entry.canonicalCardId)).size).toBeLessThan(size);
		expect(queries[0].text).toContain('INSERT INTO inventories');
		expect(
			queries.slice(1).every((query) => JSON.parse(String(query.values[2])).length <= 1000)
		).toBe(true);
	}
});

function manifest(): PerformanceManifest {
	return {
		format: 'spellbook-browsing-performance-v1',
		runId: randomUUID(),
		databaseName: 'performance_test',
		origin: environment.APP_ORIGIN,
		generationId: randomUUID(),
		previousState: {
			id: 1,
			active_generation: randomUUID(),
			previous_generation: randomUUID(),
			updated_at: '2026-10-18 00:00:00+00'
		},
		accounts: [{ accountId: 'owned-account', username: 'owned-username', size: 1000 }],
		cleanup: 'pending'
	};
}
function databaseStub(respond: (text: string, values: unknown[]) => unknown[]) {
	const calls: Array<{ text: string; values: unknown[] }> = [];
	const client = {
		async query(text: string, values: unknown[] = []) {
			calls.push({ text, values });
			return { rows: respond(text, values) };
		},
		release: vi.fn()
	};
	const pool = {
		async connect() {
			return client;
		}
	} as unknown as Pool;
	return { pool, calls };
}

it('rolls back incomplete Catalog publication and never activates the partial stream', async () => {
	const state = manifest();
	const database = databaseStub((text) => {
		if (text.includes('FROM catalog_state')) return [state.previousState];
		if (text.includes('INSERT INTO catalog_printings')) throw new Error('Fixture insert failure');
		return [];
	});
	await expect(publishPerformanceCatalog(database.pool, state, async () => {})).rejects.toThrow(
		'Fixture insert failure'
	);
	expect(database.calls.some((call) => call.text === 'ROLLBACK')).toBe(true);
	expect(database.calls.some((call) => call.text.includes('INSERT INTO catalog_state'))).toBe(
		false
	);
});

it('refuses foreign publication without restoring or deleting any fixture or ambient state', async () => {
	const state = manifest();
	const database = databaseStub((text) => {
		if (text.includes('FROM catalog_state'))
			return [{ ...state.previousState, active_generation: randomUUID() }];
		if (text.includes('SELECT source_type'))
			return [{ source_type: 'test-recorded-browsing-bundle' }];
		return [];
	});
	await expect(cleanupPerformanceFixture(database.pool, state)).rejects.toThrow(
		'foreign Catalog publication'
	);
	expect(state.cleanup).toBe('failed');
	expect(database.calls.some((call) => /^(DELETE|UPDATE)/.test(call.text))).toBe(false);
	expect(database.calls.at(-1)?.text).toBe('ROLLBACK');
});

it('restores the complete prior Catalog state under the native lock and deletes only owned IDs', async () => {
	const state = manifest();
	let restored = false;
	const database = databaseStub((text) => {
		if (text.includes('FROM catalog_state'))
			return [
				restored
					? state.previousState
					: { ...state.previousState, active_generation: state.generationId }
			];
		if (text.includes('SELECT source_type'))
			return [{ source_type: 'test-recorded-browsing-bundle' }];
		if (text.startsWith('UPDATE catalog_state')) restored = true;
		return [];
	});
	await cleanupPerformanceFixture(database.pool, state);
	expect(state.cleanup).toBe('complete');
	expect(
		database.calls.find((call) => call.text.includes('pg_advisory_xact_lock'))?.values
	).toEqual([1936747619, 1]);
	expect(
		database.calls.find((call) => call.text.startsWith('UPDATE catalog_state'))?.values
	).toEqual([
		state.previousState?.active_generation,
		state.previousState?.previous_generation,
		state.previousState?.updated_at
	]);
	expect(database.calls.filter((call) => call.text.startsWith('DELETE'))).toEqual([
		{
			text: 'DELETE FROM user_profiles WHERE account_id=$1 AND username=$2',
			values: ['owned-account', 'owned-username']
		},
		{ text: 'DELETE FROM catalog_generations WHERE id=$1', values: [state.generationId] }
	]);
});
