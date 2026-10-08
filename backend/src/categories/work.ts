import {
	configureComboAdapter,
	comboAdapterEnabled,
	configureComboReadOnly
} from './combo-settings.ts';
import { performance } from 'node:perf_hooks';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import type { Pool, PoolClient } from 'pg';
import type { Database, Transaction } from '../db/client.ts';
import * as schema from '../db/schema.ts';

export class CategoryUnavailable extends Error {
	readonly kind = 'CategoryUnavailable';
	constructor() {
		super('Category work is temporarily unavailable. Retry the same request.');
	}
}
// These are operational budgets, not limits on saved Library or Deck membership.
export const categoryWorkLimits = {
	poolMs: 2000,
	lockMs: 2000,
	statementMs: 5000,
	transactionMs: 10000,
	decodedBytes: 16 * 1024 * 1024
};
const deadlines = new WeakMap<Transaction, number>();
export function categoryCheckpoint(tx: Transaction, bytes = 0) {
	if (
		performance.now() >= (deadlines.get(tx) ?? Infinity) ||
		bytes > categoryWorkLimits.decodedBytes
	)
		throw new CategoryUnavailable();
}
export function categoryJson(tx: Transaction, value: unknown) {
	categoryCheckpoint(tx);
	const json = JSON.stringify(value);
	categoryCheckpoint(tx, Buffer.byteLength(json));
	return json;
}
/** Own acquisition, SQL deadlines and connection teardown before exposing an operational failure. */
export async function categoryTransaction<T>(
	db: Database,
	run: (tx: Transaction) => Promise<T>,
	options?: Parameters<Database['transaction']>[1],
	lifetime?: { waitForAcquisition?: boolean; signal?: AbortSignal }
): Promise<T> {
	const pool = db.$client as Pool;
	// Avoid accumulating expired acquisition requests behind an exhausted shared pool.
	if (pool.idleCount === 0 && pool.totalCount >= (pool.options.max ?? 10))
		throw new CategoryUnavailable();
	let acquisitionExpired = false;
	let acquisitionTimer: ReturnType<typeof setTimeout> | undefined;
	const acquisition = pool
		.connect()
		.catch(() => {
			throw new CategoryUnavailable();
		})
		.then((client) => {
			if (acquisitionExpired) {
				client.release();
				throw new CategoryUnavailable();
			}
			return client;
		});
	let client: PoolClient;
	try {
		client = await Promise.race([
			acquisition,
			new Promise<never>((_, reject) => {
				acquisitionTimer = setTimeout(() => {
					acquisitionExpired = true;
					reject(new CategoryUnavailable());
				}, categoryWorkLimits.poolMs);
			})
		]).finally(() => clearTimeout(acquisitionTimer));
	} catch (cause) {
		// Runners retain their slot through a late pool connection and its release.
		if (lifetime?.waitForAcquisition) await acquisition.catch(() => {});
		throw cause;
	}
	let destroyed = false;
	const deadline = performance.now() + categoryWorkLimits.transactionMs;
	const terminate = () => {
		if (!destroyed) {
			destroyed = true;
			const ownedErrorListeners = new Set(client.listeners('error'));
			client.release(true);
			// pg-pool adds its idle handler even when destroying a leased client.
			// This connection still belongs to this failed work until it closes.
			for (const listener of client.listeners('error'))
				if (!ownedErrorListeners.has(listener)) client.removeListener('error', listener);
		}
	};
	client.on('error', terminate);
	const timer = setTimeout(terminate, categoryWorkLimits.transactionMs);
	try {
		return await drizzle(client, { schema }).transaction(async (tx) => {
			deadlines.set(tx, deadline);
			configureComboAdapter(tx, comboAdapterEnabled(db));
			configureComboReadOnly(tx, options?.accessMode === 'read only');
			lifetime?.signal?.throwIfAborted();
			await tx.execute(
				sql`SELECT set_config('lock_timeout',${String(categoryWorkLimits.lockMs)},true),set_config('statement_timeout',${String(categoryWorkLimits.statementMs)},true),set_config('idle_in_transaction_session_timeout',${String(categoryWorkLimits.transactionMs)},true),set_config('transaction_timeout',${String(categoryWorkLimits.transactionMs)},true)`
			);
			const result = await run(tx);
			categoryCheckpoint(tx);
			lifetime?.signal?.throwIfAborted();
			// Stop the work cancellation timer before Drizzle issues COMMIT. Await its actual result.
			clearTimeout(timer);
			return result;
		}, options);
	} catch (cause) {
		let failure = cause;
		while (failure && typeof failure === 'object' && 'cause' in failure && failure.cause)
			failure = failure.cause;
		if (
			destroyed ||
			(failure &&
				typeof failure === 'object' &&
				'code' in failure &&
				['55P03', '57014', '25P03', '25P04'].includes(String(failure.code)))
		)
			throw new CategoryUnavailable();
		throw cause;
	} finally {
		clearTimeout(timer);
		if (!destroyed) {
			client.removeListener('error', terminate);
			client.release();
		}
	}
}
