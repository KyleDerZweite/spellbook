import type { AuthUser } from '$lib/auth/types';

declare global {
	namespace App {
		interface Locals {
			user: AuthUser | null;
			spacetimeToken: string | null;
			meiliSearchKey: string;
		}
	}
}

export {};
