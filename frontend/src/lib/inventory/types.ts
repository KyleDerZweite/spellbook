/** Inventory row view model shared by the Cards and Boxes route presentations. */
export interface InventoryCard {
	accountId: string;
	name: string;
	id: string;
	createdAt: Date;
	updatedAt: Date;
	game: string;
	inventoryId: string;
	catalogCardId: string;
	canonicalCardId: string;
	setCode: string;
	imageUri: string;
	quantity: number;
	finish: string;
	condition: string;
	notes: string;
	notesRevision: string;
	spellbookPosition: number;
}

export interface InventoryGroup {
	id: string;
	name: string;
	entryCount: number;
	quantity: number;
}
