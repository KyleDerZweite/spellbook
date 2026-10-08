import type { Pool } from 'pg';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import type {
	CurrentInventoryValue,
	InventoryValueApplication,
	InventoryValueHistory,
	ValueEstimate,
	HistoricalHoldingIdentity
} from '@spellbook/contracts/inventory-value.ts';
import type { PriceFinish, PriceReference } from '@spellbook/contracts/valuation.ts';
import type { createLocalAuth } from '../auth/local.ts';
import { createValuation, PriceReadUnavailable, type ReferenceExecutor } from './read.ts';
import { valueEstimate } from './estimate.ts';
import { ValidationError } from '../mtg/validation.ts';

export type ValueValuation = Pick<
	ReturnType<typeof createValuation>,
	'readInTransaction' | 'freezeInTransaction'
>;
export interface ValueHolding extends Record<string, unknown> {
	printing_id: string;
	finish: PriceFinish;
	condition: HistoricalHoldingIdentity['condition'];
	quantity: number;
	canonical_card_id: string;
	name: string;
	set_code: string;
	image_uri: string;
}
export function pairKey(pair: { printingId: string; finish: PriceFinish }): string {
	return `${pair.printingId}:${pair.finish}`;
}
export async function readHoldings(
	executor: ReferenceExecutor,
	accountId: string
): Promise<ValueHolding[]> {
	return (
		await executor.query<ValueHolding>(
			`SELECT catalog_card_id AS printing_id,finish,condition,quantity,canonical_card_id,name,set_code,image_uri FROM inventory_cards WHERE account_id=$1 AND game='mtg' ORDER BY catalog_card_id,finish,condition`,
			[accountId]
		)
	).rows;
}
export function uniqueHoldingPairs(holdings: { printing_id: string; finish: PriceFinish }[]) {
	return [
		...new Map(
			holdings.map((row) => {
				const pair = { printingId: row.printing_id, finish: row.finish };
				return [pairKey(pair), pair] as const;
			})
		).values()
	];
}
export async function referencesForHoldings(
	executor: ReferenceExecutor,
	valuation: ValueValuation,
	holdings: { printing_id: string; finish: PriceFinish }[],
	asOf: Date,
	signal?: AbortSignal
) {
	const pairs = uniqueHoldingPairs(holdings);
	const references = new Map<string, PriceReference>();
	for (let offset = 0; offset < pairs.length; offset += 100) {
		signal?.throwIfAborted();
		const response = await valuation.readInTransaction(
			executor,
			pairs.slice(offset, offset + 100),
			asOf
		);
		for (const reference of response.results) references.set(pairKey(reference), reference);
	}
	return references;
}
export function estimateHoldings(
	holdings: { printing_id: string; finish: PriceFinish; quantity: number }[],
	references: Map<string, PriceReference>
): ValueEstimate {
	return valueEstimate(
		holdings.map((holding) => {
			const reference = references.get(
				pairKey({ printingId: holding.printing_id, finish: holding.finish })
			);
			if (!reference) throw new PriceReadUnavailable();
			return { quantity: holding.quantity, reference };
		})
	);
}
function dateInput(value: unknown): string {
	if (
		typeof value !== 'string' ||
		!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
		value.slice(0, 4) === '0000' ||
		!Number.isFinite(Date.parse(value)) ||
		new Date(value).toISOString().slice(0, 10) !== value
	)
		throw new ValidationError('Invalid history date');
	return value;
}
function request(input: unknown) {
	if (
		!input ||
		typeof input !== 'object' ||
		Array.isArray(input) ||
		Object.keys(input).some(
			(key) => !['days', 'from', 'to', 'printingId', 'finish', 'condition'].includes(key)
		)
	)
		throw new ValidationError('Invalid value history request');
	const value = input as Record<string, unknown>;
	let identity: HistoricalHoldingIdentity | null = null;
	if (value.printingId !== undefined) {
		if (
			typeof value.printingId !== 'string' ||
			!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.printingId)
		)
			throw new ValidationError('Invalid printing UUID');
		identity = { printingId: value.printingId.toLowerCase() };
		if (value.finish !== undefined) {
			if (value.finish !== 'foil' && value.finish !== 'nonfoil')
				throw new ValidationError('Invalid finish');
			identity.finish = value.finish;
		}
		if (value.condition !== undefined) {
			if (!['NM', 'LP', 'MP', 'HP', 'DMG'].includes(String(value.condition)))
				throw new ValidationError('Invalid condition');
			identity.condition = value.condition as HistoricalHoldingIdentity['condition'];
		}
	} else if (value.finish !== undefined || value.condition !== undefined)
		throw new ValidationError('History identity requires a printing');
	if (
		(value.from === undefined) !== (value.to === undefined) ||
		(value.from !== undefined && value.days !== undefined)
	)
		throw new ValidationError('Supply days or from and to');
	const days = value.days === undefined ? 30 : value.days;
	if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 366)
		throw new ValidationError('History days must be 1 to 366');
	return {
		identity,
		days,
		from: value.from === undefined ? undefined : dateInput(value.from),
		to: value.to === undefined ? undefined : dateInput(value.to)
	};
}
export function createInventoryValues(
	pool: Pool,
	auth: Pick<ReturnType<typeof createLocalAuth>, 'requireActor'>,
	valuation: ValueValuation,
	options: { timezone?: string } = {}
) {
	const timezone = options.timezone ?? 'Europe/Berlin';
	new Intl.DateTimeFormat('en', { timeZone: timezone });
	async function currentInTransaction(
		executor: ReferenceExecutor,
		accountId: string,
		asOf: Date
	): Promise<CurrentInventoryValue> {
		const holdings = await readHoldings(executor, accountId);
		const references = await referencesForHoldings(executor, valuation, holdings, asOf);
		return {
			evaluatedAt: asOf.toISOString(),
			estimate: estimateHoldings(holdings, references)
		};
	}
	async function historyInTransaction(
		executor: ReferenceExecutor,
		accountId: string,
		input: unknown = {},
		asOf: Date = new Date()
	): Promise<InventoryValueHistory> {
		const filter = request(input);
		const { rows: calendar } = await executor.query<{ today: string; next_day_boundary: Date }>(
			'WITH calendar AS (SELECT ($1::timestamptz AT TIME ZONE $2)::date AS day) SELECT day::text AS today,(day+1)::timestamp AT TIME ZONE $2 AS next_day_boundary FROM calendar',
			[asOf.toISOString(), timezone]
		);
		const lastClosed = new Date(Date.parse(calendar[0].today) - 86400000)
			.toISOString()
			.slice(0, 10);
		const to = filter.to ?? lastClosed;
		const from =
			filter.from ??
			new Date(Date.parse(to) - (filter.days - 1) * 86400000).toISOString().slice(0, 10);
		const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
		if (!Number.isInteger(days) || days < 1 || days > 366 || to > lastClosed)
			throw new ValidationError('History window must contain at most 366 closed dates');
		const headers = (
			await executor.query<{
				day: string;
				timezone: string;
				day_start: Date;
				day_end: Date;
				observed_at: Date;
				estimate: ValueEstimate;
				id: string;
			}>(
				`SELECT id,day::text,timezone,day_start,day_end,observed_at,estimate FROM inventory_value_days WHERE account_id=$1 AND game='mtg' AND day BETWEEN $2::date AND $3::date AND day_end <= $4::timestamptz ORDER BY day`,
				[accountId, from, to, asOf.toISOString()]
			)
		).rows;
		const estimates = new Map<string, ValueEstimate>();
		if (filter.identity && headers.length) {
			const rows = (
				await executor.query<{
					day_id: string;
					quantity: number;
					reference: PriceReference;
				}>(
					`SELECT h.day_id,h.quantity,r.evidence->'reference' AS reference FROM inventory_value_holdings h JOIN inventory_value_references r USING(day_id,printing_id,finish) WHERE h.day_id=ANY($1::uuid[]) AND h.printing_id=$2 AND ($3::text IS NULL OR h.finish=$3) AND ($4::text IS NULL OR h.condition=$4)`,
					[
						headers.map((row) => row.id),
						filter.identity.printingId,
						filter.identity.finish ?? null,
						filter.identity.condition ?? null
					]
				)
			).rows;
			for (const header of headers)
				estimates.set(header.id, valueEstimate(rows.filter((row) => row.day_id === header.id)));
		}
		const byDay = new Map(headers.map((header) => [header.day, header]));
		return {
			asOf: asOf.toISOString(),
			nextDayBoundary: calendar[0].next_day_boundary.toISOString(),
			timezone,
			window: { from, to, days },
			identity: filter.identity,
			points: Array.from({ length: days }, (_, offset) => {
				const day = new Date(Date.parse(from) + offset * 86400000).toISOString().slice(0, 10);
				const header = byDay.get(day);
				return header
					? {
							kind: 'Captured' as const,
							day,
							timezone: header.timezone,
							dayStart: header.day_start.toISOString(),
							dayEnd: header.day_end.toISOString(),
							observedAt: header.observed_at.toISOString(),
							estimate: estimates.get(header.id) ?? header.estimate
						}
					: { kind: 'Gap' as const, day };
			})
		};
	}
	async function snapshot<T>(
		actor: AuthUser,
		operation: (executor: ReferenceExecutor, accountId: string, asOf: Date) => Promise<T>
	): Promise<T> {
		const user = await auth.requireActor(actor);
		const client = await pool.connect();
		try {
			await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
			const time = (await client.query<{ as_of: Date }>('SELECT statement_timestamp() AS as_of'))
				.rows[0].as_of;
			const result = await operation(client, user.accountId, time);
			await client.query('COMMIT');
			return result;
		} catch (cause) {
			await client.query('ROLLBACK').catch(() => {});
			if (cause instanceof ValidationError) throw cause;
			throw new PriceReadUnavailable();
		} finally {
			client.release();
		}
	}
	const application: InventoryValueApplication = {
		current: (actor) => snapshot(actor, currentInTransaction),
		history: (actor, input = {}) =>
			snapshot(actor, (executor, accountId, asOf) =>
				historyInTransaction(executor, accountId, input, asOf)
			)
	};
	return {
		...application,
		currentInTransaction,
		historyInTransaction,
		timezone,
		valuation
	};
}
