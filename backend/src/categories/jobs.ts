import { sql } from 'drizzle-orm';
import type { Database, Transaction } from '../db/client.ts';
import { categoryTransaction } from './work.ts';

export const wholeDeckJobLimits = {
	debounceMs: 250,
	pollMs: 1000,
	leaseMs: 30000,
	maxBackoffMs: 60000
};

export type WholeDeckJobClaim = {
	deckId: string;
	accountId: string;
	generation: string;
	compositionRevision: string;
	decisionRevision: string;
	leaseToken: string;
	attempts: number;
};
export type WholeDeckEvaluation = (
	tx: Transaction,
	deckId: string,
	compositionRevision: string
) => Promise<{ changed: boolean }>;

/** Call after adoption or a semantic composition write, inside its existing lock order. */
export async function queueWholeDeckEvaluation(tx: Transaction, deckId: string) {
	await tx.execute(sql`INSERT INTO deck_whole_category_jobs
 (deck_id,generation,composition_revision,decision_revision,available_at)
 SELECT d.id,1,d.composition_revision,b.decision_revision,
 clock_timestamp()+${wholeDeckJobLimits.debounceMs}*interval '1 millisecond'
 FROM decks d JOIN deck_category_bundles b ON b.deck_id=d.id WHERE d.id=${deckId}::uuid
 ON CONFLICT(deck_id) DO UPDATE SET generation=deck_whole_category_jobs.generation+1,
 composition_revision=EXCLUDED.composition_revision,decision_revision=EXCLUDED.decision_revision,
 available_at=EXCLUDED.available_at,lease_token=NULL,lease_expires_at=NULL,attempts=0,last_error=NULL`);
}

/** Decision writes invalidate existing work without scheduling absent work. */
export async function touchWholeDeckJob(tx: Transaction, deckId: string) {
	await tx.execute(sql`UPDATE deck_whole_category_jobs j SET generation=j.generation+1,
 composition_revision=d.composition_revision,decision_revision=b.decision_revision,
 available_at=clock_timestamp()+${wholeDeckJobLimits.debounceMs}*interval '1 millisecond',
 lease_token=NULL,lease_expires_at=NULL,attempts=0,last_error=NULL
 FROM decks d JOIN deck_category_bundles b ON b.deck_id=d.id
 WHERE j.deck_id=d.id AND d.id=${deckId}::uuid`);
}

/** The claim commits before Profile, Deck or bundle locks are acquired. */
export async function claimWholeDeckJob(db: Database, signal?: AbortSignal) {
	return categoryTransaction(
		db,
		async (tx): Promise<WholeDeckJobClaim | null> => {
			const token = crypto.randomUUID();
			const result = await tx.execute(sql`WITH candidate AS (
 SELECT j.deck_id FROM deck_whole_category_jobs j
 WHERE j.available_at<=clock_timestamp()
 AND (j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp())
 ORDER BY j.available_at,j.deck_id FOR UPDATE SKIP LOCKED LIMIT 1)
 UPDATE deck_whole_category_jobs j SET lease_token=${token}::uuid,
 lease_expires_at=clock_timestamp()+${wholeDeckJobLimits.leaseMs}*interval '1 millisecond',attempts=j.attempts+1
 FROM candidate c,decks d WHERE j.deck_id=c.deck_id AND d.id=j.deck_id
 RETURNING j.deck_id::text,d.account_id,j.generation::text,j.composition_revision::text,
 j.decision_revision::text,j.attempts`);
			const row = result.rows[0];
			return row
				? {
						deckId: String(row.deck_id),
						accountId: String(row.account_id),
						generation: String(row.generation),
						compositionRevision: String(row.composition_revision),
						decisionRevision: String(row.decision_revision),
						leaseToken: token,
						attempts: Number(row.attempts)
					}
				: null;
		},
		undefined,
		{ waitForAcquisition: true, signal }
	);
}

