import type { AuthUser } from './auth.ts';
/** Bounded ordinary decimals are checked before Decimal/BigInt parsing. */
export function isReferenceDecimal(value: unknown): value is string {
	return (
		typeof value === 'string' && value.length <= 128 && /^[0-9]+(?:\.[0-9]{1,18})?$/.test(value)
	);
}
// Foil selects Scryfall eur_foil with an explicit foil finish, even alongside etched.
// Etched-only printings are unsupported; this API does not accept an etched request.
export type PriceFinish = 'nonfoil' | 'foil';
export type PriceSource = 'Cardmarket' | 'Scryfall' | 'MTGJSON';
export type PriceTime =
	{ timePrecision: 'Instant'; sourceTime: string } | { timePrecision: 'Day'; sourceDate: string };
export type PriceOrigin =
	| { source: 'Scryfall'; measure: 'prices.eur' | 'prices.eur_foil' }
	| {
			source: 'Cardmarket';
			measure: 'trend' | 'trend-foil';
			providerId: string;
			upstream: 'Cardmarket';
	  }
	| {
			source: 'MTGJSON';
			measure: 'paper.cardmarket.retail.normal' | 'paper.cardmarket.retail.foil';
			providerId: string;
			upstream: 'Cardmarket';
	  };
export type PriceRequest = { printingId: string; finish: PriceFinish };
export type PriceUnknownReason =
	| 'SourceUnavailable'
	| 'PrintingMissing'
	| 'AmountMissing'
	| 'ReferenceExpired'
	| 'UnsupportedFinish'
	| 'AmbiguousLanguageMapping'
	| 'AmbiguousSourceMapping'
	| 'MissingVariantEvidence';
export type ProductLink = {
	provider: 'Cardmarket' | 'TCGplayer' | 'Cardhoarder';
	url: string;
	printingId: string;
	provenance: 'Exact' | 'EnglishFallback';
};
export type PricePublication = {
	id: string;
	source: PriceSource;
	bulkType: string;
	payloadDigest: string;
	extractorVersion: number;
	mappingVersion: number;
	ingestedAt: string;
} & PriceTime;
export type PriceReference = PriceRequest & { links: ProductLink[] } & (
		| ({
				kind: 'Known';
				amount: string;
				currency: 'EUR';
				freshness: 'Fresh' | 'Stale';
				publicationId: string;
				observationId: string;
				matchedPrintingId: string;
				matchedFinish: PriceFinish;
				provenance: 'Exact' | 'EnglishFallback';
		  } & PriceOrigin &
				(
					| { timePrecision: 'Instant'; sourceTime: string }
					| {
							timePrecision: 'Day';
							sourceDate: string;
							asOf: string;
							freshnessPolicy: 'day-upper-bound-utc-start-v1';
					  }
				))
		| { kind: 'Unknown'; reason: PriceUnknownReason }
	);
export type PriceSourceStatus = {
	source: PriceSource;
	enabled: boolean;
	kind: 'Disabled' | 'NeverAttempted' | 'Succeeded' | 'Failed';
	attemptedAt?: string;
	lastSuccessfulPublicationId?: string;
};
export type PriceResponse = {
	evaluatedAt: string;
	publications: PricePublication[];
	sourceStatuses: PriceSourceStatus[];
	refreshStatus: {
		kind: 'NeverAttempted' | 'Succeeded' | 'Failed';
		attemptedAt?: string;
	};
	results: PriceReference[];
};
export type InventoryPriceResponse = Omit<PriceResponse, 'results'> & {
	results: { entryId: string; quantity: number; reference: PriceReference }[];
	coverage: {
		coveredQuantity: number;
		staleQuantity: number;
		unknownQuantity: number;
	};
};
export interface ValuationApplication {
	printingReferences(input: unknown): Promise<PriceResponse>;
	inventoryReferences(actor: AuthUser, input: unknown): Promise<InventoryPriceResponse>;
	printingHistory(input: unknown): Promise<PriceHistoryResponse>;
}
export type PriceHistoryPoint = PriceRequest &
	PriceOrigin &
	PriceTime & {
		day: string;
		amount: string;
		currency: 'EUR';
		publicationId: string;
		observationId: string;
		matchedPrintingId: string;
		matchedFinish: PriceFinish;
		provenance: 'Exact' | 'EnglishFallback';
		mappingVersion: number;
		pointArtifact: 'ScryfallBulk' | 'CardmarketGuide' | 'AllPrices';
		pointPayloadDigest: string;
	};
export type PriceHistoryResponse = {
	asOf: string;
	window: { from: string; to: string; days: number };
	sourceStatuses: PriceSourceStatus[];
	publications: PricePublication[];
	points: PriceHistoryPoint[];
};
