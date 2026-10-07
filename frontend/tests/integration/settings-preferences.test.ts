import { afterAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db, pool } from '../../src/lib/server/db/client';
import { userProfiles } from '../../src/lib/server/db/schema';
import { authenticate } from '../../src/lib/server/auth/local';
import { validateSession } from '../../src/lib/server/auth/session';
import { defaultProfileCard } from '../../src/lib/profile/card';
import { actions } from '../../src/routes/settings/+page.server';
import { actions as cardActions } from '../../src/routes/settings/profile-card/+page.server';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('independent account preferences', () => {
	const accountIds: string[] = [];
	const register = async () => {
		const result = await authenticate(
			'register',
			`mage_${crypto.randomUUID().slice(0, 12)}`,
			'correct horse battery',
			{ artworkId: 'tide' }
		);
		accountIds.push(result!.user.accountId);
		return result!;
	};
	const submit = (
		user: Awaited<ReturnType<typeof register>>['user'],
		body: FormData,
		origin: string | null = 'https://spellbook.test',
		card = false
	) => {
		const url = new URL(`https://spellbook.test/settings${card ? '/profile-card' : ''}`);
		return (card ? cardActions : actions).default({
			url,
			locals: { user },
			request: new Request(url, { method: 'POST', headers: origin ? { origin } : {}, body })
		} as never);
	};
	const form = (values: Record<string, string>) => {
		const body = new FormData();
		for (const [key, value] of Object.entries(values)) body.set(key, value);
		return body;
	};
	afterAll(async () => {
		if (accountIds.length)
			await db.delete(userProfiles).where(inArray(userProfiles.accountId, accountIds));
		await pool.end();
	});
	it('saves trimmed optional contact email only for the current account and leaves login identity, avatar and card intact', async () => {
		const user = await register();
		const other = await register();
		const card = defaultProfileCard(user.user.username);
		await db
			.update(userProfiles)
			.set({ avatarId: 'slime', profileCard: card })
			.where(eq(userProfiles.accountId, user.user.accountId));
		const maximum = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
		for (const [email, storedEmail] of [
			[maximum, maximum],
			[' mage+contact@example.test ', 'mage+contact@example.test'],
			['', '']
		]) {
			expect(
				await submit(
					user.user,
					form({
						intent: 'email',
						email,
						accountId: other.user.accountId,
						avatarId: 'dragon',
						artworkId: 'astral',
						name: 'Ignored card'
					})
				)
			).toEqual({
				intent: 'email',
				success: true,
				message: 'Email saved.',
				savedEmail: storedEmail,
				errors: {}
			});
			const [stored] = await db
				.select()
				.from(userProfiles)
				.where(eq(userProfiles.accountId, user.user.accountId));
			expect(stored).toMatchObject({
				email: storedEmail,
				username: user.user.username,
				avatarId: 'slime',
				artworkId: 'tide',
				profileCard: card
			});
			expect(await validateSession(user.session.token)).toMatchObject({ email: storedEmail });
			expect(
				(await authenticate('login', user.user.username, 'correct horse battery'))?.user.email
			).toBe(storedEmail);
			expect((await validateSession(other.session.token))?.email).toBe('');
		}
	});
	it('rejects missing, non-text and invalid contact emails and unknown intents without writes', async () => {
		const user = await register();
		await db
			.update(userProfiles)
			.set({ email: 'original@example.test' })
			.where(eq(userProfiles.accountId, user.user.accountId));
		for (const email of [
			undefined,
			'not-an-email',
			'mage@',
			'@example.test',
			'mage@example',
			'mage @example.test',
			'mage@example..test',
			'mage@-example.test',
			'mage\0@example.test',
			'mage:name@example.test',
			'x'.repeat(255) + '@example.test'
		]) {
			const body = form({ intent: 'email' });
			if (email !== undefined) body.set('email', email);
			expect(await submit(user.user, body)).toMatchObject({
				status: 400,
				data: {
					intent: 'email',
					success: false,
					email: email ?? '',
					errors: { email: expect.any(String) }
				}
			});
		}
		const body = form({ intent: 'email' });
		body.set('email', new Blob(['mage@example.test']), 'email.txt');
		expect(await submit(user.user, body)).toMatchObject({ status: 400, data: { email: '' } });
		for (const intent of ['', 'card', 'unknown']) {
			expect(
				await submit(
					user.user,
					form({ intent, email: 'unexpected@example.test', avatarId: 'dragon' })
				)
			).toMatchObject({ status: 400, data: { success: false } });
		}
		expect((await validateSession(user.session.token))?.email).toBe('original@example.test');
	});
	it('rejects foreign or missing origins on both profile mutations without writes', async () => {
		const user = await register();
		for (const origin of [null, 'null', 'https://foreign.test']) {
			for (const card of [false, true])
				await expect(
					submit(user.user, form({ intent: 'avatar', avatarId: 'dragon' }), origin, card)
				).rejects.toMatchObject({ status: 403 });
		}
		expect(await validateSession(user.session.token)).toMatchObject({
			avatarId: 'wizard',
			artworkId: 'tide'
		});
	});
	it('ignores email and avatar fields when saving the complete card and artwork', async () => {
		const user = await register();
		await db
			.update(userProfiles)
			.set({ email: 'original@example.test', avatarId: 'slime' })
			.where(eq(userProfiles.accountId, user.user.accountId));
		const card = defaultProfileCard(user.user.username);
		const body = form({
			email: 'unexpected@example.test',
			avatarId: 'unknown',
			artworkId: 'astral'
		});
		for (const [key, value] of Object.entries(card)) {
			if (key === 'legendary') {
				if (value) body.set(key, 'on');
			} else body.set(key, String(value));
		}
		expect(await submit(user.user, body, 'https://spellbook.test', true)).toEqual({
			success: true,
			message: 'Profile card saved.',
			savedCard: { card, artworkId: 'astral' }
		});
		const [stored] = await db
			.select()
			.from(userProfiles)
			.where(eq(userProfiles.accountId, user.user.accountId));
		expect(stored).toMatchObject({
			email: 'original@example.test',
			avatarId: 'slime',
			artworkId: 'astral',
			profileCard: card
		});
	});
});
