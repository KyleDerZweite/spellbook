import type { AuthUser } from '$lib/auth/types';

declare global {
	namespace App {
		interface Locals {
			user: AuthUser | null;
			spacetimeToken: string | null;
			meiliSearchKey: string;
			mobileBearerUser: AuthUser | null;
			mobileBearerToken: string | null;
		}
	}
}

export {};
