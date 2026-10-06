import { spawn } from 'node:child_process';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db, pool } from '../../src/lib/server/db/client';
import {
	authSessions,
	decks,
	inventories,
	inventoryCards,
	localCredentials,
	userProfiles
} from '../../src/lib/server/db/schema';
import { authenticate } from '../../src/lib/server/auth/local';
import {
	createSession,
	hashSessionToken,
	revokeSession,
	validateSession
} from '../../src/lib/server/auth/session';
import { POST as login } from '../../src/routes/api/auth/login/+server';
import { POST as register } from '../../src/routes/api/auth/register/+server';
import { submitAuthForm } from '../../src/lib/server/auth/forms';
import * as profileData from '../../src/lib/server/data/profile';
import { POST as logout } from '../../src/routes/api/auth/logout/+server';
import { hashPassword } from '../../src/lib/server/auth/password';
import { requireMobileAuth } from '../../src/lib/server/mobile/auth';
import {
	actions as settingsActions,
	load as loadSettings
} from '../../src/routes/settings/+page.server';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('local accounts and persisted sessions', () => {
	const accountIds: string[] = [];
	const settingsRequest = (avatarId?: string, accountId?: string, artworkId?: string) => {
		const body = new FormData();
		if (avatarId !== undefined) body.set('avatarId', avatarId);
		if (accountId) body.set('accountId', accountId);
		if (artworkId !== undefined) body.set('artworkId', artworkId);
		return new Request('https://spellbook.test/settings', { method: 'POST', body });
	};
	afterAll(async () => {
		if (accountIds.length)
			await db.delete(userProfiles).where(inArray(userProfiles.accountId, accountIds));
		await pool.end();
	});
	it('requires authentication for settings reads and updates', async () => {
		const event = { locals: { user: null }, request: settingsRequest('dragon') };
		await expect(loadSettings(event as never)).rejects.toMatchObject({
			status: 303,
			location: '/auth/login?returnTo=/settings'
		});
		await expect(settingsActions.default(event as never)).rejects.toMatchObject({
			status: 303,
			location: '/auth/login?returnTo=/settings'
		});
	});
	it('rejects missing and unknown avatars without changing the stored preference', async () => {
		const user = await authenticate(
			'register',
			`mage_${crypto.randomUUID().slice(0, 12)}`,
			'correct horse battery'
		);
		accountIds.push(user!.user.accountId);
		for (const avatarId of [undefined, 'unknown', 'https://example.test/picture.png']) {
			const result = await settingsActions.default({
				locals: { user: user!.user },
				request: settingsRequest(avatarId)
			} as never);
			expect(result).toMatchObject({
				status: 400,
				data: { success: false, avatarId: avatarId ?? '' }
			});
		}
		expect((await validateSession(user!.session.token))?.avatarId).toBe('wizard');
	});
	it('persists a profile only for the current account and updates active sessions and login', async () => {
		const password = 'correct horse battery';
		const user = await authenticate(
			'register',
			`mage_${crypto.randomUUID().slice(0, 12)}`,
			password
		);
		const other = await authenticate(
			'register',
			`mage_${crypto.randomUUID().slice(0, 12)}`,
			password
		);
		accountIds.push(user!.user.accountId, other!.user.accountId);
		const locals = { user: user!.user };
		const result = await settingsActions.default({
			locals,
			request: settingsRequest('dragon', other!.user.accountId, 'astral')
		} as never);
		expect(result).toEqual({ success: true, message: 'Profile saved.' });
		expect(locals.user.avatarId).toBe('dragon');
		expect(locals.user.artworkId).toBe('astral');
		expect(await loadSettings({ locals } as never)).toMatchObject({
			user: { accountId: user!.user.accountId, avatarId: 'dragon', artworkId: 'astral' }
		});
		expect(await validateSession(user!.session.token)).toMatchObject({
			avatarId: 'dragon',
			artworkId: 'astral'
		});
		expect((await authenticate('login', user!.user.username, password))?.user).toMatchObject({
			avatarId: 'dragon',
			artworkId: 'astral'
		});
		expect(await validateSession(other!.session.token)).toMatchObject({
			avatarId: 'wizard',
			artworkId: 'grove'
		});
		await settingsActions.default({ locals, request: settingsRequest('slime') } as never);
		expect(await validateSession(user!.session.token)).toMatchObject({
			avatarId: 'slime',
			artworkId: 'astral'
		});
	});
	it('rejects explicit invalid artwork before creating an account', async () => {
		for (const artworkId of ['', 'unknown', 'https://example.test/art.webp', null, 42, undefined]) {
			const username = `mage_${crypto.randomUUID().slice(0, 12)}`;
			expect(
				await authenticate('register', username, 'correct horse battery', { artworkId })
			).toBeNull();
			expect(
				await db.select().from(userProfiles).where(eq(userProfiles.username, username))
			).toEqual([]);
			expect(
				await db.select().from(localCredentials).where(eq(localCredentials.username, username))
			).toEqual([]);
		}
	});
	it('accepts registration artwork through JSON and browser forms and preserves failed form values', async () => {
		const password = 'correct horse battery';
		const username = `mage_${crypto.randomUUID().slice(0, 12)}`;
		const url = new URL('https://spellbook.test/api/auth/register');
		const response = await register({
			url,
			request: new Request(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ username, password, artworkId: 'tide' })
			}),
			getClientAddress: () => crypto.randomUUID()
		} as never);
		expect(response.status).toBe(201);
		const body = await response.json();
		accountIds.push(body.user.accountId);
		expect(body.user.artworkId).toBe('tide');
		expect((await validateSession(body.token))?.artworkId).toBe('tide');
		expect((await authenticate('login', username, password))?.user.artworkId).toBe('tide');
		const browserUsername = `mage_${crypto.randomUUID().slice(0, 12)}`;
		const browserUrl = new URL('https://spellbook.test/auth/register');
		const cookie = vi.fn();
		const event = (artworkId: string, username = browserUsername) => ({
			url: browserUrl,
			request: new Request(browserUrl, {
				method: 'POST',
				headers: { origin: browserUrl.origin },
				body: new URLSearchParams({ username, password, artworkId })
			}),
			cookies: { get: () => undefined, set: cookie },
			getClientAddress: () => crypto.randomUUID()
		});
		expect(await submitAuthForm(event('unknown') as never, 'register')).toMatchObject({
			status: 400,
			data: { username: browserUsername, artworkId: 'unknown' }
		});
		expect(cookie).not.toHaveBeenCalled();
		await expect(submitAuthForm(event('ember') as never, 'register')).rejects.toMatchObject({
			status: 303
		});
		const browserUser = await validateSession(cookie.mock.calls[0][1]);
		accountIds.push(browserUser!.accountId);
		expect(browserUser).toMatchObject({ username: browserUsername, artworkId: 'ember' });
		expect(await submitAuthForm(event('astral') as never, 'register')).toMatchObject({
			status: 400,
			data: { username: browserUsername, artworkId: 'astral' }
		});
		expect((await validateSession(cookie.mock.calls[0][1]))?.artworkId).toBe('ember');
	});
	it('rejects invalid settings artwork without changing either preference', async () => {
		const user = await authenticate(
			'register',
			`mage_${crypto.randomUUID().slice(0, 12)}`,
			'correct horse battery',
			{ artworkId: 'tide' }
		);
		accountIds.push(user!.user.accountId);
		for (const artworkId of ['', 'unknown', 'https://example.test/art.webp']) {
			expect(
				await settingsActions.default({
					locals: { user: user!.user },
					request: settingsRequest('dragon', undefined, artworkId)
				} as never)
			).toMatchObject({
				status: 400,
				data: { success: false, avatarId: 'dragon', artworkId }
			});
		}
		expect(await validateSession(user!.session.token)).toMatchObject({
			avatarId: 'wizard',
			artworkId: 'tide'
		});
	});
	it('returns empty totals without creating an inventory and keeps customization available on totals failure', async () => {
		const user = await authenticate(
			'register',
			`mage_${crypto.randomUUID().slice(0, 12)}`,
			'correct horse battery'
		);
		accountIds.push(user!.user.accountId);
		const locals = { user: user!.user };
		expect(await loadSettings({ locals } as never)).toMatchObject({
			totals: { total: 0, names: 0, printings: 0, sets: 0, foils: 0, decks: 0 },
			statsError: null
		});
		expect(
			await db.select().from(inventories).where(eq(inventories.accountId, user!.user.accountId))
		).toEqual([]);
		const totalsRead = vi
			.spyOn(profileData, 'getProfileTotals')
			.mockRejectedValueOnce(new Error('database read failed'));
		try {
			expect(await loadSettings({ locals } as never)).toMatchObject({
				user: user!.user,
				totals: null,
				statsError: expect.any(String)
			});
		} finally {
			totalsRead.mockRestore();
		}
		expect(
			await settingsActions.default({
				locals,
				request: settingsRequest('dragon', undefined, 'ember')
			} as never)
		).toEqual({ success: true, message: 'Profile saved.' });
		expect((await validateSession(user!.session.token))?.artworkId).toBe('ember');
	});
	it('aggregates owned quantities, canonical cards, printings, sets, foils and MTG decks for only the current account', async () => {
		const accountId = `profile-${crypto.randomUUID()}`;
		const otherId = `profile-${crypto.randomUUID()}`;
		accountIds.push(accountId, otherId);
		await db.insert(userProfiles).values([
			{ accountId, username: accountId },
			{ accountId: otherId, username: otherId }
		]);
		const inventoryId = crypto.randomUUID();
		const otherInventoryId = crypto.randomUUID();
		await db.insert(inventories).values([
			{ id: inventoryId, accountId, game: 'mtg' },
			{ id: otherInventoryId, accountId: otherId, game: 'mtg' }
		]);
		const card = (
			catalogCardId: string,
			canonicalCardId: string,
			setCode: string,
			quantity: number,
			finish: string
		) => ({
			id: crypto.randomUUID(),
			inventoryId,
			accountId,
			game: 'mtg',
			catalogCardId,
			canonicalCardId,
			setCode,
			quantity,
			finish,
			name: 'Identical display name',
			imageUri: '',
			condition: 'NM',
			spellbookPosition: 0
		});
		await db.insert(inventoryCards).values([
			card('printing-one', 'canonical-one', 'aaa', 4, 'nonfoil'),
			card('printing-one', 'canonical-one', 'aaa', 3, 'foil'),
			card('printing-two', 'canonical-one', 'aaa', 2, 'nonfoil'),
			card('printing-three', 'canonical-two', 'bbb', 5, 'foil'),
			{ ...card('other-game', 'other-game', 'ccc', 7, 'foil'), game: 'other' },
			{
				...card('other-account', 'other-account', 'ccc', 99, 'foil'),
				accountId: otherId,
				inventoryId: otherInventoryId
			}
		]);
		await db.insert(decks).values([
			{ id: crypto.randomUUID(), accountId, game: 'mtg', name: 'First' },
			{ id: crypto.randomUUID(), accountId, game: 'mtg', name: 'Second' },
			{ id: crypto.randomUUID(), accountId: otherId, game: 'mtg', name: 'Other' }
		]);
		expect(
			await loadSettings({
				locals: { user: { accountId, username: accountId, email: '' } }
			} as never)
		).toMatchObject({
			totals: { total: 14, names: 2, printings: 3, sets: 2, foils: 8, decks: 2 },
			statsError: null
		});
		expect(await profileData.getProfileTotals(otherId)).toEqual({
			total: 99,
			names: 1,
			printings: 1,
			sets: 1,
			foils: 99,
			decks: 1
		});
	});
	it('registers atomically, authenticates normalized usernames and rejects duplicates', async () => {
		const username = `mage_${crypto.randomUUID().slice(0, 12)}`;
		const password = 'correct horse battery';
		const user = await authenticate('register', username, password);
		expect(user).not.toBeNull();
		expect(user!.user.artworkId).toBe('grove');
		accountIds.push(user!.user.accountId);
		expect((await authenticate('login', ` ${username.toUpperCase()} `, password))?.user).toEqual(
			user!.user
		);
		expect(await authenticate('login', username, 'incorrect horse battery')).toBeNull();
		expect(await authenticate('register', username, password)).toBeNull();
		const profiles = await db
			.select()
			.from(userProfiles)
			.where(eq(userProfiles.username, username));
		expect(profiles).toHaveLength(1);
		const [credential] = await db
			.select()
			.from(localCredentials)
			.where(eq(localCredentials.accountId, user!.user.accountId));
		expect(credential.passwordHash).not.toContain(password);
	});
	it('stores only token hashes and enforces expiry and revocation', async () => {
		const user = await authenticate(
			'register',
			`mage_${crypto.randomUUID().slice(0, 12)}`,
			'correct horse battery'
		);
		accountIds.push(user!.user.accountId);
		const session = user!.session;
		const [stored] = await db
			.select()
			.from(authSessions)
			.where(eq(authSessions.accountId, user!.user.accountId));
		expect(stored.tokenHash).toBe(hashSessionToken(session.token));
		expect(stored.tokenHash).not.toBe(session.token);
		expect(await validateSession(session.token)).toEqual(user!.user);
		await db
			.update(authSessions)
			.set({ expiresAt: new Date(0) })
			.where(eq(authSessions.tokenHash, stored.tokenHash));
		expect(await validateSession(session.token)).toBeNull();
		const [credential] = await db
			.select()
			.from(localCredentials)
			.where(eq(localCredentials.accountId, user!.user.accountId));
		const second = (await createSession(user!.user.accountId, credential.passwordHash))!;
		await revokeSession(second.token);
		expect(await validateSession(second.token)).toBeNull();
	});
	it('rejects issuance from a password verified before an operator reset', async () => {
		const authenticated = await authenticate(
			'register',
			`mage_${crypto.randomUUID().slice(0, 12)}`,
			'correct horse battery'
		);
		const accountId = authenticated!.user.accountId;
		accountIds.push(accountId);
		const [old] = await db
			.select()
			.from(localCredentials)
			.where(eq(localCredentials.accountId, accountId));
		const replacement = await hashPassword('replacement secret phrase');
		await db.transaction(async (tx) => {
			await tx
				.select()
				.from(userProfiles)
				.where(eq(userProfiles.accountId, accountId))
				.for('update');
			await tx
				.update(localCredentials)
				.set({ passwordHash: replacement })
				.where(eq(localCredentials.accountId, accountId));
			await tx.delete(authSessions).where(eq(authSessions.accountId, accountId));
		});
		expect(await createSession(accountId, old.passwordHash)).toBeNull();
		expect(await validateSession(authenticated!.session.token)).toBeNull();
		expect(await createSession(accountId, replacement)).not.toBeNull();
	});
	it('enrolls and resets an existing account through the operator command', async () => {
		const accountId = `legacy-${crypto.randomUUID()}`;
		const username = `mage_${crypto.randomUUID().slice(0, 12)}`;
		accountIds.push(accountId);
		await db
			.insert(userProfiles)
			.values({ accountId, username: 'Old identity', email: 'legacy@example.test' });
		const setPassword = async (password: string) => {
			const command = spawn(
				process.execPath,
				['scripts/set-local-password.mjs', accountId, username],
				{
					env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
					stdio: ['pipe', 'pipe', 'pipe']
				}
			);
			let output = '';
			command.stdout.on('data', (chunk) => {
				output += chunk.toString();
			});
			command.stderr.on('data', (chunk) => {
				output += chunk.toString();
			});
			command.stdin.end(password + '\n');
			const code = await new Promise((resolve, reject) => {
				command.on('close', resolve);
				command.on('error', reject);
			});
			expect(output).not.toContain(password);
			expect(code, output).toBe(0);
		};
		await setPassword('first local password');
		const first = await authenticate('login', username, 'first local password');
		expect(first!.user).toMatchObject({ accountId, email: 'legacy@example.test' });
		await setPassword('replacement local password');
		expect(await validateSession(first!.session.token)).toBeNull();
		expect(await authenticate('login', username, 'first local password')).toBeNull();
		expect(
			(await authenticate('login', username, 'replacement local password'))!.user.accountId
		).toBe(accountId);
	});
	it('issues a mobile bearer session and revokes it via the API', async () => {
		const username = `mage_${crypto.randomUUID().slice(0, 12)}`;
		const password = 'correct horse battery';
		const user = await authenticate('register', username, password);
		accountIds.push(user!.user.accountId);
		const url = new URL('https://spellbook.test/api/auth/login');
		const response = await login({
			url,
			request: new Request(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ username, password })
			}),
			getClientAddress: () => crypto.randomUUID()
		} as never);
		expect(response.headers.get('cache-control')).toBe('no-store');
		const body = await response.json();
		expect(body.user.accountId).toBe(user!.user.accountId);
		const event = {
			url,
			request: new Request(url, {
				method: 'POST',
				headers: { authorization: `Bearer ${body.token}` }
			}),
			locals: {}
		};
		expect((await requireMobileAuth(event as never)).user).toEqual(user!.user);
		expect((await logout(event as never)).status).toBe(204);
		await expect(requireMobileAuth(event as never)).rejects.toMatchObject({ status: 401 });
	});
});
