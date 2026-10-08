import { afterAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db, pool } from '../fixtures/database.ts';
import { authSessions, localCredentials, userProfiles } from '@spellbook/backend/db/schema.ts';
import { authenticate, withPasswordDerivation } from '../../src/lib/server/auth/local';
import { changePassword } from '../../src/lib/server/auth/change-password';
import * as passwords from '../../src/lib/server/auth/password';
import {
	createSession,
	hashSessionToken,
	validateSession
} from '../../src/lib/server/auth/session';
import { actions, load } from '../../src/routes/settings/password/+page.server';

const run =
	process.env.TEST_DATABASE_URL && process.env.DEMO_MODE !== 'true' ? describe : describe.skip;
run('current-password-confirmed changes', () => {
	const accountIds: string[] = [];
	const currentPassword = 'correct horse battery';
	const newPassword = 'new secret phrase twelve';
	const register = async () => {
		const result = await authenticate(
			'register',
			`mage_${crypto.randomUUID().slice(0, 12)}`,
			currentPassword
		);
		accountIds.push(result!.user.accountId);
		return result!;
	};
	const event = (
		user: Awaited<ReturnType<typeof register>>['user'],
		values: Record<string, string>,
		address = crypto.randomUUID(),
		origin: string | null = 'https://spellbook.test'
	) => {
		const url = new URL('https://spellbook.test/settings/password');
		return {
			url,
			locals: { user },
			request: new Request(url, {
				method: 'POST',
				headers: origin ? { origin } : {},
				body: new URLSearchParams(values)
			}),
			getClientAddress: () => address,
			cookies: { set: vi.fn() }
		};
	};
	const values = { currentPassword, newPassword, confirmPassword: newPassword };
	afterAll(async () => {
		if (accountIds.length)
			await db.delete(userProfiles).where(inArray(userProfiles.accountId, accountIds));
		await pool.end();
	});
	it('requires authentication for reads and writes', async () => {
		for (const handler of [load, actions.default]) {
			await expect(handler({ locals: { user: null } } as never)).rejects.toMatchObject({
				status: 303,
				location: '/auth/login?returnTo=/settings/password'
			});
		}
	});
	it('changes only the current account, revokes browser and bearer sessions and issues a fresh cookie', async () => {
		const user = await register();
		const other = await register();
		const extra = await authenticate('login', user.user.username, currentPassword);
		const [old] = await db
			.select()
			.from(localCredentials)
			.where(eq(localCredentials.accountId, user.user.accountId));
		const request = event(user.user, { ...values, accountId: other.user.accountId });
		expect(await load(request as never)).toEqual({ demoMode: false });
		expect(await actions.default(request as never)).toEqual({
			success: true,
			message: 'Password changed. Your other sessions were signed out.',
			errors: {}
		});
		expect(request.cookies.set).toHaveBeenCalledExactlyOnceWith(
			'spellbook_session',
			expect.any(String),
			{ path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 2592000 }
		);
		const token = request.cookies.set.mock.calls[0][1];
		expect(token).not.toBe(user.session.token);
		expect(await validateSession(token)).toEqual(user.user);
		expect(await validateSession(user.session.token)).toBeNull();
		expect(await validateSession(extra!.session.token)).toBeNull();
		expect(await validateSession(other.session.token)).toEqual(other.user);
		const sessions = await db
			.select()
			.from(authSessions)
			.where(eq(authSessions.accountId, user.user.accountId));
		expect(sessions.map((session) => session.tokenHash)).toEqual([hashSessionToken(token)]);
		const [changed] = await db
			.select()
			.from(localCredentials)
			.where(eq(localCredentials.accountId, user.user.accountId));
		expect(changed.passwordHash).not.toBe(old.passwordHash);
		expect(changed.passwordHash).not.toContain(newPassword);
		expect(await passwords.verifyPassword(newPassword, changed.passwordHash)).toBe(true);
		expect(await createSession(user.user.accountId, old.passwordHash)).toBeNull();
		expect(await authenticate('login', user.user.username, currentPassword)).toBeNull();
		expect((await authenticate('login', user.user.username, newPassword))?.user).toEqual(user.user);
		expect((await authenticate('login', other.user.username, currentPassword))?.user).toEqual(
			other.user
		);
	});
	it('rejects wrong, missing, short, long and mismatched passwords without credential/session writes or returned password values', async () => {
		const user = await register();
		const [old] = await db
			.select()
			.from(localCredentials)
			.where(eq(localCredentials.accountId, user.user.accountId));
		const cases: Record<string, string>[] = [
			{ ...values, currentPassword: 'incorrect horse battery' },
			{ ...values, currentPassword: '' },
			{ ...values, currentPassword: 'x'.repeat(129) },
			{ ...values, newPassword: 'short', confirmPassword: 'short' },
			{ ...values, newPassword: 'x'.repeat(129), confirmPassword: 'x'.repeat(129) },
			{ ...values, confirmPassword: 'mismatched secret phrase' },
			{ newPassword, confirmPassword: newPassword },
			{ currentPassword, newPassword }
		];
		for (const input of cases) {
			const request = event(user.user, input);
			const result = await actions.default(request as never);
			expect(result).toMatchObject({
				status: 400,
				data: { success: false, errors: expect.any(Object) }
			});
			expect(Object.keys((result as { data: object }).data).sort()).toEqual([
				'errors',
				'message',
				'success'
			]);
			expect(request.cookies.set).not.toHaveBeenCalled();
			expect(await validateSession(user.session.token)).toEqual(user.user);
			const [stored] = await db
				.select()
				.from(localCredentials)
				.where(eq(localCredentials.accountId, user.user.accountId));
			expect(stored).toEqual(old);
		}
	});
	it('rolls back the credential and old-session deletion if replacement session issuance fails', async () => {
		const user = await register();
		const [old] = await db
			.select()
			.from(localCredentials)
			.where(eq(localCredentials.accountId, user.user.accountId));
		const request = event(user.user, values);
		await pool.query(
			`CREATE OR REPLACE FUNCTION reject_profile_test_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.account_id = TG_ARGV[0] THEN RAISE EXCEPTION 'test replacement session refused'; END IF; RETURN NEW; END $$`
		);
		await pool.query(
			`CREATE TRIGGER reject_profile_test_session BEFORE INSERT ON auth_sessions FOR EACH ROW EXECUTE FUNCTION reject_profile_test_session('${user.user.accountId}')`
		);
		try {
			await expect(actions.default(request as never)).rejects.toThrow();
			const [stored] = await db
				.select()
				.from(localCredentials)
				.where(eq(localCredentials.accountId, user.user.accountId));
			expect(stored).toEqual(old);
			expect(await validateSession(user.session.token)).toEqual(user.user);
			expect(request.cookies.set).not.toHaveBeenCalled();
		} finally {
			await pool.query('DROP TRIGGER IF EXISTS reject_profile_test_session ON auth_sessions');
			await pool.query('DROP FUNCTION IF EXISTS reject_profile_test_session()');
		}
	});
	it('rejects foreign and missing origins before any password change', async () => {
		const user = await register();
		for (const origin of [null, 'null', 'https://foreign.test']) {
			const request = event(user.user, values, crypto.randomUUID(), origin);
			await expect(actions.default(request as never)).rejects.toMatchObject({ status: 403 });
			expect(request.cookies.set).not.toHaveBeenCalled();
		}
		expect(await validateSession(user.session.token)).toEqual(user.user);
	});
	it('shares the per-address attempt limit and preserves sessions when throttled', async () => {
		const user = await register();
		const address = crypto.randomUUID();
		for (let count = 0; count < 20; count++) {
			expect(
				await actions.default(
					event(user.user, { ...values, newPassword: 'short' }, address) as never
				)
			).toMatchObject({ status: 400 });
		}
		await expect(actions.default(event(user.user, values, address) as never)).rejects.toMatchObject(
			{ status: 429 }
		);
		expect(await validateSession(user.session.token)).toEqual(user.user);
	});
	it('shares the authentication concurrency limit', async () => {
		const user = await register();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const occupied = Array.from({ length: 4 }, () => withPasswordDerivation(() => gate));
		try {
			await expect(actions.default(event(user.user, values) as never)).rejects.toMatchObject({
				status: 429
			});
			expect(await validateSession(user.session.token)).toEqual(user.user);
		} finally {
			release();
			await Promise.all(occupied);
		}
	});
	it('rejects a stale verified credential after operator recovery without overwriting its replacement', async () => {
		const user = await register();
		const recoveryHash = await passwords.hashPassword('operator replacement password');
		const locker = await pool.connect();
		await locker.query('BEGIN');
		await locker.query('SELECT account_id FROM user_profiles WHERE account_id=$1 FOR UPDATE', [
			user.user.accountId
		]);
		const lockerPid = (await locker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
			.rows[0].pid;
		const changing = changePassword(user.user, currentPassword, newPassword);
		// Observe the actual profile-lock wait before committing operator recovery.
		try {
			const deadline = Date.now() + 10000;
			let blocked = false;
			while (Date.now() < deadline) {
				const rows = (
					await pool.query<{ blocked: boolean }>(
						'SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) AS blocked',
						[lockerPid]
					)
				).rows;
				if (rows[0].blocked) {
					blocked = true;
					break;
				}
				await new Promise((resolve) => setTimeout(resolve, 20));
			}
			expect(blocked).toBe(true);
			await locker.query('UPDATE local_credentials SET password_hash=$1 WHERE account_id=$2', [
				recoveryHash,
				user.user.accountId
			]);
			await locker.query('DELETE FROM auth_sessions WHERE account_id=$1', [user.user.accountId]);
			await locker.query('COMMIT');
			await expect(changing).rejects.toMatchObject({ status: 401 });
			const [stored] = await db
				.select()
				.from(localCredentials)
				.where(eq(localCredentials.accountId, user.user.accountId));
			expect(stored.passwordHash).toBe(recoveryHash);
			expect(await validateSession(user.session.token)).toBeNull();
		} finally {
			await locker.query('ROLLBACK');
			locker.release();
			await changing.catch(() => {});
		}
	});
});
