import type { ValueEstimate } from '@spellbook/contracts/inventory-value.ts';
import type { PriceReference } from '@spellbook/contracts/valuation.ts';
import { isReferenceDecimal } from '@spellbook/contracts/valuation.ts';
import { databaseInteger } from '../db/numbers.ts';
import { PriceReadUnavailable } from './read.ts';

const scale = 10n ** 18n;
export function exactAmount(value: string): bigint {
	if (!isReferenceDecimal(value)) throw new PriceReadUnavailable();
	const [whole, fraction = ''] = value.split('.');
	return BigInt(whole) * scale + BigInt(fraction.padEnd(18, '0'));
}
export function displayAmount(value: bigint): string {
	const cents = (value + 5n * 10n ** 15n) / 10n ** 16n;
	return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
export function valueEstimate(
	holdings: Iterable<{ quantity: number | string; reference: PriceReference }>
): ValueEstimate {
	let amount = 0n,
		covered = 0n,
		stale = 0n,
		unknown = 0n;
	for (const holding of holdings) {
		const quantity = BigInt(databaseInteger(holding.quantity));
		if (quantity < 0n) throw new PriceReadUnavailable();
		if (holding.reference.kind === 'Known') {
			amount += exactAmount(holding.reference.amount) * quantity;
			covered += quantity;
			if (holding.reference.freshness === 'Stale') stale += quantity;
		} else unknown += quantity;
	}
	return {
		currency: 'EUR',
		coveredValue: displayAmount(amount),
		coveredQuantity: databaseInteger(covered),
		staleQuantity: databaseInteger(stale),
		unknownQuantity: databaseInteger(unknown),
		totalQuantity: databaseInteger(covered + unknown),
		complete: unknown === 0n
	};
}
