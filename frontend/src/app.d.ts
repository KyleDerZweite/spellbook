import type { AuthUser } from '$lib/auth/types';

declare global {
	namespace App {
		interface Locals {
			user: AuthUser | null;
			meiliSearchKey: string;
			mobileBearerUser: AuthUser | null;
		}
	}
}

export {};
