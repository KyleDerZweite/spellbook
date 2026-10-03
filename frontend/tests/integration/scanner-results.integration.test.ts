import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inArray } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import type { CardDocument } from '../../src/lib/search/types';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('External scanner results and owned images', () => {
	let m: Awaited<ReturnType<typeof loadModules>>;
	let owner: string;
	let foreign: string;
	let sessions: string[];
	const printingId = '00000000-0000-4000-8000-000000000001';
	beforeAll(async () => {
		m = await loadModules();
	});
	beforeEach(async () => {
		owner = `scanner-${crypto.randomUUID()}`;
		foreign = `foreign-${owner}`;
		sessions = [];
		await m.db
			.insert(m.userProfiles)
			.values([owner, foreign].map((accountId) => ({ accountId, username: accountId })));
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		await m.db
			.delete(m.inventoryMutationRequests)
			.where(inArray(m.inventoryMutationRequests.accountId, [owner, foreign]));
		await m.db.delete(m.userProfiles).where(inArray(m.userProfiles.accountId, [owner, foreign]));
		await Promise.all(
			sessions.map((id) =>
				rm(`/tmp/spellbook-test-scans/scan-sessions/${id}`, { recursive: true, force: true })
			)
		);
	});
	afterAll(async () => {
		await m?.pool.end();
	});

	it('replaces one result safely on duplicate bearer requests without inventory writes', async () => {
		const artifact = await setup(owner);
		const token = randomBytes(32).toString('base64url');
		await m.db.insert(m.authSessions).values({
			accountId: owner,
			tokenHash: createHash('sha256').update(token).digest('hex'),
			expiresAt: new Date(Date.now() + 60_000)
		});
		vi.spyOn(m.catalog, 'getCatalogPrinting').mockResolvedValue(card());
		const input = {
			status: 'matched',
			modelVersion: 'robot-v1',
			candidates: [
				{ catalogCardId: printingId, confidence: 0.976, notes: 'OCR match', name: 'Untrusted name' }
			]
		};
		for (let retry = 0; retry < 2; retry++) {
			const event = resultEvent(artifact.sessionId, artifact.id, input, null);
			event.request.headers.set('authorization', `Bearer ${token}`);
			const response = await m.resultPost(event);
			expect(response?.status).toBe(200);
		}
		const result = await m.getScanSessionResult(owner, artifact.sessionId);
		expect(result.artifacts).toHaveLength(1);
		expect(result.reviewItems).toHaveLength(0);
		expect(result.lastResult?.candidates[0]).toMatchObject({
			name: 'Trusted card',
			confidence: 0.976,
			finalScore: 98,
			canonicalCardId: card().oracle_id
		});
		expect((await m.getInventorySnapshot(owner)).cards).toHaveLength(0);
	});

	it('rejects foreign and mismatched artifacts before catalog lookup', async () => {
		const own = await setup(owner);
		const other = await setup(foreign);
		const lookup = vi.spyOn(m.catalog, 'getCatalogPrinting');
		for (const [sessionId, artifactId] of [
			[other.sessionId, other.id],
			[own.sessionId, other.id],
			[other.sessionId, own.id]
		]) {
			await expect(
				m.resultPost(resultEvent(sessionId, artifactId, matched()))
			).rejects.toMatchObject({ status: 404 });
		}
		expect(lookup).not.toHaveBeenCalled();
	});

	it('rejects missing authentication', async () => {
		const artifact = await setup(owner);
		await expect(
			m.resultPost(resultEvent(artifact.sessionId, artifact.id, matched(), null))
		).rejects.toMatchObject({ status: 401 });
	});

	it.each(['committed', 'cancelled'])(
		'rejects result changes after session is %s',
		async (status) => {
			const artifact = await setup(owner);
			await m.updateScanSessionStatus(owner, artifact.sessionId, status);
			await expect(
				m.resultPost(resultEvent(artifact.sessionId, artifact.id, matched()))
			).rejects.toMatchObject({ status: 409 });
			expect((await m.getScanSessionResult(owner, artifact.sessionId)).artifacts[0].status).toBe(
				'no_match'
			);
		}
	);

	it('rejects out-of-range confidence, too many candidates, and long notes', async () => {
		const artifact = await setup(owner);
		const bad = [
			{ ...matched(), candidates: [{ catalogCardId: printingId, confidence: 1.1 }] },
			{ ...matched(), candidates: [{ catalogCardId: printingId, confidence: -0.1 }] },
			{ ...matched(), candidates: [{ catalogCardId: printingId, confidence: '0.5' }] },
			{
				...matched(),
				candidates: Array.from({ length: 21 }, () => ({
					catalogCardId: printingId,
					confidence: 0.5
				}))
			},
			{
				...matched(),
				candidates: [{ catalogCardId: printingId, confidence: 0.5, notes: 'x'.repeat(501) }]
			}
		];
		for (const input of bad)
			await expect(
				m.resultPost(resultEvent(artifact.sessionId, artifact.id, input))
			).rejects.toMatchObject({ status: 400 });
		await expect(
			m.submitScanResult(owner, artifact.sessionId, artifact.id, {
				...matched(),
				candidates: [{ catalogCardId: printingId, confidence: NaN }]
			})
		).rejects.toThrow('confidence');
	});

	it('lists only owned sessions and streams only owned image bytes without caching', async () => {
		const artifact = await setup(owner);
		const other = await setup(foreign);
		const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
		await m.storage.uploadScanObject(artifact.originalObjectKey, png, 'image/png');
		const response = await m.imageGet(getEvent(artifact.id));
		expect(response.headers.get('content-type')).toBe('image/png');
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
		await expect(m.imageGet(getEvent(other.id))).rejects.toMatchObject({ status: 404 });
		const list = await m.sessionsGet({
			...getEvent(artifact.id),
			route: { id: '/api/mobile/v1/mtg/scan/sessions' },
			params: {}
		} as Parameters<typeof m.sessionsGet>[0]);
		const body = await list.json();
		expect(body.sessions.map((session: { id: string }) => session.id)).toEqual([
			artifact.sessionId
		]);
	});

	it('rejects oversized, unsafe, and unsupported stored image content', async () => {
		const artifact = await setup(owner);
		await m.storage.uploadScanObject(
			artifact.originalObjectKey,
			new Uint8Array(10 * 1024 * 1024 + 1),
			'image/png'
		);
		await expect(m.imageGet(getEvent(artifact.id))).rejects.toMatchObject({ status: 413 });
		await m.storage.uploadScanObject(
			artifact.originalObjectKey,
			new TextEncoder().encode('<script>bad</script>'),
			'image/png'
		);
		await expect(m.imageGet(getEvent(artifact.id))).rejects.toMatchObject({ status: 415 });
		await expect(m.storage.readScanImage('../secret')).rejects.toMatchObject({ status: 404 });
	});

	async function setup(accountId: string) {
		const session = await m.createScanSession(accountId);
		sessions.push(session.id);
		const artifactId = crypto.randomUUID();
		const key = `scan-sessions/${session.id}/${artifactId}.png`;
		return m.recordScanArtifact(accountId, {
			sessionId: session.id,
			artifactId,
			originalObjectKey: key,
			normalizedObjectKey: key,
			qualityScore: 0,
			embeddingModelVersion: 'stub',
			ocrModelVersion: 'stub',
			status: 'no_match',
			candidateJson: []
		});
	}
	function matched() {
		return {
			status: 'matched',
			modelVersion: 'robot-v1',
			candidates: [{ catalogCardId: printingId, confidence: 0.9 }]
		};
	}
	function resultEvent(
		sessionId: string,
		artifactId: string,
		body: unknown,
		accountId: string | null = owner
	) {
		return {
			url: new URL('http://localhost/scan'),
			params: { sessionId, artifactId },
			locals: { user: accountId ? { accountId } : null },
			request: new Request('http://localhost/scan', {
				method: 'POST',
				headers: { origin: 'http://localhost', 'content-type': 'application/json' },
				body: JSON.stringify(body)
			})
		} as Parameters<typeof m.resultPost>[0];
	}
	function getEvent(artifactId: string) {
		return {
			url: new URL('http://localhost/scan'),
			params: { artifactId },
			locals: { user: { accountId: owner } },
			request: new Request('http://localhost/scan')
		} as Parameters<typeof m.imageGet>[0];
	}
	function card() {
		return {
			id: printingId,
			oracle_id: '00000000-0000-4000-8000-000000000002',
			name: 'Trusted card',
			set_code: 'tst',
			collector_number: '1',
			image_uri: 'https://example.test/card.jpg'
		} as CardDocument;
	}
});

async function loadModules() {
	const [
		client,
		schema,
		scan,
		inventory,
		catalog,
		storage,
		resultRoute,
		imageRoute,
		sessionsRoute
	] = await Promise.all([
		import('../../src/lib/server/db/client'),
		import('../../src/lib/server/db/schema'),
		import('../../src/lib/server/data/scan'),
		import('../../src/lib/server/data/inventory'),
		import('../../src/lib/server/catalog/search'),
		import('../../src/lib/server/mobile/storage'),
		import('../../src/routes/api/mobile/v1/mtg/scan/sessions/[sessionId]/artifacts/[artifactId]/result/+server'),
		import('../../src/routes/api/mobile/v1/mtg/scan/artifacts/[artifactId]/image/+server'),
		import('../../src/routes/api/mobile/v1/mtg/scan/sessions/+server')
	]);
	return {
		...client,
		...schema,
		...scan,
		...inventory,
		catalog,
		storage,
		resultPost: resultRoute.POST,
		imageGet: imageRoute.GET,
		sessionsGet: sessionsRoute.GET
	};
}
