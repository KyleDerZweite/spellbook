import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Database, Transaction } from '@spellbook/backend/db/client.ts';
import {
	createWholeDeckCategoryRunner,
	processWholeDeckJob,
	type WholeDeckJobClaim
} from '@spellbook/backend/categories/jobs.ts';
import { categoryTransaction, categoryWorkLimits } from '@spellbook/backend/categories/work.ts';

const transaction = vi.hoisted(() => ({
	tx: undefined as Transaction | undefined,
	commits: 0,
	rollbacks: 0
}));
vi.mock('drizzle-orm/node-postgres', () => ({
	drizzle: () => ({
		transaction: async (run: (tx: Transaction) => Promise<unknown>) => {
			try {
				const result = await run(transaction.tx!);
				transaction.commits++;
				return result;
			} catch (error) {
				transaction.rollbacks++;
				throw error;
			}
		}
	})
}));
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
function database(connect: () => Promise<unknown>) {
	return {
		$client: { connect: vi.fn(connect), idleCount: 0, totalCount: 0, options: { max: 10 } }
	} as unknown as Database;
}
function client() {
	return Object.assign(new EventEmitter(), { release: vi.fn() });
}
const claim: WholeDeckJobClaim = {
	deckId: '10000000-0000-0000-0000-000000000001',
	accountId: 'account',
	generation: '1',
	compositionRevision: '2',
	decisionRevision: '3',
	leaseToken: '20000000-0000-0000-0000-000000000001',
	attempts: 1
};
function scriptedTransaction(generation = '1') {
	const rows = [
		[],
		[],
		[{ composition_revision: '2' }],
		[{ decision_revision: '3' }],
		[
			{
				generation,
				lease_token: claim.leaseToken,
				composition_revision: '2',
				decision_revision: '3'
			}
		],
		[]
	];
	const execute = vi.fn(async () => ({ rows: rows.shift() ?? [] }));
	transaction.tx = { execute } as unknown as Transaction;
	transaction.commits = 0;
	transaction.rollbacks = 0;
	return execute;
}
afterEach(() => vi.useRealTimers());

