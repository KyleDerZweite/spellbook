import type { AuthUser } from '#lib/auth/types.ts';

declare global {
	namespace App {
		interface PageState {
			searchOverlay?: { background: string; depth?: number };
			searchFullView?: { background: string; depth?: number };
		}

		interface Error {
			message: string;
			kind?:
				| import('@spellbook/contracts/decks.ts').DeckFailure['kind']
				| 'RevisionChanged'
				| import('@spellbook/contracts/inventory.ts').InventoryFailure['kind']
				| import('@spellbook/contracts/scan.ts').ScanFailure['kind'];
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
			api: import('#lib/server/remote/client.ts').RemoteClient;
			user: AuthUser | null;
			mobileBearerUser: AuthUser | null;
		}
	}
}

export {};
