import type { AuthUser } from '#lib/auth/types.ts';

declare global {
	namespace App {
		interface PageState {
			searchOverlay?: { background: string };
			searchFullView?: { background: string };
		}

		interface Error {
			message: string;
			kind?:
				| import('@spellbook/contracts/decks.ts').DeckFailure['kind']
				| 'CategoryConflict'
				| 'CategoryMergeConflict'
				| import('@spellbook/contracts/inventory.ts').InventoryFailure['kind']
				| import('@spellbook/contracts/scan.ts').ScanFailure['kind'];
			latest?: import('@spellbook/contracts/categories.ts').DeckEntryCategories;
			preview?: import('@spellbook/contracts/categories.ts').CategoryMergePreview;
			entryId?: Extract<
				import('@spellbook/contracts/inventory.ts').InventoryFailure,
				{ kind: 'NotesConflict' }
			>['entryId'];
			notes?: Extract<
				import('@spellbook/contracts/inventory.ts').InventoryFailure,
				{ kind: 'NotesConflict' }
			>['notes'];
			notesRevision?: Extract<
				import('@spellbook/contracts/inventory.ts').InventoryFailure,
				{ kind: 'NotesConflict' }
			>['notesRevision'];
			latestQuantity?: Extract<
				import('@spellbook/contracts/inventory.ts').InventoryFailure,
				{ kind: 'QuantityChanged' }
			>['latestQuantity'];
			description?: string;
			descriptionRevision?: string;
		}

		interface Locals {
			user: AuthUser | null;
			mobileBearerUser: AuthUser | null;
		}
	}
}

export {};
