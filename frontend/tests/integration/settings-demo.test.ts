import { webHandler, closeWebApplication } from './web-application.ts';
vi.mock('$app/server', async () => ({
	getRequestEvent: (await import('./web-application.ts')).getWebRequestEvent
}));
import { hashSessionToken } from '@spellbook/backend/auth/session.ts';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db, pool } from '../fixtures/database.ts';
import { authSessions, localCredentials, userProfiles } from '@spellbook/backend/db/schema.ts';
import { authenticate } from './web-application.ts';
import { hashPassword } from '@spellbook/backend/auth/password.ts';
import { createSession, validateSession } from './web-application.ts';
import {
	actions as rawActions,
	load as rawLoad
} from '../../src/routes/settings/password/+page.server';
import { application } from './web-application.ts';
import { defaultProfileCard, demoProfileCard } from '../../src/lib/profile/card';

async function actor(accountId: string) {
	const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
	await db.insert(authSessions).values({
		accountId,
		tokenHash: hashSessionToken(token),
		expiresAt: new Date(Date.now() + 60000)
	});
	return (await validateSession(token))!;
}
const actions = { default: webHandler(rawActions.default!) };
const load = webHandler(rawLoad);
const run =
	process.env.TEST_DATABASE_URL && process.env.DEMO_MODE === 'true' ? describe : describe.skip;
run('immutable demo password', () => {
	const accountId = `demo-password-${crypto.randomUUID()}`;
	const cardAccountId = `demo-card-${crypto.randomUUID()}`;
	const normalAccountId = `normal-card-${crypto.randomUUID()}`;
	afterAll(async () => {
		await db
			.delete(userProfiles)
			.where(inArray(userProfiles.accountId, [accountId, cardAccountId, normalAccountId]));
		await closeWebApplication();
		await pool.end();
	});
	it('supplies the Demo card only as an unsaved demo fallback and retains saved and normal cards', async () => {
		await db.insert(userProfiles).values([
			{ accountId: cardAccountId, username: 'demo', artworkId: 'tide' },
			{ accountId: normalAccountId, username: 'mage' }
		]);
		expect((await application.profile.get(await actor(cardAccountId))).card).toEqual(
			demoProfileCard()
		);
		expect((await application.profile.get(await actor(normalAccountId))).card).toEqual(
			defaultProfileCard('mage')
		);
		const custom = {
			...defaultProfileCard('demo'),
			name: 'Saved demo design',
			frame: 'blue' as const
		};
		await db
			.update(userProfiles)
			.set({ profileCard: custom })
			.where(eq(userProfiles.accountId, cardAccountId));
		expect((await application.profile.get(await actor(cardAccountId))).card).toEqual(custom);
		const [stored] = await db
			.select()
			.from(userProfiles)
			.where(eq(userProfiles.accountId, cardAccountId));
		expect(stored.artworkId).toBe('tide');
	});
	it('rejects password changes and preserves demo/demo and its sessions', async () => {
		const passwordHash = await hashPassword('demo');
		await db.insert(userProfiles).values({ accountId, username: 'demo' });
		await db.insert(localCredentials).values({ accountId, username: 'demo', passwordHash });
		const session = await createSession(accountId, passwordHash);
		const user = await validateSession(session!.token);
		const url = new URL('https://spellbook.test/settings/password');
		const cookies = { set: vi.fn() };
		const event = {
			url,
			locals: { user },
			cookies,
			getClientAddress: () => crypto.randomUUID(),
			request: new Request(url, {
				method: 'POST',
				headers: { origin: url.origin },
				body: new URLSearchParams({
					currentPassword: 'demo',
					newPassword: 'replacement demo password',
					confirmPassword: 'replacement demo password'
				})
			})
		};
		expect(await load(event as never)).toEqual({ demoMode: true });
		expect(await actions.default(event as never)).toMatchObject({
			status: 403,
			data: { success: false, errors: {} }
		});
		expect(cookies.set).not.toHaveBeenCalled();
		expect(await validateSession(session!.token)).toEqual(user);
		const [credential] = await db
			.select()
			.from(localCredentials)
			.where(eq(localCredentials.accountId, accountId));
		expect(credential.passwordHash).toBe(passwordHash);
		expect((await authenticate('login', 'demo', 'demo'))?.user.accountId).toBe(accountId);
	});
});
