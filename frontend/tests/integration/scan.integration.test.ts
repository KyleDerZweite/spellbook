import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('Scan repository and uploads', () => {
	let modules: Awaited<ReturnType<typeof loadModules>>;
	let accountId: string;
	let otherAccountId: string;
	beforeAll(async () => {
		modules = await loadModules();
	});
	beforeEach(async () => {
		accountId = `scan-${crypto.randomUUID()}`;
		otherAccountId = `other-${accountId}`;
		await modules.db
			.insert(modules.userProfiles)
			.values([accountId, otherAccountId].map((accountId) => ({ accountId, username: accountId })));
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		await modules.db
			.delete(modules.inventoryMutationRequests)
			.where(inArray(modules.inventoryMutationRequests.accountId, [accountId, otherAccountId]));
		await modules.db
			.delete(modules.userProfiles)
			.where(inArray(modules.userProfiles.accountId, [accountId, otherAccountId]));
	});
	afterAll(async () => {
		await modules?.pool.end();
	});

	it.each(['matched', 'ambiguous', 'no_match', 'failed'])(
		'records %s artifacts with valid session states',
		async (status) => {
			const session = await modules.createScanSession(accountId);
			expect(session.status).toBe('open');
			await modules.recordScanArtifact(accountId, artifact(session.id, status));
			const result = await modules.getScanSessionResult(accountId, session.id);
			expect(result.session?.status).toBe('pending_review');
			expect(result.artifacts[0].status).toBe(status);
		}
	);

	it('rejects review ID collisions across accounts without modifying the original', async () => {
		const first = await setup(accountId);
		const second = await setup(otherAccountId);
		const original = review(first.sessionId, first.id);
		await modules.upsertScanReviewItem(accountId, original);
		await expect(
			modules.upsertScanReviewItem(otherAccountId, {
				...review(second.sessionId, second.id),
				id: original.id
			})
		).rejects.toThrow('another artifact or session');
		const [saved] = await modules.db
			.select()
			.from(modules.scanReviewItems)
			.where(eq(modules.scanReviewItems.id, original.id));
		expect(saved.accountId).toBe(accountId);
		expect(saved.sessionId).toBe(first.sessionId);
	});

	it('rejects artifacts from another session or account', async () => {
		const first = await setup(accountId);
		const second = await setup(accountId);
		const foreign = await setup(otherAccountId);
		await expect(
			modules.upsertScanReviewItem(accountId, review(first.sessionId, second.id))
		).rejects.toThrow('not found in this session');
		await expect(
			modules.upsertScanReviewItem(accountId, review(first.sessionId, foreign.id))
		).rejects.toThrow('not found in this session');
	});

	it('rolls back all review writes when one item is invalid', async () => {
		const scan = await setup(accountId);
		const valid = review(scan.sessionId, scan.id);
		await expect(
			modules.commitScanReview(accountId, crypto.randomUUID(), scan.sessionId, [
				valid,
				{ ...valid, id: crypto.randomUUID(), scanArtifactId: crypto.randomUUID() }
			])
		).rejects.toThrow();
		const result = await modules.getScanSessionResult(accountId, scan.sessionId);
		expect(result.reviewItems).toHaveLength(0);
		expect(result.session?.status).toBe('pending_review');
		expect((await modules.getInventorySnapshot(accountId)).cards).toHaveLength(0);
	});

	it('commits review and inventory once during simultaneous retries', async () => {
		const scan = await setup(accountId);
		const requestId = crypto.randomUUID();
		await Promise.all(
			Array.from({ length: 5 }, () =>
				modules.commitScanReview(accountId, requestId, scan.sessionId, [
					review(scan.sessionId, scan.id)
				])
			)
		);
		const result = await modules.getScanSessionResult(accountId, scan.sessionId);
		expect(result.session?.status).toBe('committed');
		expect(result.reviewItems).toHaveLength(1);
		expect((await modules.getInventorySnapshot(accountId)).cards[0].quantity).toBe(2);
		await expect(
			modules.commitScanReview(accountId, crypto.randomUUID(), scan.sessionId, [
				review(scan.sessionId, scan.id)
			])
		).rejects.toThrow('not open for review');
	});

	it('rejects changed review payloads and cross-session request ID reuse', async () => {
		const first = await setup(accountId);
		const second = await setup(accountId);
		const requestId = crypto.randomUUID();
		const firstItem = review(first.sessionId, first.id);
		await modules.commitScanReview(accountId, requestId, first.sessionId, [firstItem]);
		await expect(
			modules.commitScanReview(accountId, requestId, first.sessionId, [
				{ ...firstItem, quantity: 3 }
			])
		).rejects.toThrow('different mutation');
		await expect(
			modules.commitScanReview(accountId, requestId, second.sessionId, [
				review(second.sessionId, second.id)
			])
		).rejects.toThrow('different mutation');
		expect((await modules.getInventorySnapshot(accountId)).cards[0].quantity).toBe(2);
		expect((await modules.getScanSessionResult(accountId, second.sessionId)).session?.status).toBe(
			'pending_review'
		);
	});

	it('commits a validated HTTP review request', async () => {
		const scan = await setup(accountId);
		const item = review(scan.sessionId, scan.id);
		const event = {
			url: new URL('http://localhost/scan'),
			locals: { user: { accountId } },
			request: new Request('http://localhost/scan', {
				method: 'POST',
				headers: { origin: 'http://localhost', 'content-type': 'application/json' },
				body: JSON.stringify({
					requestId: crypto.randomUUID(),
					sessionId: scan.sessionId,
					items: [{ id: item.id, scanArtifactId: scan.id, quantity: 2, selectedCandidate: item }]
				})
			})
		} as Parameters<typeof modules.commitReview>[0];
		const response = await modules.commitReview(event);
		expect(response?.status).toBe(200);
		expect((await modules.getInventorySnapshot(accountId)).cards[0].quantity).toBe(2);
	});

	it('rejects foreign, nonexistent, and closed sessions before reading upload bodies', async () => {
		const foreign = await modules.createScanSession(otherAccountId);
		const closed = await modules.createScanSession(accountId);
		await modules.updateScanSessionStatus(accountId, closed.id, 'cancelled');
		const upload = vi.spyOn(modules.storage, 'uploadScanObject').mockResolvedValue('unused');
		const process = vi.spyOn(modules.worker, 'processScanArtifact');
		for (const [id, status] of [
			[foreign.id, 404],
			[crypto.randomUUID(), 404],
			[closed.id, 409]
		] as const) {
			const event = uploadEvent(id, new File(['image'], 'test.png', { type: 'image/png' }));
			const readBody = vi.spyOn(event.request.body!, 'getReader');
			await expect(modules.uploadFrame(event)).rejects.toMatchObject({ status });
			expect(readBody).not.toHaveBeenCalled();
		}
		expect(upload).not.toHaveBeenCalled();
		expect(process).not.toHaveBeenCalled();
	});

	it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s uploads', async (contentType) => {
		const session = await modules.createScanSession(accountId);
		const upload = vi.spyOn(modules.storage, 'uploadScanObject').mockResolvedValue('uploaded');
		vi.spyOn(modules.worker, 'processScanArtifact').mockResolvedValue({
			status: 'no_match',
			normalizedObjectKey: 'uploaded',
			qualityScore: 0,
			embeddingModelVersion: 'stub',
			ocrModelVersion: 'stub',
			ocrTokens: {},
			candidates: []
		});
		const response = await modules.uploadFrame(
			uploadEvent(
				session.id,
				new File([imageBytes(contentType)], 'test.image', { type: contentType })
			)
		);
		expect(response?.status).toBe(200);
		expect(upload.mock.calls[0][2]).toBe(contentType);
	});

	it('rejects fake image bytes and malformed upload forms before storage', async () => {
		const session = await modules.createScanSession(accountId);
		const upload = vi.spyOn(modules.storage, 'uploadScanObject');
		await expect(
			modules.uploadFrame(
				uploadEvent(session.id, new File(['not an image'], 'fake.png', { type: 'image/png' }))
			)
		).rejects.toMatchObject({ status: 415 });
		for (const [contentType, status] of [
			['application/json', 415],
			['multipart/form-data; boundary=broken', 400]
		] as const) {
			const event = uploadEvent(
				session.id,
				new File(['ignored'], 'fake.png', { type: 'image/png' })
			);
			event.request = new Request('http://localhost/scan', {
				method: 'POST',
				headers: { origin: 'http://localhost', 'content-type': contentType },
				body: 'broken'
			});
			await expect(modules.uploadFrame(event)).rejects.toMatchObject({ status });
		}
		expect(upload).not.toHaveBeenCalled();
		expect((await modules.getScanSessionResult(accountId, session.id)).artifacts).toHaveLength(0);
	});

	it('rejects nested scalar objects, invalid scores, quantities, and oversized review batches with 400', async () => {
		const scan = await setup(accountId);
		const candidate = review(scan.sessionId, scan.id);
		const item = { scanArtifactId: scan.id, selectedCandidate: candidate, quantity: 2 };
		const valid = { requestId: crypto.randomUUID(), sessionId: scan.sessionId, items: [item] };
		const bodies = [
			{ ...valid, requestId: { toString: null } },
			{ ...valid, items: [{ ...item, quantity: { valueOf: null } }] },
			{ ...valid, items: [{ ...item, quantity: '2' }] },
			{ ...valid, items: [{ ...item, quantity: 1.5 }] },
			{ ...valid, items: [{ ...item, finish: {} }] },
			{ ...valid, items: [{ ...item, condition: ['NM'] }] },
			{ ...valid, items: [{ ...item, selectedCandidate: { ...candidate, catalogCardId: 42 } }] },
			{
				...valid,
				items: [{ ...item, selectedCandidate: { ...candidate, name: { toString: null } } }]
			},
			{ ...valid, items: [{ ...item, selectedCandidate: { ...candidate, imageUri: {} } }] },
			{ ...valid, items: [{ ...item, selectedCandidate: { ...candidate, matchReason: {} } }] },
			{ ...valid, items: [{ ...item, selectedCandidate: { ...candidate, finalScore: 101 } }] },
			{ ...valid, items: [{ ...item, selectedCandidate: { ...candidate, finalScore: -1 } }] },
			{ ...valid, items: [{ ...item, selectedCandidate: { ...candidate, finalScore: 0.5 } }] },
			{ ...valid, items: [{ ...item, selectedCandidate: { ...candidate, ocrScore: '20' } }] },
			{ ...valid, items: Array.from({ length: 101 }, () => item) }
		];
		for (const body of bodies) {
			const event = {
				url: new URL('http://localhost/scan'),
				locals: { user: { accountId } },
				request: new Request('http://localhost/scan', {
					method: 'POST',
					headers: { origin: 'http://localhost', 'content-type': 'application/json' },
					body: JSON.stringify(body)
				})
			} as Parameters<typeof modules.commitReview>[0];
			await expect(modules.commitReview(event)).rejects.toMatchObject({ status: 400 });
		}
		expect(
			(await modules.getScanSessionResult(accountId, scan.sessionId)).reviewItems
		).toHaveLength(0);
		expect((await modules.getInventorySnapshot(accountId)).cards).toHaveLength(0);
	});

	it('returns 400 for malformed review JSON and invalid result session UUID', async () => {
		const event = {
			url: new URL('http://localhost/scan'),
			locals: { user: { accountId } },
			request: new Request('http://localhost/scan', {
				method: 'POST',
				headers: { origin: 'http://localhost', 'content-type': 'application/json' },
				body: '{'
			})
		} as Parameters<typeof modules.commitReview>[0];
		await expect(modules.commitReview(event)).rejects.toMatchObject({ status: 400 });
		await expect(
			modules.sessionResult({
				...event,
				params: { sessionId: 'not-a-uuid' },
				request: new Request('http://localhost/scan')
			} as unknown as Parameters<typeof modules.sessionResult>[0])
		).rejects.toMatchObject({ status: 400 });
	});

	it('cleans up failed worker uploads and permits a retry without exposing the worker error', async () => {
		const session = await modules.createScanSession(accountId);
		const upload = vi.spyOn(modules.storage, 'uploadScanObject');
		const worker = vi
			.spyOn(modules.worker, 'processScanArtifact')
			.mockRejectedValue(new Error('secret upstream details'));
		const file = new File([imageBytes('image/png')], 'test.png', {
			type: 'image/png'
		});
		await expect(modules.uploadFrame(uploadEvent(session.id, file))).rejects.toMatchObject({
			status: 502,
			body: { message: 'Scan processing failed. Retry the upload.' }
		});
		await expect(modules.storage.readScanImage(upload.mock.calls[0][0])).rejects.toMatchObject({
			status: 404
		});
		const pending = await modules.getScanSessionResult(accountId, session.id);
		expect(pending.session?.status).toBe('open');
		expect(pending.artifacts).toHaveLength(0);
		worker.mockResolvedValue({
			status: 'no_match',
			normalizedObjectKey: 'original',
			qualityScore: 0,
			embeddingModelVersion: 'stub',
			ocrModelVersion: 'stub',
			ocrTokens: {},
			candidates: []
		});
		expect((await modules.uploadFrame(uploadEvent(session.id, file)))?.status).toBe(200);
		await modules.storage.deleteScanObject(upload.mock.calls[1][0]);
	});

	it('rejects unsupported files before storage and worker calls', async () => {
		const session = await modules.createScanSession(accountId);
		const upload = vi.spyOn(modules.storage, 'uploadScanObject');
		const process = vi.spyOn(modules.worker, 'processScanArtifact');
		await expect(
			modules.uploadFrame(
				uploadEvent(session.id, new File(['text'], 'test.txt', { type: 'text/plain' }))
			)
		).rejects.toMatchObject({ status: 415 });
		expect(upload).not.toHaveBeenCalled();
		expect(process).not.toHaveBeenCalled();
	});

	async function setup(owner: string) {
		const session = await modules.createScanSession(owner);
		return modules.recordScanArtifact(owner, artifact(session.id));
	}

	function uploadEvent(sessionId: string, file: File) {
		const form = new FormData();
		form.append('file', file);
		return {
			url: new URL('http://localhost/scan'),
			params: { sessionId },
			locals: { user: { accountId } },
			request: new Request('http://localhost/scan', {
				method: 'POST',
				headers: { origin: 'http://localhost' },
				body: form
			})
		} as Parameters<typeof modules.uploadFrame>[0];
	}
});

