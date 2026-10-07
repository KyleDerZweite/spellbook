import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { scanFixture } from '../fixtures/scan.ts';
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('projected selected Scan results', () => {
	let f: Awaited<ReturnType<typeof scanFixture>>;
	beforeAll(async () => {
		f = await scanFixture();
	});
	afterAll(async () => {
		await f.close();
	});
	it('resolves external candidate identity and strips stored extra fields', async () => {
		const a = await f.account(),
			s = await f.artifact(a.user);
		const input = {
			sessionId: s.sessionId,
			artifactId: s.id,
			status: 'matched' as const,
			modelVersion: 'external-v1',
			candidates: [{ catalogCardId: f.card.catalogCardId, confidence: 0.976, notes: 'OCR match' }]
		};
		await f.scan.submitResult(a.user, input);
		await f.scan.submitResult(a.user, input);
		const saved = await f.scan.readSession(a.user, { sessionId: s.sessionId });
		expect(saved.artifacts).toHaveLength(1);
		expect(saved.lastResult?.candidates[0]).toMatchObject({
			name: f.card.name,
			finalScore: 98,
			confidence: 0.976
		});
		await f.pool.query('UPDATE scan_artifacts SET candidate_json=$1 WHERE id=$2', [
			JSON.stringify([{ ...saved.lastResult!.candidates[0], secretField: 'must-not-escape' }]),
			s.id
		]);
		const safe = await f.scan.readSession(a.user, { sessionId: s.sessionId });
		expect(JSON.stringify(safe)).not.toContain('secretField');
		expect(JSON.stringify(safe)).not.toContain(s.key);
		expect(safe.session).not.toHaveProperty('accountId');
		expect(await f.copyCount(a.user)).toBe(0);
	});
	it.each(['cancelled', 'committed'])('rejects candidate replacement in %s', async (state) => {
		const a = await f.account(),
			s = await f.artifact(a.user, state);
		await expect(
			f.scan.submitResult(a.user, {
				sessionId: s.sessionId,
				artifactId: s.id,
				status: 'no_match',
				modelVersion: 'external-v1',
				candidates: []
			})
		).rejects.toMatchObject({ kind: 'ScanClosed' });
	});
	it('rejects foreign artifacts, malformed confidence/status/cardinality/models and stale authority', async () => {
		const a = await f.account(),
			b = await f.account(),
			s = await f.artifact(a.user),
			other = await f.artifact(b.user);
		const base = {
			sessionId: s.sessionId,
			artifactId: s.id,
			status: 'matched' as const,
			modelVersion: 'external-v1',
			candidates: [{ catalogCardId: f.card.catalogCardId, confidence: 0.8 }]
		};
		await expect(
			f.scan.submitResult(a.user, { ...base, artifactId: other.id })
		).rejects.toMatchObject({ kind: 'ScanNotFound' });
		for (const confidence of [1.1, -0.1, NaN, Infinity])
			await expect(
				f.scan.submitResult(a.user, {
					...base,
					candidates: [{ catalogCardId: f.card.catalogCardId, confidence }]
				})
			).rejects.toThrow('confidence');
		for (const input of [
			{ ...base, status: 'ambiguous' as const },
			{ ...base, candidates: [] },
			{ ...base, modelVersion: 'x'.repeat(129) },
			{ ...base, candidates: Array.from({ length: 21 }, () => base.candidates[0]) },
			{ ...base, candidates: [{ ...base.candidates[0], notes: 'x'.repeat(501) }] }
		])
			await expect(f.scan.submitResult(a.user, input)).rejects.toMatchObject({
				kind: 'ValidationFailed'
			});
		await f.auth.revokeSession(a.session.token);
		await expect(f.scan.submitResult(a.user, base)).rejects.toMatchObject({
			kind: 'Unauthenticated'
		});
	});
	it('pages selected artifacts/reviews and identifies the latest even beyond the requested page', async () => {
		const a = await f.account(),
			s = await f.artifact(a.user);
		let latest = '';
		for (let i = 0; i < 104; i++) {
			const id = crypto.randomUUID();
			latest = id;
			const key = `scan-sessions/${s.sessionId}/${id}.png`;
			await f.pool.query(
				"INSERT INTO scan_artifacts(id,session_id,account_id,original_object_key,normalized_object_key,quality_score,embedding_model_version,ocr_model_version,status,updated_at) VALUES($1,$2,$3,$4,$4,0,'fixture','fixture','no_match',$5)",
				[id, s.sessionId, a.user.accountId, key, new Date(Date.now() + i * 10)]
			);
		}
		const page = await f.scan.readSession(a.user, { sessionId: s.sessionId });
		expect(page.artifacts).toHaveLength(50);
		expect(page.artifactCount).toBe(105);
		expect(page.lastResult?.artifactId).toBe(latest);
		expect(page.nextArtifactCursor).not.toBeNull();
		const next = await f.scan.readSession(a.user, {
			sessionId: s.sessionId,
			artifactCursor: page.nextArtifactCursor!
		});
		expect(next.artifacts).toHaveLength(50);
		expect(new Set([...page.artifacts, ...next.artifacts].map((r) => r.id)).size).toBe(100);
		const end = await f.scan.readSession(a.user, {
			sessionId: s.sessionId,
			artifactCursor: next.nextArtifactCursor!
		});
		expect(end.artifacts).toHaveLength(5);
		expect(end.nextArtifactCursor).toBeNull();
		for (const limit of [0, 101, 1.5])
			await expect(
				f.scan.readSession(a.user, { sessionId: s.sessionId, limit })
			).rejects.toMatchObject({ kind: 'ValidationFailed' });
	});
});
