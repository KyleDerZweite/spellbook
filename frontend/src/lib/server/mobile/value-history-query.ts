import { error } from '@sveltejs/kit';
import type { InventoryValueHistoryRequest } from '@spellbook/contracts/inventory-value.ts';

export function valueHistoryQuery(params: URLSearchParams): InventoryValueHistoryRequest {
	const allowed = ['days', 'from', 'to', 'printingId', 'finish', 'condition'];
	if (
		[...params.keys()].some((key) => !allowed.includes(key)) ||
		allowed.some((key) => params.getAll(key).length > 1)
	)
		error(400, 'Invalid history query');
	const value: Record<string, string | number> = Object.fromEntries(params);
	if (params.has('days')) {
		const days = params.get('days')!;
		if (!/^[1-9][0-9]{0,2}$/.test(days) || Number(days) > 366)
			error(400, 'History days must be 1 to 366');
		value.days = Number(days);
	}
	return value as InventoryValueHistoryRequest;
}
