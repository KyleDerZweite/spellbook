import type { AuthSession, AuthUser } from './auth.ts';

export function validQrCredential(value: unknown): value is string {
	return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export type QrKind = 'browser' | 'device';
export type QrStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'consumed';
export interface QrRequestInfo {
	code: string;
	kind: QrKind;
	status: QrStatus;
	expiresAt: string;
}
export interface QrCreated {
	code: string;
	kind: QrKind;
	expiresAt: string;
	interval: 3;
	requesterSecret: string;
}
export interface QrCreateRequest {
	kind: QrKind;
}
export interface QrCreateResponse {
	code: string;
	kind: QrKind;
	expiresAt: string;
	interval: 3;
	verificationUri: string;
	requesterSecret?: string;
}
export interface QrDecisionRequest {
	decision: 'approve' | 'deny';
}
export interface QrTokenRequest {
	code: string;
	requesterSecret?: string;
}
export type QrTokenResponse =
	| { status: 'pending' | 'denied' | 'expired' | 'consumed' }
	| { status: 'authenticated'; expiresAt: string; token?: string };
export type QrRedemption =
	| { kind: QrKind; status: 'pending' | 'denied' | 'expired' | 'consumed' }
	| { kind: QrKind; status: 'authenticated'; session: AuthSession };

// These credentials are supplied by the server adapter, never deserialized wholesale.
// The stored kind determines which credential may redeem a request.
export interface QrRequester {
	requesterSecret?: string;
	browserSecret?: string;
	browserAuthenticated?: boolean;
}
export interface QrAuthApplication {
	create(kind: QrKind, address: string): Promise<QrCreated>;
	inspect(actor: AuthUser, code: string, address: string): Promise<QrRequestInfo>;
	decide(
		actor: AuthUser,
		code: string,
		decision: 'approve' | 'deny',
		address: string
	): Promise<QrRequestInfo>;
	redeem(code: string, requester: QrRequester, address: string): Promise<QrRedemption>;
}
