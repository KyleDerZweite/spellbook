import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { StringDecoder } from 'node:string_decoder';

const manifestURL = new URL('./catalog-default-en-20261007.manifest.json', import.meta.url);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const digest = /^[0-9a-f]{64}$/;

export async function verifyBundle(url = manifestURL) {
	const manifest = JSON.parse(await readFile(url, 'utf8'));
	if (
		manifest.formatVersion !== 1 ||
		manifest.sourceType !== 'demo-bundle' ||
		manifest.providerUpdatedAt !== null ||
		!uuid.test(manifest.generationId) ||
		manifest.catalogTransformVersion !== 2 ||
		!/^catalog-default-en-\d{8}\.jsonl\.gz$/.test(manifest.file) ||
		!digest.test(manifest.gzipSHA256) ||
		!digest.test(manifest.jsonlSHA256) ||
		!Number.isSafeInteger(manifest.counts?.documents) ||
		manifest.counts.documents < 1 ||
		!Number.isSafeInteger(manifest.canonicalCount) ||
		manifest.canonicalCount < 1 ||
		!Number.isFinite(Date.parse(manifest.bundleVersion))
	)
		throw new Error('Invalid Demo Catalog manifest.');
	const file = new URL(manifest.file, url);
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(file)) hash.update(chunk);
	if ((await stat(file)).size !== manifest.gzipBytes || hash.digest('hex') !== manifest.gzipSHA256)
		throw new Error('Demo Catalog gzip integrity check failed.');
	return { manifest, file };
}

// Never retain the full document payload: the consumer publishes 500 records per batch.
export async function* bundleBatches({ manifest, file }) {
	const source = createReadStream(file);
	const unzip = createGunzip();
	source.on('error', (error) => unzip.destroy(error));
	const stream = source.pipe(unzip);
	const hash = createHash('sha256');
	let bytes = 0;
	const decoder = new StringDecoder('utf8');
	let pending = '';
	async function* lines() {
		for await (const chunk of stream) {
			hash.update(chunk);
			bytes += chunk.length;
			pending += decoder.write(chunk);
			let end;
			while ((end = pending.indexOf('\n')) !== -1) {
				const line = pending.slice(0, end);
				pending = pending.slice(end + 1);
				yield line;
			}
		}
		pending += decoder.end();
		if (pending) throw new Error('Demo Catalog payload must end with LF.');
	}
	const ids = new Set();
	const oracles = new Set();
	let batch = [];
	try {
		for await (const line of lines()) {
			const record = JSON.parse(line);
			const d = record.document;
			if (
				!d ||
				!uuid.test(d.id) ||
				!uuid.test(d.oracle_id) ||
				d.lang !== 'en' ||
				!Number.isFinite(d.cmc) ||
				typeof d.cmc !== 'number' ||
				ids.has(d.id) ||
				record.raw_oracle_id !== d.oracle_id ||
				typeof record.search_name !== 'string' ||
				typeof record.search_text !== 'string' ||
				!(record.types === null || Array.isArray(record.types))
			)
				throw new Error('Invalid Demo Catalog printing.');
			ids.add(d.id);
			oracles.add(d.oracle_id);
			batch.push(record);
			if (batch.length === 500) {
				yield batch;
				batch = [];
			}
		}
		if (batch.length) yield batch;
		const starters = JSON.parse(await readFile(new URL('./cards.json', import.meta.url), 'utf8'));
		if (
			ids.size !== manifest.counts.documents ||
			oracles.size !== manifest.canonicalCount ||
			bytes !== manifest.jsonlBytes ||
			hash.digest('hex') !== manifest.jsonlSHA256 ||
			starters.length !== manifest.starterPrintingCount ||
			starters.some((card) => !ids.has(card.id))
		)
			throw new Error('Demo Catalog payload integrity check failed.');
	} finally {
		stream.destroy();
		source.destroy();
	}
}
