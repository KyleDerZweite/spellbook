import type { AuthUser } from '#lib/auth/types.ts';

declare global {
	namespace App {
		interface PageState {
			searchOverlay?: { background: string };
			searchFullView?: { background: string };
		}

		interface Locals {
			user: AuthUser | null;
			mobileBearerUser: AuthUser | null;
		}
	}
}

export {};