function imageBytes(contentType: string): Uint8Array<ArrayBuffer> {
	if (contentType === 'image/jpeg') return Uint8Array.from([255, 216, 255, 217]);
	if (contentType === 'image/webp') return new TextEncoder().encode('RIFF0000WEBP');
	return new Uint8Array(
		Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf9sAAAAASUVORK5CYII=',
			'base64'
		)
	);
}

function artifact(sessionId: string, status = 'no_match') {
	return {
		artifactId: crypto.randomUUID(),
		sessionId,
		status,
		originalObjectKey: 'original',
		normalizedObjectKey: 'original',
		qualityScore: 0,
		embeddingModelVersion: 'stub',
		ocrModelVersion: 'stub',
		candidateJson: []
	};
}

function review(sessionId: string, scanArtifactId: string) {
	return {
		id: crypto.randomUUID(),
		sessionId,
		scanArtifactId,
		catalogCardId: 'card',
		canonicalCardId: 'oracle',
		oracleId: 'oracle',
		name: 'Card',
		setCode: 'tst',
		collectorNumber: '1',
		imageUri: '',
		similarityScore: 0,
		ocrScore: 0,
		finalScore: 0,
		matchReason: 'manual',
		finish: 'nonfoil',
		condition: 'NM',
		quantity: 2
	};
}

async function loadModules() {
	const [client, schema, scan, inventory, storage, worker, route, commitRoute, resultRoute] =
		await Promise.all([
			import('../../src/lib/server/db/client'),
			import('../../src/lib/server/db/schema'),
			import('../../src/lib/server/data/scan'),
			import('../../src/lib/server/data/inventory'),
			import('../../src/lib/server/mobile/storage'),
			import('../../src/lib/server/mobile/scan-worker'),
			import('../../src/routes/api/mobile/v1/mtg/scan/sessions/[sessionId]/frames/+server'),
			import('../../src/routes/api/mobile/v1/mtg/scan/review/commit/+server'),
			import('../../src/routes/api/mobile/v1/mtg/scan/sessions/[sessionId]/result/+server')
		]);
	return {
		...client,
		...schema,
		...scan,
		...inventory,
		storage,
		worker,
		uploadFrame: route.POST,
		commitReview: commitRoute.POST,
		sessionResult: resultRoute.GET
	};
}
