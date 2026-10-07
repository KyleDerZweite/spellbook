/** A cached SSR user cannot prove that a terminal session has been renewed. */
export async function confirmAuthenticatedNavigation(
	accountId: string,
	signal: AbortSignal,
	current: () => boolean,
	request: typeof fetch = fetch
): Promise<boolean> {
	try {
		if (!current()) return false;
		const response = await request('/api/auth/session', { cache: 'no-store', signal });
		if (!current() || response.status !== 200) return false;
		const value = await response.json();
		return current() && value?.user?.accountId === accountId;
	} catch {
		return false;
	}
}
