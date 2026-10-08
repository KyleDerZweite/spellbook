export type { ScanCandidate } from '@spellbook/contracts/scan.ts';

export interface InventoryBatchItem {
	catalogCardId: string;
	canonicalCardId: string;
	name: string;
	setCode: string;
	imageUri: string;
	finish: string;
	condition: string;
	quantity: number;
}
