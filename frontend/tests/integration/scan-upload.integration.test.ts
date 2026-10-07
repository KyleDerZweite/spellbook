import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { scanFixture } from '../fixtures/scan.ts';
import { commitResponseLoss } from '../fixtures/pg-commit-loss.ts';
import { createScan } from '@spellbook/backend/scan/application.ts';
import { readdir, writeFile } from 'node:fs/promises';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
run('real worker/local storage Scan attachment', () => {
	let f: Awaited<ReturnType<typeof scanFixture>>;
	beforeAll(async () => {
		f = await scanFixture();
	});
	afterAll(async () => {
		await f.close();
	});
	async function upload(actor: AuthUser, sessionId: string, signal?: AbortSignal) {
		return f.scan.uploadFrame(
			actor,
			{ sessionId, bytes: png, contentType: 'image/png', fileName: 'photo.png' },
			signal
		);
	}
	async function files(sessionId: string) {
		return readdir(`${f.storageDir}/scan-sessions/${sessionId}`).catch(() => []);
	}
	async function blocked(blocker: number) {
		const until = Date.now() + 4000;
		while (Date.now() < until) {
			if (
				(
					await f.pool.query(
						'SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',
						[blocker]
					)
				).rowCount
			)
				return;
			await new Promise((r) => setTimeout(r, 10));
		}
		throw new Error('Upload never reached the actual PG lock barrier');
	}
	it('attaches only one of two concurrent real uploads and removes the rejected object', async () => {
		const a = await f.account(),
			s = await f.scan.createSession(a.user);
		const results = await Promise.allSettled([upload(a.user, s.id), upload(a.user, s.id)]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
		expect((await f.scan.readSession(a.user, { sessionId: s.id })).artifactCount).toBe(1);
		expect(await files(s.id)).toHaveLength(1);
		expect(await f.copyCount(a.user)).toBe(0);
	});
	it('revalidates operator revocation after worker I/O and cleans the rolled-back object', async () => {
		const a = await f.account(),
			s = await f.scan.createSession(a.user),
			client = await f.pool.connect();
		await client.query('BEGIN');
		await client.query('SELECT account_id FROM user_profiles WHERE account_id=$1 FOR UPDATE', [
			a.user.accountId
		]);
		const pending = upload(a.user, s.id);
		const settled = pending.then(
			() => ({ kind: 'UnexpectedSuccess' }),
			(cause) => cause
		);
		try {
			await blocked((await client.query('SELECT pg_backend_pid() AS id')).rows[0].id);
			await f.auth.revokeSession(a.session.token);
			await client.query('ROLLBACK');
			expect(await settled).toMatchObject({ kind: 'Unauthenticated' });
			expect(await files(s.id)).toEqual([]);
		} finally {
			await client.query('ROLLBACK');
			client.release();
			await settled;
		}
	});
	it('observes cancellation after worker I/O before attachment, waits for rollback then cleans', async () => {
		const a = await f.account(),
			s = await f.scan.createSession(a.user),
			client = await f.pool.connect(),
			controller = new AbortController();
		await client.query('BEGIN');
		await client.query('SELECT account_id FROM user_profiles WHERE account_id=$1 FOR UPDATE', [
			a.user.accountId
		]);
		const pending = upload(a.user, s.id, controller.signal).then(
			() => false,
			() => true
		);
		try {
			await blocked((await client.query('SELECT pg_backend_pid() AS id')).rows[0].id);
			controller.abort();
			await client.query('ROLLBACK');
			expect(await pending).toBe(true);
			expect((await f.scan.readSession(a.user, { sessionId: s.id })).artifactCount).toBe(0);
			expect(await files(s.id)).toEqual([]);
		} finally {
			await client.query('ROLLBACK');
			client.release();
			await pending;
		}
	});
	it('preserves the committed image when actual PostgreSQL completes COMMIT but its response is lost', async () => {
		const a = await f.account(),
			s = await f.scan.createSession(a.user);
		const proxy = await commitResponseLoss(process.env.DATABASE_URL!);
		const scan = createScan(f.db, proxy.pool, f.catalog, f.auth, {
			storageDriver: 'local',
			localStorageDir: f.storageDir,
			workerUrl: process.env.SCAN_WORKER_URL
		});
		try {
			await expect(
				scan.uploadFrame(a.user, {
					sessionId: s.id,
					bytes: png,
					contentType: 'image/png',
					fileName: 'photo.png'
				})
			).rejects.toMatchObject({ kind: 'ScanProcessingFailed' });
			expect(proxy.dropped()).toBe(true);
			const saved = await f.scan.readSession(a.user, { sessionId: s.id });
			expect(saved.session.status).toBe('pending_review');
			expect(saved.artifactCount).toBe(1);
			expect(await files(s.id)).toHaveLength(1);
			expect((await f.scan.readImage(a.user, saved.artifacts[0].id)).bytes).toEqual(
				Buffer.from(png)
			);
		} finally {
			scan.close();
			await proxy.close();
		}
	});
	it('retains the object when ordered recovery cannot establish the attachment outcome', async () => {
		const a = await f.account(),
			s = await f.scan.createSession(a.user),
			blocker = await f.pool.connect();
		await blocker.query('BEGIN');
		const proxy = await commitResponseLoss(process.env.DATABASE_URL!, async () => {
			await blocker.query('SELECT account_id FROM user_profiles WHERE account_id=$1 FOR UPDATE', [
				a.user.accountId
			]);
		});
		const scan = createScan(f.db, proxy.pool, f.catalog, f.auth, {
			storageDriver: 'local',
			localStorageDir: f.storageDir,
			workerUrl: process.env.SCAN_WORKER_URL
		});
		try {
			await expect(
				scan.uploadFrame(a.user, {
					sessionId: s.id,
					bytes: png,
					contentType: 'image/png',
					fileName: 'photo.png'
				})
			).rejects.toMatchObject({ kind: 'ScanProcessingFailed' });
			expect(proxy.dropped()).toBe(true);
			expect(await files(s.id)).toHaveLength(1);
			expect((await f.scan.readSession(a.user, { sessionId: s.id })).artifactCount).toBe(1);
		} finally {
			await blocker.query('ROLLBACK');
			blocker.release();
			scan.close();
			await proxy.close();
		}
	}, 15000);
	it('cleans actual worker connection failure and local storage failure without attaching', async () => {
		const a = await f.account();
		const unavailable = createScan(f.db, f.pool, f.catalog, f.auth, {
			storageDriver: 'local',
			localStorageDir: f.storageDir,
			workerUrl: 'http://127.0.0.1:0'
		});
		const blockedPath = f.storageDir + '/not-a-directory';
		await writeFile(blockedPath, 'fixture');
		const broken = createScan(f.db, f.pool, f.catalog, f.auth, {
			storageDriver: 'local',
			localStorageDir: blockedPath,
			workerUrl: process.env.SCAN_WORKER_URL
		});
		try {
			for (const scan of [unavailable, broken]) {
				const s = await f.scan.createSession(a.user);
				await expect(
					scan.uploadFrame(a.user, {
						sessionId: s.id,
						bytes: png,
						contentType: 'image/png',
						fileName: 'photo.png'
					})
				).rejects.toMatchObject({ kind: 'ScanProcessingFailed' });
				expect((await f.scan.readSession(a.user, { sessionId: s.id })).artifactCount).toBe(0);
				expect(await files(s.id)).toEqual([]);
			}
		} finally {
			unavailable.close();
			broken.close();
		}
	});
	it('keeps safe image types and blocks foreign reads, oversized and corrupt stored bytes', async () => {
		const a = await f.account(),
			b = await f.account(),
			s = await f.scan.createSession(a.user),
			saved = await upload(a.user, s.id);
		await expect(f.scan.readImage(b.user, saved.artifact.id)).rejects.toMatchObject({
			kind: 'ScanNotFound'
		});
		const path = `${f.storageDir}/scan-sessions/${s.id}/${saved.artifact.id}.png`;
		await writeFile(path, new Uint8Array(10 * 1024 * 1024 + 1));
		await expect(f.scan.readImage(a.user, saved.artifact.id)).rejects.toMatchObject({
			status: 413
		});
		await writeFile(path, '<script>invalid</script>');
		await expect(f.scan.readImage(a.user, saved.artifact.id)).rejects.toMatchObject({
			status: 415
		});
		await f.auth.revokeSession(a.session.token);
		await expect(f.scan.readImage(a.user, saved.artifact.id)).rejects.toMatchObject({
			kind: 'Unauthenticated'
		});
	});
	it.each([
		{ bytes: png, contentType: 'image/jpeg', status: 415 },
		{ bytes: new Uint8Array(0), contentType: 'image/png', status: 400 },
		{ bytes: new Uint8Array(10 * 1024 * 1024 + 1), contentType: 'image/png', status: 413 }
	])('enforces backend image rules without an HTTP adapter: $status', async (value) => {
		const a = await f.account(),
			s = await f.scan.createSession(a.user);
		await expect(
			f.scan.uploadFrame(a.user, {
				sessionId: s.id,
				bytes: value.bytes,
				contentType: value.contentType,
				fileName: 'photo.png'
			})
		).rejects.toMatchObject({ status: value.status });
		expect((await f.scan.readSession(a.user, { sessionId: s.id })).artifactCount).toBe(0);
	});
});
