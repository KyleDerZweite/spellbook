export function requireAuthenticatedAccountId(ctx: any): string {
	const jwt = ctx.senderAuth?.jwt;
	if (!ctx.senderAuth?.hasJWT || !jwt?.subject) {
		throw new Error('Authentication required');
	}

	return String(jwt.subject);
}

export function getProfileClaims(ctx: any): {
	accountId: string;
	username: string;
	email: string;
} {
	const jwt = ctx.senderAuth?.jwt;
	if (!ctx.senderAuth?.hasJWT || !jwt?.subject) {
		throw new Error('Authentication required');
	}

	const payload = (jwt.fullPayload ?? {}) as Record<string, unknown>;
	const accountId = String(jwt.subject);
	return {
		accountId,
		username: String(
			payload['preferred_username'] ?? payload['name'] ?? payload['email'] ?? accountId.slice(0, 12)
		),
		email: String(payload['email'] ?? '')
	};
}

export function assertOwner(ctx: any, ownerId: string): string {
	const accountId = requireAuthenticatedAccountId(ctx);
	if (ownerId !== accountId) {
		throw new Error('Permission denied');
	}

	return accountId;
}
