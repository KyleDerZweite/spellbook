import type { AuthUser } from './auth.ts';
import type { PriceFinish } from './valuation.ts';

/** A covered subtotal includes stale references; unknown quantities remain explicit. */
export interface ValueEstimate {
	currency: 'EUR';
	coveredValue: string;
	coveredQuantity: number;
	staleQuantity: number;
	unknownQuantity: number;
	totalQuantity: number;
	complete: boolean;
}
export interface CurrentInventoryValue {
	evaluatedAt: string;
	estimate: ValueEstimate;
}
export interface HistoricalHoldingIdentity {
	printingId: string;
	finish?: PriceFinish;
	condition?: 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';
}
export interface InventoryValueHistoryRequest {
	days?: number;
	from?: string;
	to?: string;
	printingId?: string;
	finish?: PriceFinish;
	condition?: HistoricalHoldingIdentity['condition'];
}
export type InventoryValueHistoryPoint =
	| { kind: 'Gap'; day: string }
	| {
			kind: 'Captured';
			day: string;
			timezone: string;
			dayStart: string;
			dayEnd: string;
			observedAt: string;
			estimate: ValueEstimate;
	  };
export interface InventoryValueHistory {
	asOf: string;
	/** Next midnight in the configured reporting calendar, expressed as a UTC instant. */
	nextDayBoundary: string;
	/** Earliest owned checkpoint closure in this window or the next reporting midnight. */
	nextRefreshAt: string;
	timezone: string;
	window: { from: string; to: string; days: number };
	identity: HistoricalHoldingIdentity | null;
	points: InventoryValueHistoryPoint[];
}
export interface InventoryValueApplication {
	current(actor: AuthUser): Promise<CurrentInventoryValue>;
	history(actor: AuthUser, input?: unknown): Promise<InventoryValueHistory>;
}
export interface DeckValueEstimates {
	evaluatedAt: string;
	required: ValueEstimate;
	missing: ValueEstimate;
}
