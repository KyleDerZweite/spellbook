import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { verifyBundle, bundleBatches } from './catalog-bundle.mjs';

const manifestURL = new URL('./catalog-default-en-20261007.manifest.json', import.meta.url);

test('versioned native English bundle has complete identity, facts and starter coverage in bounded batches', async () => {
	const bundle = await verifyBundle();
	let count = 0;
	let doubleFaces = 0;
	for await (const batch of bundleBatches(bundle)) {
		assert.ok(batch.length > 0 && batch.length <= 500);
		count += batch.length;
		for (const { document: d, raw_oracle_id, types } of batch) {
			assert.equal(d.lang, 'en');
			assert.equal(raw_oracle_id, d.oracle_id);
			assert.deepEqual(types, d.card_types);
			assert.ok(d.image_uri);
			assert.match(d.released_at, /^\d{4}-\d{2}-\d{2}$/);
			if (d.back_face_name) doubleFaces++;
		}
	}
	assert.equal(count, 109393);
	assert.ok(doubleFaces > 0);
	assert.equal(bundle.manifest.canonicalCount, 34948);
	assert.equal(bundle.manifest.providerUpdatedAt, null);
});

test('damaged compressed artifact is rejected before publishing; decoded digest failure is detected after streaming', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'spellbook-demo-catalog-'));
	try {
		const manifest = JSON.parse(await readFile(manifestURL, 'utf8'));
		const localManifest = pathToFileURL(join(directory, 'catalog.manifest.json'));
		const file = join(directory, manifest.file);
		await writeFile(localManifest, JSON.stringify(manifest));
		await writeFile(file, 'not the versioned gzip');
		await assert.rejects(verifyBundle(localManifest), /gzip integrity/);
		await copyFile(new URL(manifest.file, manifestURL), file);
		manifest.jsonlSHA256 = '0'.repeat(64);
		await writeFile(localManifest, JSON.stringify(manifest));
		const bundle = await verifyBundle(localManifest);
		await assert.rejects(async () => {
			for await (const _ of bundleBatches(bundle)) {
				/* Consume through the final integrity check. */
			}
		}, /payload integrity/);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
