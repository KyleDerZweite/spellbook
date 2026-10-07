import { afterAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { savedStateBody } from '../../src/lib/server/saved-state/stream.ts';
import { createDatabase, createLocalAuth, createSavedState } from '@spellbook/backend';
if (process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_URL !== process.env.DATABASE_URL)
	throw Error('SavedState tests require matching disposable database URLs');
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('committed SavedState account invalidation', () => {
	const database = createDatabase(process.env.TEST_DATABASE_URL!);
	const auth = createLocalAuth(database.db, { demoMode: false });
	const sync = createSavedState(process.env.TEST_DATABASE_URL!, auth);
	const accounts: string[] = [];
	afterAll(async () => {
		await sync.close();
		if (accounts.length)
			await database.pool.query('DELETE FROM user_profiles WHERE account_id=ANY($1::text[])', [
				accounts
			]);
		await database.pool.end();
	});
	it('subscribes before reset and delivers only committed account topics', async () => {
		const a = (await auth.authenticate(
			'register',
			`sync_${crypto.randomUUID().slice(0, 8)}`,
			'saved-state-test-password'
		))!;
		accounts.push(a.user.accountId);
		const stream = await sync.subscribe(a.user);
		expect(await stream.next()).toEqual({ event: 'reset', data: {} });
		const tx = await database.pool.connect();
		try {
			await tx.query('BEGIN');
			await tx.query('UPDATE user_profiles SET email=$2 WHERE account_id=$1', [
				a.user.accountId,
				'rollback@example.test'
			]);
			await tx.query('ROLLBACK');
			await tx.query('BEGIN');
			await tx.query('UPDATE user_profiles SET email=$2 WHERE account_id=$1', [
				a.user.accountId,
				'commit@example.test'
			]);
			await tx.query('COMMIT');
			expect(await stream.next()).toEqual({ event: 'invalidate', data: { topics: ['profile'] } });
		} finally {
			tx.release();
			stream.close();
		}
	}, 10000);
	it('coalesces protected topics and discards them on direct session revocation', async () => {
		const a = (await auth.authenticate(
			'register',
			`sync_${crypto.randomUUID().slice(0, 8)}`,
			'saved-state-test-password'
		))!;
		accounts.push(a.user.accountId);
		const sub = await sync.subscribe(a.user);
		await sub.next();
		for (let index = 0; index < 100; index++)
			await database.pool.query('SELECT pg_notify($1,$2)', [
				'spellbook_saved_state',
				JSON.stringify({
					accountId: a.user.accountId,
					topic: ['profile', 'inventory', 'decks', 'scan'][index % 4]
				})
			]);
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(sync.diagnostics().queuedEvents).toBe(1);
		expect(await sub.next()).toEqual({
			event: 'invalidate',
			data: { topics: ['profile', 'inventory', 'decks', 'scan'] }
		});
		await database.pool.query('UPDATE user_profiles SET avatar_id=$2 WHERE account_id=$1', [
			a.user.accountId,
			'dragon'
		]);
		await auth.revokeSession(a.session.token);
		expect(await sub.next()).toEqual({ event: 'auth-expired', data: {} });
		expect(sync.diagnostics().subscribers).toBe(0);
		expect(await sub.next()).toBeNull();
	});
	it('records a committed change between subscription registration and first reset delivery', async () => {
		const a = (await auth.authenticate(
			'register',
			`sync_${crypto.randomUUID().slice(0, 8)}`,
			'saved-state-test-password'
		))!;
		accounts.push(a.user.accountId);
		await expect(sync.subscribe({ ...a.user })).rejects.toMatchObject({ kind: 'Unauthenticated' });
		const sub = await sync.subscribe(a.user);
		try {
			await database.pool.query('UPDATE user_profiles SET artwork_id=$2 WHERE account_id=$1', [
				a.user.accountId,
				'ember'
			]);
			expect(await sub.next()).toEqual({ event: 'reset', data: {} });
			expect(await sub.next()).toEqual({ event: 'invalidate', data: { topics: ['profile'] } });
		} finally {
			sub.close();
		}
	});
	it('discards an already reserved protected event when authority is revoked before actual delivery', async () => {
		const a = (await auth.authenticate(
			'register',
			`sync_${crypto.randomUUID().slice(0, 8)}`,
			'saved-state-test-password'
		))!;
		accounts.push(a.user.accountId);
		const sub = await sync.subscribe(a.user);
		const reset = await sub.next();
		expect(await sub.deliver(reset!)).toEqual({ event: 'reset', data: {} });
		await database.pool.query('UPDATE user_profiles SET email=$2 WHERE account_id=$1', [
			a.user.accountId,
			'reserved@example.test'
		]);
		const reserved = await sub.next();
		expect(reserved).toEqual({ event: 'invalidate', data: { topics: ['profile'] } });
		await auth.revokeSession(a.session.token);
		expect(await sub.deliver(reserved!)).toEqual({ event: 'auth-expired', data: {} });
		expect(await sub.next()).toBeNull();
		expect(sync.diagnostics().subscribers).toBe(0);
	});
	it('writes no reserved protected HTTP frame after revocation across a retained heartbeat promise', async () => {
		const a = (await auth.authenticate(
			'register',
			`sync_${crypto.randomUUID().slice(0, 8)}`,
			'saved-state-test-password'
		))!;
		accounts.push(a.user.accountId);
		const sub = await sync.subscribe(a.user);
		const controller = new AbortController();
		const reader = savedStateBody(sub, controller.signal).getReader();
		let resume!: () => void;
		const paused = new Promise<void>((resolve) => {
			resume = resolve;
		});
		let heartbeat!: () => void;
		const held = new Promise<void>((resolve) => {
			heartbeat = resolve;
		});
		const server = createHttpServer((_request, response) => {
			response.writeHead(200, { 'Content-Type': 'text/event-stream' });
			void (async () => {
				// Two real downstream pulls write reset and heartbeat. Stop pulling while next() resolves.
				response.write((await reader.read()).value!);
				response.write((await reader.read()).value!);
				heartbeat();
				await paused;
				for (;;) {
					const item = await reader.read();
					if (item.done) break;
					response.write(item.value);
				}
				response.end();
			})().catch(() => response.destroy());
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		if (!address || typeof address === 'string') throw Error('Missing HTTP test port');
		try {
			const response = await fetch(`http://127.0.0.1:${address.port}`);
			const received = response.text();
			await held;
			await database.pool.query('UPDATE user_profiles SET email=$2 WHERE account_id=$1', [
				a.user.accountId,
				'held@example.test'
			]);
			await new Promise((resolve) => setTimeout(resolve, 200));
			await auth.revokeSession(a.session.token);
			resume();
			const frames = await received;
			expect(frames).toContain('event: reset');
			expect(frames).toContain(': heartbeat');
			expect(frames).toContain('event: auth-expired');
			expect(frames).not.toContain('event: invalidate');
		} finally {
			resume();
			controller.abort();
			sub.close();
			server.closeAllConnections();
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	}, 25000);

	it('cancels a subscription during a stalled real TCP PostgreSQL handshake without a late attachment', async () => {
		const a = (await auth.authenticate(
			'register',
			`sync_${crypto.randomUUID().slice(0, 8)}`,
			'saved-state-test-password'
		))!;
		accounts.push(a.user.accountId);
		const sockets = new Set<import('node:net').Socket>();
		const stalled = createServer((socket) => {
			sockets.add(socket);
			socket.on('close', () => sockets.delete(socket));
		});
		await new Promise<void>((resolve) => stalled.listen(0, '127.0.0.1', resolve));
		const address = stalled.address();
		if (!address || typeof address === 'string') throw Error('Missing test listener port');
		const url = new URL(process.env.TEST_DATABASE_URL!);
		url.hostname = '127.0.0.1';
		url.port = String(address.port);
		url.searchParams.set('sslmode', 'disable');
		const delayed = createSavedState(url.toString(), auth);
		const controller = new AbortController();
		const started = delayed.subscribe(a.user, {
			get aborted() {
				return controller.signal.aborted;
			},
			onAbort(listener) {
				controller.signal.addEventListener('abort', listener);
				return () => controller.signal.removeEventListener('abort', listener);
			}
		});
		const rejected = expect(started).rejects.toThrow('cancelled');
		try {
			for (let attempt = 0; !delayed.diagnostics().subscribers && attempt < 100; attempt++)
				await new Promise((resolve) => setTimeout(resolve, 10));
			expect(delayed.diagnostics().subscribers).toBe(1);
			controller.abort();
			await rejected;
			expect(delayed.diagnostics().subscribers).toBe(0);
			await new Promise((resolve) => setTimeout(resolve, 5200));
			expect(delayed.diagnostics().subscribers).toBe(0);
		} finally {
			await delayed.close();
			for (const socket of sockets) socket.destroy();
			await new Promise<void>((resolve) => stalled.close(() => resolve()));
		}
	}, 10000);

	it('bounds undrained invalidations and disposes a slow subscription without stalling another client', async () => {
		const a = (await auth.authenticate(
			'register',
			`sync_${crypto.randomUUID().slice(0, 8)}`,
			'saved-state-test-password'
		))!;
		accounts.push(a.user.accountId);
		const slow = await sync.subscribe(a.user),
			healthy = await sync.subscribe(a.user);
		await slow.next();
		await healthy.next();
		await database.pool.query('UPDATE user_profiles SET artwork_id=$2 WHERE account_id=$1', [
			a.user.accountId,
			'tide'
		]);
		expect(await healthy.next()).toEqual({ event: 'invalidate', data: { topics: ['profile'] } });
		expect(sync.diagnostics().queuedEvents).toBe(1);
		await new Promise((resolve) => setTimeout(resolve, 30500));
		expect(await slow.next()).toBeNull();
		expect(sync.diagnostics().subscribers).toBe(1);
		await database.pool.query('UPDATE user_profiles SET artwork_id=$2 WHERE account_id=$1', [
			a.user.accountId,
			'astral'
		]);
		expect(await healthy.next()).toEqual({ event: 'invalidate', data: { topics: ['profile'] } });
		healthy.close();
	}, 40000);
});
