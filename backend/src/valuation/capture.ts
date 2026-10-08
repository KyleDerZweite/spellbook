import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryConfig, QueryResult } from 'pg';
import type { ReferenceExecutor, FrozenReferenceOutcome } from './read.ts';
import {
	type createInventoryValues,
	readHoldings,
	uniqueHoldingPairs,
	pairKey,
	estimateHoldings
} from './inventory-value.ts';
import type { PriceReference } from '@spellbook/contracts/valuation.ts';

const leaseKey = '78173020462008';
export const VALUE_CAPTURE_INTERVAL_MS = 10000;
export const VALUE_CAPTURE_STATEMENT_MS = 10000;
interface CalendarRow extends Record<string, unknown> {
	observed_at: Date;
	day: string;
	day_start: Date;
	day_end: Date;
	eligible: boolean;
}
export interface CaptureResult {
	capturedAccounts: number;
	capturedHoldings: number;
	copiedReferences: number;
	failedAccounts: number;
}
/** Clock overrides and barriers are only for controlled acceptance tests. */
export interface CaptureTestControls {
	observationClock?: () => Date;
	accountIds?: string[];
	admissionTimeoutMs?: number;
	afterBatch?: (batch: number, client: PoolClient) => Promise<void>;
	beforeCommit?: (client: PoolClient) => Promise<void>;
}
export function createValueHistoryRunner(
	pool: Pool,
	values: ReturnType<typeof createInventoryValues>,
	tests: CaptureTestControls = {}
) {
	let timer: ReturnType<typeof setInterval> | undefined;
	let running: Promise<CaptureResult> | undefined;
	let controller: AbortController | undefined;
	let admission: Promise<PoolClient> | undefined;
	let closed = false;
	async function capture(signal: AbortSignal): Promise<CaptureResult> {
		const result: CaptureResult = {
			capturedAccounts: 0,
			capturedHoldings: 0,
			copiedReferences: 0,
			failedAccounts: 0
		};
		if (admission) throw Error('Value runner connection admission pending');
		const connection = pool.connect();
		admission = connection;
		const client = await new Promise<PoolClient>((resolve, reject) => {
			let settled = false;
			const cleanup = () => {
				clearTimeout(timeout);
				signal.removeEventListener('abort', abort);
			};
			const fail = (message: string) => {
				if (settled) return;
				settled = true;
				cleanup();
				reject(Error(message));
			};
			const abort = () => fail('Value runner cancelled');
			const timeout = setTimeout(
				() => fail('Value runner connection unavailable'),
				tests.admissionTimeoutMs ?? VALUE_CAPTURE_STATEMENT_MS
			);
			signal.addEventListener('abort', abort, { once: true });
			if (signal.aborted) abort();
			connection.then(
				(value) => {
					// A timed-out/cancelled acquisition owns no lease; release any later admitted connection.
					if (settled) {
						value.release();
						admission = undefined;
					} else {
						settled = true;
						cleanup();
						admission = undefined;
						resolve(value);
					}
				},
				(cause) => {
					admission = undefined;
					if (!settled) {
						settled = true;
						cleanup();
						reject(cause);
					}
				}
			);
		});
		let lease = false,
			transaction = false,
			lost = false;
		const connectionLost = () => {
			lost = true;
			controller?.abort();
		};
		async function query<Row extends Record<string, unknown> = Record<string, unknown>>(
			text: string,
			parameters?: unknown[]
		): Promise<QueryResult<Row>> {
			if (lost) throw Error('Capture connection lost');
			try {
				const config: QueryConfig & { query_timeout: number } = {
					text,
					values: parameters,
					query_timeout: VALUE_CAPTURE_STATEMENT_MS + 1000
				};
				return await client.query<Row>(config);
			} catch (cause) {
				if (cause instanceof Error && cause.message === 'Query read timeout') lost = true;
				throw cause;
			}
		}
		const executor: ReferenceExecutor = { query };
		client.on('error', connectionLost);
		client.on('end', connectionLost);
		const check = () => {
			signal.throwIfAborted();
			if (lost) throw Error('Capture connection lost');
		};
		try {
			check();
			await query(`SET statement_timeout = '${VALUE_CAPTURE_STATEMENT_MS}ms'`);
			lease = (
				await query<{ acquired: boolean }>('SELECT pg_try_advisory_lock($1::bigint) AS acquired', [
					leaseKey
				])
			).rows[0].acquired;
			if (!lease) return result;
			async function* eligibleAccounts() {
				let after = '';
				for (;;) {
					check();
					const accounts = (
						await query<{ account_id: string }>(
							'SELECT account_id FROM user_profiles WHERE account_id > $1 AND ($2::text[] IS NULL OR account_id=ANY($2::text[])) ORDER BY account_id LIMIT 200',
							[after, tests.accountIds ?? null]
						)
					).rows;
					for (const account of accounts) yield account;
					if (accounts.length < 200) return;
					after = accounts.at(-1)!.account_id;
				}
			}
			for await (const account of eligibleAccounts()) {
				try {
					check();
					await query('BEGIN ISOLATION LEVEL REPEATABLE READ');
					transaction = true;
					await query(`SET LOCAL statement_timeout = '${VALUE_CAPTURE_STATEMENT_MS}ms'`);
					// This is the first snapshot statement. A clock read before BEGIN would permit late backfill.
					const observed = tests.observationClock?.();
					const calendar = (
						await query<CalendarRow>(
							`WITH observation AS (SELECT ${observed ? '$2::timestamptz' : 'statement_timestamp()'} AS observed_at), bounds AS (SELECT observed_at,(observed_at AT TIME ZONE $1)::date AS day FROM observation), calendar AS (SELECT observed_at,day,day::timestamp AT TIME ZONE $1 AS day_start,(day+1)::timestamp AT TIME ZONE $1 AS day_end FROM bounds) SELECT observed_at,day::text,day_start,day_end,observed_at >= day_end - interval '60 seconds' AND observed_at < day_end AS eligible FROM calendar`,
							observed ? [values.timezone, observed.toISOString()] : [values.timezone]
						)
					).rows[0];
					if (!calendar.eligible) {
						await query('ROLLBACK');
						transaction = false;
						break;
					}
					const existing = (
						await query<{
							id: string;
							timezone: string;
							observed_at: Date;
							day_start: Date;
							day_end: Date;
						}>(
							"SELECT id,timezone,observed_at,day_start,day_end FROM inventory_value_days WHERE account_id=$1 AND game='mtg' AND day=$2::date",
							[account.account_id, calendar.day]
						)
					).rows[0];
					if (
						existing &&
						(existing.timezone !== values.timezone ||
							existing.day_start.getTime() !== calendar.day_start.getTime() ||
							existing.day_end.getTime() !== calendar.day_end.getTime() ||
							existing.observed_at >= calendar.observed_at)
					) {
						await query('ROLLBACK');
						transaction = false;
						continue;
					}
					const revision =
						(
							await query<{ revision: string }>(
								"SELECT revision::text FROM inventories WHERE account_id=$1 AND game='mtg'",
								[account.account_id]
							)
						).rows[0]?.revision ?? '0';
					const holdings = await readHoldings(executor, account.account_id);
					const pairs = uniqueHoldingPairs(holdings);
					const outcomes: FrozenReferenceOutcome[] = [],
						references = new Map<string, PriceReference>();
					for (let offset = 0; offset < pairs.length; offset += 100) {
						check();
						const batch = await values.valuation.freezeInTransaction(
							executor,
							pairs.slice(offset, offset + 100),
							calendar.observed_at
						);
						outcomes.push(...batch.evidence);
						for (const reference of batch.response.results)
							references.set(pairKey(reference), reference);
						await tests.afterBatch?.(offset / 100, client);
					}
					check();
					const estimate = estimateHoldings(holdings, references),
						dayId = existing?.id ?? randomUUID();
					if (existing) {
						await query('DELETE FROM inventory_value_holdings WHERE day_id=$1', [dayId]);
						await query('DELETE FROM inventory_value_references WHERE day_id=$1', [dayId]);
						await query(
							'UPDATE inventory_value_days SET observed_at=$2,estimate=$3::jsonb,inventory_revision=$4 WHERE id=$1',
							[dayId, calendar.observed_at, JSON.stringify(estimate), revision]
						);
					} else
						await query(
							`INSERT INTO inventory_value_days(id,account_id,game,day,timezone,day_start,day_end,observed_at,estimate,inventory_revision) VALUES($1,$2,'mtg',$3,$4,$5,$6,$7,$8::jsonb,$9)`,
							[
								dayId,
								account.account_id,
								calendar.day,
								values.timezone,
								calendar.day_start,
								calendar.day_end,
								calendar.observed_at,
								JSON.stringify(estimate),
								revision
							]
						);
					for (let offset = 0; offset < outcomes.length; offset += 100) {
						check();
						await query(
							`INSERT INTO inventory_value_references(day_id,printing_id,finish,evidence) SELECT $1,r.printing_id,r.finish,r.evidence FROM jsonb_to_recordset($2::jsonb) AS r(printing_id text,finish text,evidence jsonb)`,
							[
								dayId,
								JSON.stringify(
									outcomes.slice(offset, offset + 100).map((evidence) => ({
										printing_id: evidence.reference.printingId,
										finish: evidence.reference.finish,
										evidence
									}))
								)
							]
						);
					}
					for (let offset = 0; offset < holdings.length; offset += 500) {
						check();
						await query(
							`INSERT INTO inventory_value_holdings(day_id,printing_id,finish,condition,quantity,canonical_card_id,name,set_code,image_uri) SELECT $1,r.printing_id,r.finish,r.condition,r.quantity,r.canonical_card_id,r.name,r.set_code,r.image_uri FROM jsonb_to_recordset($2::jsonb) AS r(printing_id text,finish text,condition text,quantity integer,canonical_card_id text,name text,set_code text,image_uri text)`,
							[dayId, JSON.stringify(holdings.slice(offset, offset + 500))]
						);
					}
					await tests.beforeCommit?.(client);
					check();
					await query('COMMIT');
					transaction = false;
					result.capturedAccounts++;
					result.capturedHoldings += holdings.length;
					result.copiedReferences += outcomes.length;
				} catch (cause) {
					if (transaction && !lost) {
						try {
							await query('ROLLBACK');
							transaction = false;
						} catch {
							lost = true;
						}
					}
					check();
					result.failedAccounts++;
					console.error('Inventory value checkpoint failed; prior observation retained.');
				}
			}
			return result;
		} finally {
			if (transaction && !lost)
				await query('ROLLBACK').catch(() => {
					lost = true;
				});
			if (lease && !lost)
				await query('SELECT pg_advisory_unlock($1::bigint)', [leaseKey]).catch(() => {
					lost = true;
				});
			if (!lost)
				await query('RESET statement_timeout').catch(() => {
					lost = true;
				});
			client.removeListener('error', connectionLost);
			client.removeListener('end', connectionLost);
			client.release(lost);
		}
	}
	function runOnce(): Promise<CaptureResult> {
		if (closed) return Promise.reject(Error('Value history runner closed'));
		if (running) return running;
		controller = new AbortController();
		running = capture(controller.signal).finally(() => {
			running = undefined;
			controller = undefined;
		});
		return running;
	}
	return {
		runOnce,
		start() {
			if (closed || timer) return;
			const attempt = () => {
				void runOnce().catch(() => {
					if (!closed) console.error('Inventory value runner unavailable.');
				});
			};
			timer = setInterval(attempt, VALUE_CAPTURE_INTERVAL_MS);
			timer.unref();
			attempt();
		},
		async close() {
			closed = true;
			clearInterval(timer);
			timer = undefined;
			controller?.abort();
			await running?.catch(() => {});
		}
	};
}
