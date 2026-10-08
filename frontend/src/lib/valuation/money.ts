import { isReferenceDecimal } from '@spellbook/contracts/valuation.ts';

/** Exact multiplication and half-up rounding happen before locale presentation. */
export function formatReferenceEUR(amount: string, quantity = 1): string {
	if (!isReferenceDecimal(amount) || !Number.isSafeInteger(quantity) || quantity < 0)
		throw new Error('Invalid reference amount or quantity');
	const [whole, fraction = ''] = amount.split('.');
	const scale = 10n ** BigInt(fraction.length),
		units = BigInt(whole + fraction) * BigInt(quantity);
	const cents = (units * 100n + scale / 2n) / scale;
	return formatCentsEUR(cents);
}

/** Inventory and Deck subtotals are already rounded by Backend Valuation. */
export function formatValueEUR(amount: string): string {
	if (amount.length > 160 || !/^(?:0|[1-9][0-9]*)\.[0-9]{2}$/.test(amount))
		throw new Error('Invalid value subtotal');
	const [whole, fraction] = amount.split('.');
	return formatCentsEUR(BigInt(whole) * 100n + BigInt(fraction));
}

function formatCentsEUR(cents: bigint): string {
	const formatter = new Intl.NumberFormat('en-IE', {
		style: 'currency',
		currency: 'EUR',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});
	return formatter
		.formatToParts(cents / 100n)
		.map((part) =>
			part.type === 'fraction' ? (cents % 100n).toString().padStart(2, '0') : part.value
		)
		.join('');
}
