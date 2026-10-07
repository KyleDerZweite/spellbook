import type { AuthUser } from '@spellbook/contracts/auth.ts';
import type { ProfileCardDefinition } from '@spellbook/contracts/profile.ts';

/** Only the first account snapshot comes from SSR; later reads own publication. */
export function selectProfileSeed<T extends { user: { accountId: string } }>(
	current: T | null,
	incoming: T
): T {
	return current?.user.accountId === incoming.user.accountId ? current : incoming;
}

export function reconcileProfileCardDraft(
	card: ProfileCardDefinition,
	baseline: ProfileCardDefinition,
	saved: ProfileCardDefinition
) {
	const nextCard = { ...card },
		nextBaseline = { ...baseline };
	for (const field of Object.keys(saved) as (keyof ProfileCardDefinition)[]) {
		if (card[field] === baseline[field]) {
			Object.assign(nextCard, { [field]: saved[field] });
			Object.assign(nextBaseline, { [field]: saved[field] });
		}
	}
	return { card: nextCard, baseline: nextBaseline };
}

export function selectAuthSeed(
	current: AuthUser | null,
	incoming: AuthUser | null
): AuthUser | null {
	return incoming && current?.accountId === incoming.accountId ? current : incoming;
}
