import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { processScanArtifact } from '@spellbook/backend/scan/worker.ts';
import { createCatalog, createDatabase } from '@spellbook/backend';

// Fault responses at the external HTTP boundary test rejection only. The actual Python worker is exercised by integration/HTTP journeys.
describe('bounded external Scan-worker failures', () => {
	const db = createDatabase(
		process.env.TEST_DATABASE_URL ?? 'postgres://unused:unused@localhost:1/unused'
	);
	const catalog = createCatalog(db.pool);
	const input = {
		sessionId: '11111111-1111-4111-8111-111111111111',
		artifactId: '22222222-2222-4222-8222-222222222222',
		originalObjectKey:
			'scan-sessions/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png',
		contentType: 'image/png',
		fileName: 'photo.png'
	};
	const valid = {
		status: 'no_match',
		normalizedObjectKey: input.originalObjectKey,
		qualityScore: 0,
		embeddingModelVersion: 'stub-v1',
		ocrModelVersion: 'stub-v1',
		ocrTokens: {},
		candidates: []
	};
	let responseBody: unknown = valid;
	let raw: string | Uint8Array | undefined;
	let code = 200;
	let stalled = false;
	const server = createServer((request, response) => {
		request.resume();
		if (stalled) return;
		response.writeHead(code, { 'content-type': 'application/json' });
		response.end(raw ?? JSON.stringify(responseBody));
	});
	let origin = '';
	beforeAll(async () => {
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
		origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});
	afterAll(async () => {
		await new Promise<void>((resolve) => server.close(() => resolve()));
		await db.pool.end();
	});
	it.each([
		{
			normalizedObjectKey:
				'scan-sessions/11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.png'
		},
		{ qualityScore: 2147483648 },
		{ qualityScore: -1 },
		{ qualityScore: 0.5 },
		{ qualityScore: '0' },
		{ embeddingModelVersion: 'x'.repeat(129) },
		{ ocrModelVersion: '' },
		{ ocrTokens: { privateAccount: 'must-not-persist' } },
		{ ocrTokens: { name: 'x'.repeat(5001) } },
		{ ocrTokens: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`token${i}`, 'x'])) },
		{ ocrTokens: { ['x'.repeat(33)]: 'x' } },
		{ status: 'matched' },
		{ status: 'ambiguous' },
		{ status: 'unsupported' },
		{ candidates: Array.from({ length: 21 }, () => ({})) }
	])('rejects malformed or unauthorized worker evidence %#', async (patch) => {
		responseBody = { ...valid, ...patch };
		raw = undefined;
		code = 200;
		await expect(processScanArtifact(origin, catalog, input)).rejects.toThrow();
	});
	it('rejects streamed worker JSON beyond 1 MiB, invalid UTF-8/JSON and failed status', async () => {
		for (const body of ['x'.repeat(1024 * 1024 + 1), 'not JSON', Uint8Array.from([0xff])]) {
			raw = body;
			code = 200;
			await expect(processScanArtifact(origin, catalog, input)).rejects.toThrow();
		}
		raw = undefined;
		responseBody = valid;
		code = 503;
		await expect(processScanArtifact(origin, catalog, input)).rejects.toThrow();
	});
	it('aborts an actual stalled worker HTTP response at the production 30-second deadline', async () => {
		stalled = true;
		const start = performance.now();
		try {
			await expect(processScanArtifact(origin, catalog, input)).rejects.toThrow();
			expect(performance.now() - start).toBeGreaterThanOrEqual(29000);
			expect(performance.now() - start).toBeLessThan(34000);
		} finally {
			stalled = false;
		}
	}, 35000);
});
