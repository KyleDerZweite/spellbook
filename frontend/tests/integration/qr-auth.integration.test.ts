import { afterAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { PoolClient } from 'pg';
import { createDatabase, createLocalAuth } from '@spellbook/backend';
import { hashSessionToken } from '@spellbook/backend/auth/session.ts';
import { setLocalPassword } from '@spellbook/backend/operators/local-password.ts';
import { createQrAttemptLimiter } from '@spellbook/backend/auth/qr.ts';

// Real PostgreSQL locking is required. A skipped suite establishes no transaction evidence.
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('QR authorization transactions', () => {
	const database = createDatabase(process.env.TEST_DATABASE_URL!);
	const auth = createLocalAuth(database.db, { demoMode: false });
	const accounts: string[] = [];
	const codes: string[] = [];
	let address = 0;
	const nextAddress = () => `qr-test-${++address}`;
	const password = 'qr-original-test-password';
	async function account() {
		const result = (await auth.authenticate(
			'register',
			`qr_${crypto.randomUUID().slice(0, 8)}`,
			password
		))!;
		accounts.push(result.user.accountId);
		return result;
	}
	async function challenge(kind: 'browser' | 'device' = 'device') {
		const created = await auth.qr.create(kind, nextAddress());
		codes.push(hashSessionToken(created.code));
		return created;
	}
	async function approved() {
		const actor = await account();
		const created = await challenge();
		await auth.qr.decide(actor.user, created.code, 'approve', nextAddress());
		return { actor, created };
	}
	async function sessions(accountId: string) {
		return (
			await database.pool.query(
				'SELECT count(*)::int AS count FROM auth_sessions WHERE account_id=$1',
				[accountId]
			)
		).rows[0].count;
	}
	async function waitForBlocked(client: PoolClient) {
		const { rows } = await client.query('SELECT pg_backend_pid() AS pid');
		for (let attempt = 0; attempt < 200; attempt++) {
			const waiting = await database.pool.query(
				'SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))',
				[rows[0].pid]
			);
			if (waiting.rowCount) return;
			await delay(10);
		}
		throw new Error('QR operation did not reach the expected PostgreSQL lock wait');
	}
	afterAll(async () => {
		await database.pool.query('DELETE FROM qr_authorizations WHERE code_hash=ANY($1::text[])', [
			codes
		]);
		await database.pool.query('DELETE FROM user_profiles WHERE account_id=ANY($1::text[])', [
			accounts
		]);
		await database.pool.end();
	});
	it('stores independent digests, reveals no secret on inspection, and enforces requester kind', async () => {
		const actor = await account();
		const created = await challenge('browser');
		expect(created.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(created.requesterSecret).not.toBe(created.code);
		expect(Date.parse(created.expiresAt) - Date.now()).toBeGreaterThan(290_000);
		expect(created.interval).toBe(3);
		const row = (
			await database.pool.query('SELECT * FROM qr_authorizations WHERE code_hash=$1', [
				hashSessionToken(created.code)
			])
		).rows[0];
		expect(row.secret_hash).toBe(hashSessionToken(created.requesterSecret));
		expect(JSON.stringify(row)).not.toContain(created.requesterSecret);
		expect(await auth.qr.inspect(actor.user, created.code, nextAddress())).toEqual({
			code: created.code,
			kind: 'browser',
			status: 'pending',
			expiresAt: created.expiresAt
		});
		await expect(
			auth.qr.inspect({ ...actor.user }, created.code, nextAddress())
		).rejects.toMatchObject({ kind: 'Unauthenticated' });
		await expect(
			auth.qr.redeem(created.code, { requesterSecret: created.requesterSecret }, nextAddress())
		).rejects.toMatchObject({ kind: 'ValidationFailed' });
		await expect(auth.qr.redeem(created.code, {}, nextAddress())).rejects.toMatchObject({
			kind: 'Unauthenticated'
		});
		await expect(
			auth.qr.redeem(
				created.code,
				{ browserSecret: created.requesterSecret, browserAuthenticated: true },
				nextAddress()
			)
		).rejects.toMatchObject({ kind: 'Conflict' });
		expect(
			await auth.qr.redeem(created.code, { browserSecret: created.requesterSecret }, nextAddress())
		).toEqual({ kind: 'browser', status: 'pending' });
		await auth.qr.decide(actor.user, created.code, 'approve', nextAddress());
		const result = await auth.qr.redeem(
			created.code,
			{ browserSecret: created.requesterSecret },
			nextAddress()
		);
		expect(result).toMatchObject({ kind: 'browser', status: 'authenticated' });
		const device = await challenge();
		await expect(
			auth.qr.redeem(device.code, { browserSecret: device.requesterSecret }, nextAddress())
		).rejects.toMatchObject({ kind: 'Unauthenticated' });
	});
	it('issues exactly one session under concurrent redemption and consumes successful requests', async () => {
		const { actor, created } = await approved();
		const before = await sessions(actor.user.accountId);
		const results = await Promise.all(
			Array.from({ length: 8 }, () =>
				auth.qr.redeem(created.code, { requesterSecret: created.requesterSecret }, nextAddress())
			)
		);
		const successful = results.filter((result) => result.status === 'authenticated');
		expect(successful).toHaveLength(1);
		expect(results.filter((result) => result.status === 'consumed')).toHaveLength(7);
		expect(await sessions(actor.user.accountId)).toBe(before + 1);
		if (successful[0].status === 'authenticated')
			expect((await auth.validateSession(successful[0].session.token))?.accountId).toBe(
				actor.user.accountId
			);
		expect(
			await auth.qr.redeem(
				created.code,
				{ requesterSecret: created.requesterSecret },
				nextAddress()
			)
		).toEqual({ kind: 'device', status: 'consumed' });
	});
	it('rejects wrong secrets without consuming approval', async () => {
		const { actor, created } = await approved();
		await expect(
			auth.qr.redeem(
				created.code,
				{ requesterSecret: randomBytes(32).toString('base64url') },
				nextAddress()
			)
		).rejects.toMatchObject({ kind: 'Unauthenticated' });
		expect(await sessions(actor.user.accountId)).toBe(1);
		expect(
			await auth.qr.redeem(
				created.code,
				{ requesterSecret: created.requesterSecret },
				nextAddress()
			)
		).toMatchObject({ status: 'authenticated' });
	});
	it('makes the first decision immutable and binds repeats to the exact original session', async () => {
		const actor = await account();
		const other = await account();
		const sameAccount = (await auth.authenticate('login', actor.user.username, password))!;
		const created = await challenge();
		const result = await auth.qr.decide(actor.user, created.code, 'approve', nextAddress());
		expect(await auth.qr.decide(actor.user, created.code, 'approve', nextAddress())).toEqual(
			result
		);
		for (const user of [sameAccount.user, other.user])
			await expect(
				auth.qr.decide(user, created.code, 'approve', nextAddress())
			).rejects.toMatchObject({ kind: 'Conflict' });
		await expect(
			auth.qr.decide(actor.user, created.code, 'deny', nextAddress())
		).rejects.toMatchObject({ kind: 'Conflict' });
		const denied = await challenge();
		expect(await auth.qr.decide(other.user, denied.code, 'deny', nextAddress())).toMatchObject({
			status: 'denied'
		});
		expect(
			await auth.qr.redeem(denied.code, { requesterSecret: denied.requesterSecret }, nextAddress())
		).toEqual({ kind: 'device', status: 'denied' });
		const contested = await challenge();
		const results = await Promise.allSettled([
			auth.qr.decide(actor.user, contested.code, 'approve', nextAddress()),
			auth.qr.decide(other.user, contested.code, 'deny', nextAddress())
		]);
		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
		expect(results.find((result) => result.status === 'rejected')).toMatchObject({
			reason: { kind: 'Conflict' }
		});
	});
	it('rejects expired requests and rechecks expiry after Profile and challenge lock waits', async () => {
		for (const lock of ['profile', 'challenge']) {
			const { actor, created } = await approved();
			const blocker = await database.pool.connect();
			let redemption: ReturnType<typeof auth.qr.redeem> | undefined;
			try {
				await blocker.query('BEGIN');
				if (lock === 'profile')
					await blocker.query('SELECT 1 FROM user_profiles WHERE account_id=$1 FOR UPDATE', [
						actor.user.accountId
					]);
				else
					await blocker.query('SELECT 1 FROM qr_authorizations WHERE code_hash=$1 FOR UPDATE', [
						hashSessionToken(created.code)
					]);
				redemption = auth.qr.redeem(
					created.code,
					{ requesterSecret: created.requesterSecret },
					nextAddress()
				);
				await waitForBlocked(blocker);
				await blocker.query(
					"UPDATE qr_authorizations SET expires_at=now()-interval '1 second' WHERE code_hash=$1",
					[hashSessionToken(created.code)]
				);
				await blocker.query('COMMIT');
				expect(await redemption).toEqual({ kind: 'device', status: 'expired' });
				expect(await sessions(actor.user.accountId)).toBe(1);
			} finally {
				await blocker.query('ROLLBACK');
				blocker.release();
				await redemption;
			}
		}
		const actor = await account();
		const created = await challenge();
		await database.pool.query(
			"UPDATE qr_authorizations SET expires_at=now()-interval '1 second' WHERE code_hash=$1",
			[hashSessionToken(created.code)]
		);
		expect(await auth.qr.decide(actor.user, created.code, 'approve', nextAddress())).toMatchObject({
			status: 'expired'
		});
		expect(
			await auth.qr.redeem(
				created.code,
				{ requesterSecret: created.requesterSecret },
				nextAddress()
			)
		).toMatchObject({ status: 'expired' });
	});
	it('rechecks challenge and approver session expiry after waiting for the session share lock', async () => {
		for (const expired of ['challenge', 'session']) {
			const { actor, created } = await approved();
			const blocker = await database.pool.connect();
			let redemption: ReturnType<typeof auth.qr.redeem> | undefined;
			try {
				await blocker.query('BEGIN');
				await blocker.query('SELECT 1 FROM auth_sessions WHERE token_hash=$1 FOR UPDATE', [
					hashSessionToken(actor.session.token)
				]);
				if (expired === 'challenge') {
					// The frozen application clock advances only after the real lock wait is observed.
					// SQL expiry is unchanged; no timer race is needed.
					const originalNow = Date.now;
					try {
						redemption = auth.qr.redeem(
							created.code,
							{ requesterSecret: created.requesterSecret },
							nextAddress()
						);
						await waitForBlocked(blocker);
						Date.now = () => Date.parse(created.expiresAt) + 1;
						await blocker.query('COMMIT');
						expect(await redemption).toMatchObject({ status: 'expired' });
					} finally {
						Date.now = originalNow;
					}
				} else {
					redemption = auth.qr.redeem(
						created.code,
						{ requesterSecret: created.requesterSecret },
						nextAddress()
					);
					await waitForBlocked(blocker);
					await blocker.query(
						"UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
						[hashSessionToken(actor.session.token)]
					);
					await blocker.query('COMMIT');
					expect(await redemption).toMatchObject({ status: 'expired' });
				}
				expect(await sessions(actor.user.accountId)).toBe(1);
			} finally {
				await blocker.query('ROLLBACK');
				blocker.release();
				await redemption;
			}
		}
	});
	it('rechecks pending expiry and session revocation after decision lock waits', async () => {
		for (const lock of ['profile', 'challenge', 'session']) {
			const actor = await account();
			const created = await challenge();
			const blocker = await database.pool.connect();
			let decision: ReturnType<typeof auth.qr.decide> | undefined;
			const originalNow = Date.now;
			try {
				await blocker.query('BEGIN');
				if (lock === 'profile')
					await blocker.query('SELECT 1 FROM user_profiles WHERE account_id=$1 FOR UPDATE', [
						actor.user.accountId
					]);
				else if (lock === 'challenge')
					await blocker.query('SELECT 1 FROM qr_authorizations WHERE code_hash=$1 FOR UPDATE', [
						hashSessionToken(created.code)
					]);
				else
					await blocker.query('SELECT 1 FROM auth_sessions WHERE token_hash=$1 FOR UPDATE', [
						hashSessionToken(actor.session.token)
					]);
				decision = auth.qr.decide(actor.user, created.code, 'approve', nextAddress());
				await waitForBlocked(blocker);
				Date.now = () => Date.parse(created.expiresAt) + 1;
				await blocker.query('COMMIT');
				expect(await decision).toMatchObject({ status: 'expired' });
			} finally {
				await blocker.query('ROLLBACK');
				blocker.release();
				Date.now = originalNow;
				await decision;
			}
		}
		const actor = await account();
		const created = await challenge();
		const blocker = await database.pool.connect();
		let decision: Promise<unknown> | undefined;
		try {
			await blocker.query('BEGIN');
			await blocker.query('SELECT 1 FROM auth_sessions WHERE token_hash=$1 FOR UPDATE', [
				hashSessionToken(actor.session.token)
			]);
			// Attach rejection handling before releasing the lock.
			decision = expect(
				auth.qr.decide(actor.user, created.code, 'approve', nextAddress())
			).rejects.toMatchObject({ kind: 'Unauthenticated' });
			await waitForBlocked(blocker);
			await blocker.query('DELETE FROM auth_sessions WHERE token_hash=$1', [
				hashSessionToken(actor.session.token)
			]);
			await blocker.query('COMMIT');
			await decision;
		} finally {
			await blocker.query('ROLLBACK');
			blocker.release();
			await decision;
		}
	});
	it('rolls session issuance and consumption back together if session creation fails', async () => {
		const { actor, created } = await approved();
		const name = `qr_session_fail_${crypto.randomUUID().replaceAll('-', '')}`;
		expect(actor.user.accountId).toMatch(/^[0-9a-f-]{36}$/);
		await database.pool.query(
			`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.account_id='${actor.user.accountId}' THEN RAISE EXCEPTION 'QR test issuance failure'; END IF; RETURN NEW; END $$`
		);
		try {
			await database.pool.query(
				`CREATE TRIGGER "${name}" BEFORE INSERT ON auth_sessions FOR EACH ROW EXECUTE FUNCTION "${name}"()`
			);
			await expect(
				auth.qr.redeem(created.code, { requesterSecret: created.requesterSecret }, nextAddress())
			).rejects.toThrow();
			expect(await auth.qr.inspect(actor.user, created.code, nextAddress())).toMatchObject({
				status: 'approved'
			});
			expect(await sessions(actor.user.accountId)).toBe(1);
		} finally {
			await database.pool.query(`DROP TRIGGER IF EXISTS "${name}" ON auth_sessions`);
			await database.pool.query(`DROP FUNCTION "${name}"()`);
		}
		expect(
			await auth.qr.redeem(
				created.code,
				{ requesterSecret: created.requesterSecret },
				nextAddress()
			)
		).toMatchObject({ status: 'authenticated' });
	});
	it('invalidates approval when the original session is revoked, including while redemption waits', async () => {
		const { actor, created } = await approved();
		const replacement = (await auth.authenticate('login', actor.user.username, password))!;
		await auth.revokeSession(actor.session.token);
		expect(await auth.validateSession(replacement.session.token)).not.toBeNull();
		expect(
			await auth.qr.redeem(
				created.code,
				{ requesterSecret: created.requesterSecret },
				nextAddress()
			)
		).toMatchObject({ status: 'expired' });
		const waiting = await approved();
		const blocker = await database.pool.connect();
		let redemption: ReturnType<typeof auth.qr.redeem> | undefined;
		try {
			await blocker.query('BEGIN');
			await blocker.query('SELECT 1 FROM auth_sessions WHERE token_hash=$1 FOR UPDATE', [
				hashSessionToken(waiting.actor.session.token)
			]);
			redemption = auth.qr.redeem(
				waiting.created.code,
				{ requesterSecret: waiting.created.requesterSecret },
				nextAddress()
			);
			await waitForBlocked(blocker);
			await blocker.query('DELETE FROM auth_sessions WHERE token_hash=$1', [
				hashSessionToken(waiting.actor.session.token)
			]);
			await blocker.query('COMMIT');
			expect(await redemption).toMatchObject({ status: 'expired' });
			expect(await sessions(waiting.actor.user.accountId)).toBe(0);
		} finally {
			await blocker.query('ROLLBACK');
			blocker.release();
			await redemption;
		}
	});
	it('invalidates approval on password change and recovery without adopting the replacement session', async () => {
		const { actor, created } = await approved();
		const replacement = (await auth.changePassword(
			actor.user,
			password,
			'qr-replacement-password'
		))!;
		expect(await auth.validateSession(replacement.token)).not.toBeNull();
		expect(
			await auth.qr.redeem(
				created.code,
				{ requesterSecret: created.requesterSecret },
				nextAddress()
			)
		).toMatchObject({ status: 'expired' });
		const recovery = await approved();
		await setLocalPassword(process.env.TEST_DATABASE_URL!, {
			accountId: recovery.actor.user.accountId,
			username: recovery.actor.user.username,
			password: 'qr-operator-recovered-password'
		});
		expect(
			await auth.qr.redeem(
				recovery.created.code,
				{ requesterSecret: recovery.created.requesterSecret },
				nextAddress()
			)
		).toMatchObject({ status: 'expired' });
	});
});

describe('QR bounded attempt limits', () => {
	it('limits keys and attempts, frees expired capacity, and keeps independent budgets', () => {
		const creation = createQrAttemptLimiter(2, 1000, 2);
		const polling = createQrAttemptLimiter(3, 1000, 2);
		creation('a', 0);
		creation('a', 1);
		expect(() => creation('a', 2)).toThrow('Too many QR requests');
		polling('a', 2);
		creation('b', 2);
		expect(() => creation('c', 3)).toThrow('Too many QR requests');
		expect(() => creation('c', 1001)).not.toThrow();
	});
});
