import type { AuthUser } from '#lib/auth/types.ts';
import type { CardDocument } from '#lib/search/types.ts';

export type { ScanWorkerResult } from '#lib/server/data/types.ts';

export interface MobileAuthContext {
	user: AuthUser;
}

export interface MobileInventoryBatchItem {
	catalogCardId: string;
	canonicalCardId: string;
	name: string;
	setCode: string;
	imageUri: string;
	finish: string;
	condition: string;
	quantity: number;
}

export type { ScanCandidate } from '#lib/server/data/types.ts';

export interface MobileSearchResponse {
	query: string;
	hits: CardDocument[];
	estimatedTotalHits: number;
}
