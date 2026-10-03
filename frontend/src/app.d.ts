import type { AuthUser } from '#lib/auth/types.ts';

declare global {
	namespace App {
		interface Locals {
			user: AuthUser | null;
			mobileBearerUser: AuthUser | null;
		}
	}
}

export {};
