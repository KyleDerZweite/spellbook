import type { HttpDependencies, HttpRoute } from '../types.ts';
import { error, json } from '../errors.ts';
import { requireMobileAuth } from '../auth.ts';
import { readJsonObject } from '../request.ts';
import type { InventoryValueHistoryRequest } from '@spellbook/contracts/inventory-value.ts';

function priceReadError(cause: unknown): never {
	if (cause && typeof cause === 'object' && 'kind' in cause) {
		if (cause.kind === 'Unauthenticated') error(401, 'Authentication required');
		if (cause.kind === 'InventoryPriceNotFound') error(404, 'Inventory entry not found.');
		if (cause.kind === 'PriceReadUnavailable')
			error(503, 'Reference prices are temporarily unavailable.');
		if (cause.kind === 'ValidationFailed')
			error(400, cause instanceof Error ? cause.message : 'Invalid price request');
	}
	// Existing validation errors use the shared named Error class.
	if (cause instanceof Error && cause.name === 'ValidationError') error(400, cause.message);
	if (cause && typeof cause === 'object' && 'status' in cause) throw cause;
	error(503, 'Reference prices are temporarily unavailable.');
}

function valueHistoryQuery(params: URLSearchParams): InventoryValueHistoryRequest {
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

export function createValuationRoutes(deps: HttpDependencies): HttpRoute[] {
	const { application } = deps;
	const printingPrices: HttpRoute['handle'] = async ({ url }) => {
		if (
			[...url.searchParams.keys()].some((k) => k !== 'printingId' && k !== 'finish') ||
			url.searchParams.getAll('printingId').length !== 1 ||
			url.searchParams.getAll('finish').length !== 1
		)
			error(400, 'Supply one printingId and finish');
		try {
			return json(
				await application.valuation.printingReferences([
					{ printingId: url.searchParams.get('printingId'), finish: url.searchParams.get('finish') }
				]),
				{ headers: { 'cache-control': 'no-store' } }
			);
		} catch (cause) {
			priceReadError(cause);
		}
	};
	const printingHistory: HttpRoute['handle'] = async ({ url }) => {
		if (
			[...url.searchParams.keys()].some(
				(key) => !['printingId', 'finish', 'days', 'source'].includes(key)
			) ||
			url.searchParams.getAll('printingId').length !== 1 ||
			url.searchParams.getAll('finish').length !== 1 ||
			url.searchParams.getAll('days').length > 1
		)
			error(400, 'Supply one printingId, finish and optional days/source filters');
		const rawDays = url.searchParams.get('days');
		if (rawDays !== null && !/^[0-9]{1,2}$/.test(rawDays))
			error(400, 'History days must be 1 to 90');
		const sources = url.searchParams.getAll('source');
		try {
			return json(
				await application.valuation.printingHistory({
					printingId: url.searchParams.get('printingId'),
					finish: url.searchParams.get('finish'),
					...(rawDays !== null ? { days: Number(rawDays) } : {}),
					...(sources.length ? { sources } : {})
				}),
				{ headers: { 'cache-control': 'no-store' } }
			);
		} catch (cause) {
			priceReadError(cause);
		}
	};
	const inventoryPrices: HttpRoute['handle'] = async (context) => {
		try {
			const auth = await requireMobileAuth(context, deps);
			const input = await readJsonObject(context.request);
			return json(await application.valuation.inventoryReferences(auth.user, input), {
				headers: { 'cache-control': 'no-store' }
			});
		} catch (cause) {
			priceReadError(cause);
		}
	};
	const inventoryValue: HttpRoute['handle'] = async (context) => {
		const actor = await requireMobileAuth(context, deps);
		if (context.url.search) error(400, 'Current value accepts no query parameters');
		try {
			return json(await application.inventoryValues.current(actor.user), {
				headers: { 'cache-control': 'private, no-store' }
			});
		} catch (cause) {
			priceReadError(cause);
		}
	};
	const inventoryValueHistory: HttpRoute['handle'] = async (context) => {
		const actor = await requireMobileAuth(context, deps);

		try {
			return json(
				await application.inventoryValues.history(
					actor.user,
					valueHistoryQuery(context.url.searchParams)
				),
				{ headers: { 'cache-control': 'private, no-store' } }
			);
		} catch (cause) {
			priceReadError(cause);
		}
	};
	return [
		{ method: 'GET', path: '/api/mobile/v1/mtg/prices', handle: printingPrices },
		{ method: 'GET', path: '/api/mobile/v1/mtg/prices/history', handle: printingHistory },
		{ method: 'POST', path: '/api/mobile/v1/mtg/inventory/prices', handle: inventoryPrices },
		{ method: 'GET', path: '/api/mobile/v1/mtg/inventory/value', handle: inventoryValue },
		{
			method: 'GET',
			path: '/api/mobile/v1/mtg/inventory/value-history',
			handle: inventoryValueHistory
		}
	];
}
