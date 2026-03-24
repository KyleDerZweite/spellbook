declare global {
	namespace App {
		interface Locals {
			user: { accountId: string; username: string; email: string };
			meiliSearchKey: string;
		}
	}
}
export {};
