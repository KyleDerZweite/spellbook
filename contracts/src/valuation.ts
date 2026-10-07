import type { AuthUser } from './auth.ts';
// Foil selects Scryfall eur_foil with an explicit foil finish, even alongside etched.
// Etched-only printings are unsupported; this API does not accept an etched request.
export type PriceFinish = 'nonfoil' | 'foil';
export type PriceRequest = { printingId: string; finish: PriceFinish };
export type PriceUnknownReason =
	| 'SourceUnavailable'
	| 'PrintingMissing'
	| 'AmountMissing'
	| 'ReferenceExpired'
	| 'UnsupportedFinish'
	| 'AmbiguousLanguageMapping'
	| 'MissingVariantEvidence';
export type ProductLink = {
	provider: 'Cardmarket' | 'TCGplayer' | 'Cardhoarder';
	url: string;
	printingId: string;
	provenance: 'Exact' | 'EnglishFallback';
};
export type PricePublication = {
	id: string;
	source: 'Scryfall';
	bulkType: string;
	sourceTime: string;
	timePrecision: 'Instant';
	payloadDigest: string;
	extractorVersion: number;
	mappingVersion: number;
	ingestedAt: string;
};
export type PriceReference = PriceRequest & { links: ProductLink[] } & (
		| {
				kind: 'Known';
				amount: string;
				currency: 'EUR';
				source: 'Scryfall';
				measure: 'prices.eur' | 'prices.eur_foil';
				sourceTime: string;
				timePrecision: 'Instant';
				freshness: 'Fresh' | 'Stale';
				publicationId: string;
				observationId: string;
				matchedPrintingId: string;
				matchedFinish: PriceFinish;
				provenance: 'Exact' | 'EnglishFallback';
		  }
		| { kind: 'Unknown'; reason: PriceUnknownReason }
	);
export type PriceResponse = {
	evaluatedAt: string;
	publications: PricePublication[];
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
}
