import type { PriceFinish, PriceSource } from '@spellbook/contracts/valuation.ts';

/** Decode the concrete stored source/finish policy for current and history references. */
export function referenceOrigin(source: PriceSource, finish: PriceFinish, providerId: unknown) {
	if (source === 'Scryfall')
		return {
			source: 'Scryfall' as const,
			measure: finish === 'nonfoil' ? ('prices.eur' as const) : ('prices.eur_foil' as const)
		};
	if (
		typeof providerId !== 'string' ||
		(source === 'Cardmarket'
			? !/^[1-9][0-9]{0,18}$/.test(providerId)
			: !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(providerId))
	)
		throw Error('Invalid stored provider identity');
	return source === 'Cardmarket'
		? {
				source: 'Cardmarket' as const,
				measure: finish === 'nonfoil' ? ('trend' as const) : ('trend-foil' as const),
				providerId,
				upstream: 'Cardmarket' as const
			}
		: {
				source: 'MTGJSON' as const,
				measure:
					finish === 'nonfoil'
						? ('paper.cardmarket.retail.normal' as const)
						: ('paper.cardmarket.retail.foil' as const),
				providerId,
				upstream: 'Cardmarket' as const
			};
}
