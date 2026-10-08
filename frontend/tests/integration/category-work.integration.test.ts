import { describe, it, expect } from 'vitest';
import { createServer, createConnection, type Socket } from 'node:net';
import { sql } from 'drizzle-orm';
import { createDatabase } from '@spellbook/backend';
import {
	categoryTransaction,
	categoryCheckpoint,
	categoryWorkLimits
} from '@spellbook/backend/categories/work.ts';
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('Categories operational transaction ownership', () => {
	it('rejects an exhausted pool without accumulating queued requests or running work', async () => {
		const database = createDatabase(process.env.TEST_DATABASE_URL!);
		const held = await Promise.all(Array.from({ length: 10 }, () => database.pool.connect()));
		let ran = false;
		const started = performance.now();
		try {
			await expect(
				categoryTransaction(database.db, async () => {
					ran = true;
				})
			).rejects.toMatchObject({ kind: 'CategoryUnavailable' });
			expect(performance.now() - started).toBeLessThan(4000);
		} finally {
			held.forEach((client) => client.release());
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(ran).toBe(false);
		expect(database.pool.waitingCount).toBe(0);
		expect(
			await categoryTransaction(
				database.db,
				async (tx) => (await tx.execute(sql`SELECT 1 AS ok`)).rows[0].ok
			)
		).toBe(1);
		await database.pool.end();
	});
	it('rejects a decoded budget overrun after a write and proves rollback before rejection', async () => {
		const database = createDatabase(process.env.TEST_DATABASE_URL!);
		try {
			await expect(
				categoryTransaction(database.db, async (tx) => {
					await tx.execute(sql`CREATE TABLE category16_budget_probe(id integer)`);
					categoryCheckpoint(tx, categoryWorkLimits.decodedBytes + 1);
				})
			).rejects.toMatchObject({ kind: 'CategoryUnavailable' });
			expect(
				(await database.pool.query("SELECT to_regclass('category16_budget_probe') AS id")).rows[0]
					.id
			).toBeNull();
		} finally {
			await database.pool.end();
		}
	});
	it('cancels long SQL and rolls back all earlier writes before returning a safe failure', async () => {
		const database = createDatabase(process.env.TEST_DATABASE_URL!);
		try {
			await expect(
				categoryTransaction(database.db, async (tx) => {
					await tx.execute(sql`CREATE TABLE category16_sql_probe(id integer)`);
					await tx.execute(sql`SELECT pg_sleep(30)`);
				})
			).rejects.toMatchObject({ kind: 'CategoryUnavailable' });
			expect(
				(await database.pool.query("SELECT to_regclass('category16_sql_probe') AS id")).rows[0].id
			).toBeNull();
		} finally {
			await database.pool.end();
		}
	}, 8000);
	it('destroys an expired transaction, waits for rejection and cannot later commit after asynchronous work resumes', async () => {
		const database = createDatabase(process.env.TEST_DATABASE_URL!);
		try {
			await expect(
				categoryTransaction(database.db, async (tx) => {
					await tx.execute(sql`CREATE TABLE category16_deadline_probe(id integer)`);
					await new Promise((resolve) =>
						setTimeout(resolve, categoryWorkLimits.transactionMs + 100)
					);
					await tx.execute(sql`INSERT INTO category16_deadline_probe VALUES(1)`);
				})
			).rejects.toMatchObject({ kind: 'CategoryUnavailable' });
			expect(
				(await database.pool.query("SELECT to_regclass('category16_deadline_probe') AS id")).rows[0]
					.id
			).toBeNull();
		} finally {
			await database.pool.end();
		}
	}, 13000);
	it('bounds actual PG connection establishment and releases a late connection without running work', async () => {
		const target = new URL(process.env.TEST_DATABASE_URL!),
			sockets = new Set<Socket>(),
			timers = new Set<ReturnType<typeof setTimeout>>();
		const server = createServer((socket) => {
			sockets.add(socket);
			socket.on('error', () => {});
			socket.on('close', () => sockets.delete(socket));
			const timer = setTimeout(() => {
				timers.delete(timer);
				if (socket.destroyed) return;
				const remote = createConnection({
					host: target.hostname,
					port: Number(target.port || 5432)
				});
				sockets.add(remote);
				remote.on('error', () => socket.destroy());
				remote.on('close', () => {
					sockets.delete(remote);
					socket.destroy();
				});
				socket.on('close', () => remote.destroy());
				socket.pipe(remote).pipe(socket);
			}, 2500);
			timers.add(timer);
		});
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(5247, '127.0.0.1', resolve);
		});
		const proxy = new URL(target);
		proxy.hostname = '127.0.0.1';
		proxy.port = '5247';
		const database = createDatabase(proxy.toString());
		let ran = false;
		try {
			const started = performance.now();
			await expect(
				categoryTransaction(database.db, async () => {
					ran = true;
				})
			).rejects.toMatchObject({ kind: 'CategoryUnavailable' });
			expect(performance.now() - started).toBeGreaterThanOrEqual(1900);
			expect(performance.now() - started).toBeLessThan(3500);
			await new Promise((resolve) => setTimeout(resolve, 700));
			expect(ran).toBe(false);
			expect(database.pool.idleCount).toBe(1);
			expect(
				await categoryTransaction(
					database.db,
					async (tx) => (await tx.execute(sql`SELECT current_database() AS name`)).rows[0].name
				)
			).toBe(target.pathname.slice(1));
		} finally {
			await database.pool.end();
			for (const timer of timers) clearTimeout(timer);
			for (const socket of sockets) socket.destroy();
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	}, 6000);
});
