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
				| 'CategoryMergeConflict';
			latest?: import('@spellbook/contracts/categories.ts').DeckEntryCategories;
			preview?: import('@spellbook/contracts/categories.ts').CategoryMergePreview;
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
