import { getDeckSnapshot } from './decks';
import { countPendingScanReviews } from './scan';
import { summarizeDashboard } from '#lib/mtg/dashboard.ts';

export async function getDashboard(accountId: string, game = 'mtg') {
	const [snapshot, pendingScanReviews] = await Promise.all([
		getDeckSnapshot(accountId, game),
		countPendingScanReviews(accountId, game).catch(() => null)
	]);
	return {
		...summarizeDashboard(snapshot.inventoryCards, snapshot.decks, snapshot.deckCards),
		pendingScanReviews
	};
}
