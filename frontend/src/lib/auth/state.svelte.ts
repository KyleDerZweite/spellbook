import type { AuthUser } from './types';

class AuthState {
	user: AuthUser | null = $state(null);

	get isAuthenticated(): boolean {
		return this.user !== null;
	}
}

export const authState = new AuthState();