describe('whole Category physical work owner', () => {
	it('keeps ordinary pool deadlines while releasing a late client', async () => {
		vi.useFakeTimers();
		const acquisition = deferred<ReturnType<typeof client>>(),
			db = database(() => acquisition.promise),
			late = client();
		const run = vi.fn(async () => undefined);
		const result = expect(categoryTransaction(db, run)).rejects.toMatchObject({
			kind: 'CategoryUnavailable'
		});
		await vi.advanceTimersByTimeAsync(categoryWorkLimits.poolMs);
		await result;
		acquisition.resolve(late);
		await vi.advanceTimersByTimeAsync(0);
		expect(late.release).toHaveBeenCalledOnce();
		expect(run).not.toHaveBeenCalled();
	});
	it('holds admission and close through a pool acquisition that ignores its timeout', async () => {
		vi.useFakeTimers();
		const acquisition = deferred<ReturnType<typeof client>>(),
			db = database(() => acquisition.promise),
			late = client();
		const runner = createWholeDeckCategoryRunner(db, vi.fn(), { pollMs: 1 });
		runner.start();
		runner.start();
		await vi.advanceTimersByTimeAsync(10000);
		expect(db.$client.connect).toHaveBeenCalledOnce();
		let closed = false;
		const closing = runner.close().then(() => {
			closed = true;
		});
		expect(runner.close()).toBe(runner.close());
		await vi.advanceTimersByTimeAsync(10000);
		expect(closed).toBe(false);
		acquisition.resolve(late);
		await closing;
		expect(late.release).toHaveBeenCalledOnce();
		runner.start();
		await vi.advanceTimersByTimeAsync(10000);
		expect(db.$client.connect).toHaveBeenCalledOnce();
	});
	it('retries only after the previous late acquisition physically settles', async () => {
		vi.useFakeTimers();
		const acquisition = deferred<ReturnType<typeof client>>(),
			db = database(() => acquisition.promise);
		const runner = createWholeDeckCategoryRunner(db, vi.fn(), { pollMs: 10 });
		runner.start();
		await vi.advanceTimersByTimeAsync(10000);
		expect(db.$client.connect).toHaveBeenCalledOnce();
		acquisition.resolve(client());
		await vi.advanceTimersByTimeAsync(0);
		expect(db.$client.connect).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(10);
		expect(db.$client.connect).toHaveBeenCalledTimes(2);
		await runner.close();
	});
	it('rolls back ignored evaluation cancellation before deleting or committing', async () => {
		const execute = scriptedTransaction(),
			owned = client(),
			db = database(async () => owned);
		const evaluation = deferred<{ changed: boolean }>(),
			controller = new AbortController();
		const evaluate = vi.fn(() => evaluation.promise);
		const processing = processWholeDeckJob(db, claim, evaluate, controller.signal);
		await vi.waitFor(() => expect(evaluate).toHaveBeenCalledOnce());
		controller.abort();
		evaluation.resolve({ changed: true });
		await expect(processing).rejects.toMatchObject({ name: 'AbortError' });
		expect(execute).toHaveBeenCalledTimes(5);
		expect(transaction.commits).toBe(0);
		expect(transaction.rollbacks).toBe(1);
		expect(owned.release).toHaveBeenCalledOnce();
	});
	it('close waits for an ignored evaluator and prevents its publication', async () => {
		vi.useFakeTimers();
		const rows = [
			[],
			[
				{
					deck_id: claim.deckId,
					account_id: claim.accountId,
					generation: '1',
					composition_revision: '2',
					decision_revision: '3',
					attempts: 1
				}
			],
			[],
			[],
			[{ composition_revision: '2' }],
			[{ decision_revision: '3' }]
		];
		const execute = vi.fn(async () => ({
			rows: rows.shift() ?? [
				{ generation: '1', lease_token: token, composition_revision: '2', decision_revision: '3' }
			]
		}));
		const token = '20000000-0000-0000-0000-000000000001';
		const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue(token);
		transaction.tx = { execute } as unknown as Transaction;
		transaction.commits = 0;
		transaction.rollbacks = 0;
		const evaluation = deferred<{ changed: boolean }>(),
			evaluate = vi.fn(() => evaluation.promise);
		const db = database(async () => client());
		const runner = createWholeDeckCategoryRunner(db, evaluate, { pollMs: 1 });
		runner.start();
		await vi.advanceTimersByTimeAsync(0);
		expect(evaluate).toHaveBeenCalledOnce();
		let closed = false;
		const closing = runner.close().then(() => {
			closed = true;
		});
		await vi.advanceTimersByTimeAsync(100);
		expect(closed).toBe(false);
		expect(db.$client.connect).toHaveBeenCalledTimes(2);
		evaluation.resolve({ changed: true });
		await closing;
		expect(transaction.commits).toBe(1);
		expect(transaction.rollbacks).toBe(1);
		expect(execute).toHaveBeenCalledTimes(7);
		await vi.advanceTimersByTimeAsync(10000);
		expect(db.$client.connect).toHaveBeenCalledTimes(2);
		uuid.mockRestore();
	});
	it('skips a superseded claim without evaluating or deleting its new generation', async () => {
		const execute = scriptedTransaction('2'),
			evaluate = vi.fn();
		await processWholeDeckJob(
			database(async () => client()),
			claim,
			evaluate
		);
		expect(evaluate).not.toHaveBeenCalled();
		expect(execute).toHaveBeenCalledTimes(5);
	});
	it('finishes semantic Unknown normally and releases the current job', async () => {
		const execute = scriptedTransaction(),
			evaluate = vi.fn(async () => ({ changed: false }));
		await processWholeDeckJob(
			database(async () => client()),
			claim,
			evaluate
		);
		expect(evaluate).toHaveBeenCalledOnce();
		expect(execute).toHaveBeenCalledTimes(6);
		expect(transaction.commits).toBe(1);
	});
});
