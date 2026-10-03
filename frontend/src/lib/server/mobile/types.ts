import type { AuthUser } from '$lib/auth/types';
import type { CardDocument } from '$lib/search/types';

export type { ScanWorkerResult } from '$lib/server/data/types';

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

export type { ScanCandidate } from '$lib/server/data/types';

export interface MobileSearchResponse {
	query: string;
	hits: CardDocument[];
	estimatedTotalHits: number;
}
