import pg from 'pg';
import { sql } from 'drizzle-orm';
import type { Transaction } from '../db/client.ts';
import type { DeckCard, DeckAvailability } from '@spellbook/contracts/decks.ts';
import type { DeckValueEstimates } from '@spellbook/contracts/inventory-value.ts';
import type { ReferenceExecutor, createValuation } from '../valuation/read.ts';
import { estimateHoldings, referencesForHoldings } from '../valuation/inventory-value.ts';

/** Bind the price owner's numbered parameters through the existing Drizzle transaction. */
export function deckReferenceExecutor(tx: Pick<Transaction, 'execute'>): ReferenceExecutor {
	return {
		async query<Row extends Record<string, unknown>>(text: string, values: unknown[] = []) {
			const parts = text.split(/(\$\d+)/g);
			const statement = sql.join(
				parts.map((part) => {
					if (!/^\$\d+$/.test(part)) return sql.raw(part);
					const index = Number(part.slice(1)) - 1;
					if (index < 0 || index >= values.length) throw new Error('Missing SQL parameter');
					return sql`${sql.param(values[index])}`;
				}),
				sql.raw('')
			);
			const result = await tx.execute<Row>(statement);
			// Drizzle raw execution preserves temporal columns as strings. Restore the
			// node-postgres temporal decoding expected by the reference owner.
			for (const field of result.fields) {
				if (![1082, 1114, 1184].includes(field.dataTypeID)) continue;
				const parse = pg.types.getTypeParser(field.dataTypeID);
				for (const row of result.rows) {
					const value = row[field.name];
					if (typeof value === 'string')
						(row as Record<string, unknown>)[field.name] = parse(value);
				}
			}
			return { rows: result.rows as Row[] };
		}
	};
}

export async function deckValueEstimates(
	tx: Pick<Transaction, 'execute'>,
	valuation: Pick<ReturnType<typeof createValuation>, 'readInTransaction' | 'freezeInTransaction'>,
	cards: DeckCard[],
	availability: Record<string, DeckAvailability>,
	asOf: Date
): Promise<DeckValueEstimates> {
	const required = cards.map((card) => ({
		printing_id: card.catalogCardId,
		finish: 'nonfoil' as const,
		quantity: card.quantity
	}));
	const references = await referencesForHoldings(
		deckReferenceExecutor(tx),
		valuation,
		required,
		asOf
	);
	return {
		evaluatedAt: asOf.toISOString(),
		required: estimateHoldings(required, references),
		missing: estimateHoldings(
			required.map((holding, index) => ({
				...holding,
				quantity: availability[cards[index].id].missing
			})),
			references
		)
	};
}
