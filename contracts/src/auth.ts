export interface AuthUser {
	accountId: string;
	username: string;
	email: string;
	avatarId?: string;
	artworkId?: string;
}

export interface AuthSession {
	token: string;
	expiresAt: string;
}
export interface Authenticated {
	user: AuthUser;
	session: AuthSession;
}
export type AuthFailure = { kind: 'RateLimited'; message: string };

export interface LocalAuthApplication {
	authenticate(
		mode: 'login' | 'register',
		username: unknown,
		password: unknown,
		preferences?: { artworkId?: unknown }
	): Promise<Authenticated | null>;
	inspectSession(token: string | undefined): Promise<SessionInfo | null>;
	changePassword(
		actor: AuthUser,
		currentPassword: string,
		newPassword: string
	): Promise<AuthSession | null>;
	validateSession(token: string | undefined): Promise<AuthUser | null>;
	revokeSession(token: string | undefined): Promise<void>;
}

export interface SessionInfo {
	user: AuthUser;
	expiresAt: string;
}
export interface PasswordChange {
	currentPassword: string;
	newPassword: string;
}
