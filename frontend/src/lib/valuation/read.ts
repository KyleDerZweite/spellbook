import type {
	PriceRequest,
	PriceResponse,
	InventoryPriceResponse
} from '@spellbook/contracts/valuation.ts';

type ReferenceFetch = (
	url: string,
	init: RequestInit
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

/** A stale account, opening or revision cannot parse or apply a private response. */
export async function loadReferencePrice(
	input: PriceRequest & { entryId?: string },
	signal: AbortSignal,
	isCurrent: () => boolean,
	request: ReferenceFetch = fetch
): Promise<PriceResponse | InventoryPriceResponse | undefined> {
	const current = () => !signal.aborted && isCurrent();
	if (!current()) return;
	const response = await request(
		input.entryId
			? '/api/mobile/v1/mtg/inventory/prices'
			: `/api/mobile/v1/mtg/prices?${new URLSearchParams({ printingId: input.printingId, finish: input.finish })}`,
		{
			signal,
			...(input.entryId
				? {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ entryIds: [input.entryId] })
					}
				: {})
		}
	);
	if (!current()) return;
	if (!response.ok)
		throw new Error(
			input.entryId && response.status === 404
				? 'This Inventory entry is no longer available.'
				: 'Reference prices could not be loaded.'
		);
	const result: PriceResponse | InventoryPriceResponse = await response.json();
	return current() ? result : undefined;
}
