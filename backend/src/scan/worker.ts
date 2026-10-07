import type { CatalogApplication } from '@spellbook/contracts/catalog.ts';
import type { ScanCandidate, ScanStatus } from '@spellbook/contracts/scan.ts';
import { assertUuid, ValidationError } from '../mtg/validation.ts';
import { record, text, score, status } from './validation.ts';
export interface WorkerResult {
	status: ScanStatus;
	normalizedObjectKey: string;
	qualityScore: number;
	embeddingModelVersion: string;
	ocrModelVersion: string;
	ocrTokens: { name?: string; setCode?: string; collectorNumber?: string };
	candidates: ScanCandidate[];
}
export async function processScanArtifact(
	baseUrl: string,
	catalog: CatalogApplication,
	input: {
		sessionId: string;
		artifactId: string;
		originalObjectKey: string;
		contentType: string;
		fileName: string;
	},
	signal?: AbortSignal
): Promise<WorkerResult> {
	const requestSignal = signal
		? AbortSignal.any([signal, AbortSignal.timeout(30000)])
		: AbortSignal.timeout(30000);
	const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/scan/process`, {
		method: 'POST',
		signal: requestSignal,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input)
	});
	if (!response.ok || !response.body) throw new Error('Scan processing failed');
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const chunk = await reader.read();
			if (chunk.done) break;
			size += chunk.value.byteLength;
			if (size > 1024 * 1024) throw new Error('Scan processing failed');
			chunks.push(chunk.value);
		}
	} finally {
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
	const raw = record(
		JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size)))
	);
	if (raw.normalizedObjectKey !== input.originalObjectKey)
		throw new ValidationError('Invalid worker image identity');
	const tokens = record(raw.ocrTokens);
	if (Object.keys(tokens).length > 100) throw new ValidationError('Too many OCR tokens');
	for (const [key, value] of Object.entries(tokens))
		if (
			key.length > 32 ||
			!['name', 'setCode', 'collectorNumber'].includes(key) ||
			typeof value !== 'string' ||
			value.length > 5000
		)
			throw new ValidationError('Invalid OCR tokens');
	if (!Array.isArray(raw.candidates) || raw.candidates.length > 20)
		throw new ValidationError('Invalid worker candidates');
	const seen = new Set<string>();
	const candidates: ScanCandidate[] = [];
	for (const value of raw.candidates) {
		const c = record(value);
		const id = assertUuid(c.catalogCardId, 'catalogCardId');
		if (seen.has(id)) throw new ValidationError('Duplicate worker candidate');
		seen.add(id);
		const scores = {
			similarityScore: score(c.similarityScore),
			ocrScore: score(c.ocrScore),
			finalScore: score(c.finalScore)
		};
		const canonicalId = assertUuid(c.canonicalCardId, 'canonicalCardId');
		const oracleId = assertUuid(c.oracleId, 'oracleId');
		const card = await catalog.getCatalogPrinting(id);
		assertUuid(card.oracle_id, 'oracleId');
		if (canonicalId !== card.oracle_id.toLowerCase() || oracleId !== canonicalId)
			throw new ValidationError('Worker candidate identity does not match Catalog');
		if (card.id.toLowerCase() !== id || !card.name || !card.set_code || !card.collector_number)
			throw new ValidationError('Catalog printing is incomplete');
		candidates.push({
			catalogCardId: card.id,
			canonicalCardId: card.oracle_id,
			oracleId: card.oracle_id,
			name: card.name,
			setCode: card.set_code,
			collectorNumber: card.collector_number,
			imageUri: card.image_uri,
			...scores,
			matchReason: text(c.matchReason, 'matchReason', 500, true)
		});
	}
	return {
		status: status(raw.status, candidates.length),
		normalizedObjectKey: input.originalObjectKey,
		qualityScore: score(raw.qualityScore),
		embeddingModelVersion: text(raw.embeddingModelVersion, 'embeddingModelVersion', 128),
		ocrModelVersion: text(raw.ocrModelVersion, 'ocrModelVersion', 128),
		ocrTokens: {
			...(tokens.name === undefined ? {} : { name: tokens.name as string }),
			...(tokens.setCode === undefined ? {} : { setCode: tokens.setCode as string }),
			...(tokens.collectorNumber === undefined
				? {}
				: { collectorNumber: tokens.collectorNumber as string })
		},
		candidates
	};
}