export async function processWholeDeckJob(
	db: Database,
	claim: WholeDeckJobClaim,
	evaluate: WholeDeckEvaluation,
	signal?: AbortSignal
) {
	return categoryTransaction(
		db,
		async (tx) => {
			await tx.execute(
				sql`SELECT account_id FROM user_profiles WHERE account_id=${claim.accountId} FOR UPDATE`
			);
			const deck = await tx.execute(sql`SELECT composition_revision::text FROM decks
 WHERE id=${claim.deckId}::uuid AND account_id=${claim.accountId} FOR UPDATE`);
			if (!deck.rows.length) return;
			const bundle = await tx.execute(sql`SELECT decision_revision::text FROM deck_category_bundles
 WHERE deck_id=${claim.deckId}::uuid FOR UPDATE`);
			const job = await tx.execute(sql`SELECT generation::text,lease_token::text,
 composition_revision::text,decision_revision::text FROM deck_whole_category_jobs
 WHERE deck_id=${claim.deckId}::uuid FOR UPDATE`);
			const current = job.rows[0];
			if (
				!current ||
				current.generation !== claim.generation ||
				current.lease_token !== claim.leaseToken
			)
				return;
			if (!bundle.rows.length) return;
			if (
				current.composition_revision !== claim.compositionRevision ||
				current.decision_revision !== claim.decisionRevision ||
				deck.rows[0].composition_revision !== claim.compositionRevision ||
				bundle.rows[0].decision_revision !== claim.decisionRevision
			) {
				await queueWholeDeckEvaluation(tx, claim.deckId);
				return;
			}
			signal?.throwIfAborted();
			await evaluate(tx, claim.deckId, claim.compositionRevision);
			// Even an evaluator ignoring cancellation cannot publish its transaction afterward.
			signal?.throwIfAborted();
			await tx.execute(sql`DELETE FROM deck_whole_category_jobs WHERE deck_id=${claim.deckId}::uuid
 AND generation=${claim.generation}::bigint AND lease_token=${claim.leaseToken}::uuid`);
		},
		undefined,
		{ waitForAcquisition: true, signal }
	);
}

export async function backoffWholeDeckJob(
	db: Database,
	claim: WholeDeckJobClaim,
	signal?: AbortSignal
) {
	const delay = Math.min(
		wholeDeckJobLimits.maxBackoffMs,
		1000 * 2 ** Math.min(claim.attempts - 1, 6)
	);
	await categoryTransaction(
		db,
		async (tx) => {
			await tx.execute(sql`UPDATE deck_whole_category_jobs SET
 available_at=clock_timestamp()+${delay}*interval '1 millisecond',lease_token=NULL,lease_expires_at=NULL,
 last_error='Category evaluation temporarily unavailable'
 WHERE deck_id=${claim.deckId}::uuid AND generation=${claim.generation}::bigint
 AND lease_token=${claim.leaseToken}::uuid`);
		},
		undefined,
		{ waitForAcquisition: true, signal }
	);
}

/** Runtime callers own the build guard and dispose this owner on shutdown/HMR. */
export function createWholeDeckCategoryRunner(
	db: Database,
	evaluate: WholeDeckEvaluation,
	options: { pollMs?: number; onError?: (error: unknown) => void } = {}
) {
	let started = false;
	let closed = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let processing: Promise<void> | undefined;
	let closing: Promise<void> | undefined;
	const controller = new AbortController();
	async function run() {
		let claim: WholeDeckJobClaim | null = null;
		try {
			claim = await claimWholeDeckJob(db, controller.signal);
			if (claim) await processWholeDeckJob(db, claim, evaluate, controller.signal);
		} catch (error) {
			if (controller.signal.aborted) return;
			if (claim) {
				try {
					await backoffWholeDeckJob(db, claim, controller.signal);
				} catch (backoffError) {
					options.onError?.(backoffError);
				}
			}
			options.onError?.(error);
		}
	}
	function schedule(delay: number) {
		if (closed) return;
		timer = setTimeout(() => {
			timer = undefined;
			processing = run().finally(() => {
				processing = undefined;
				schedule(options.pollMs ?? wholeDeckJobLimits.pollMs);
			});
		}, delay);
		timer.unref?.();
	}
	return {
		start() {
			if (started || closed) return;
			started = true;
			schedule(0);
		},
		close(): Promise<void> {
			if (closing) return closing;
			closed = true;
			clearTimeout(timer);
			timer = undefined;
			controller.abort();
			closing = processing ?? Promise.resolve();
			return closing;
		}
	};
}
