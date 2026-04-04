import { env } from '$env/dynamic/public';
import { DbConnection } from '$bindings';
import type { Deck, DeckCard, Inventory, InventoryCard, UserProfile } from '$bindings/types';
import { spacetimeState } from './state.svelte';

const DEFAULT_GAME = 'mtg';

// The SpacetimeDB generated types are complex and don't expose members cleanly
// for external TypeScript. We use `any` for the connection instance and cast
// through the runtime-validated SDK API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let connection: any = null;

interface UserInfo {
	accountId: string;
	username: string;
	email: string;
}

function sqlEscape(value: string): string {
	return value.replaceAll("'", "''");
}

/**
 * Connect to SpacetimeDB and set up subscriptions.
 * Safe to call multiple times; re-entrant guard prevents duplicate connections.
 */
export function connect(user: UserInfo): void {
	if (connection) return;

	try {
		connection = DbConnection.builder()
			.withUri(env.PUBLIC_SPACETIMEDB_URL)
			.withDatabaseName(env.PUBLIC_SPACETIMEDB_MODULE)
			.onConnect((conn: any, _identity: unknown, _token: unknown) => {
				spacetimeState.connected = true;
				spacetimeState.error = null;

				// Register the current user
				conn.reducers
					.connectUser({
						accountId: user.accountId,
						username: user.username,
						email: user.email
					})
					.catch((err: unknown) => {
						spacetimeState.error = `Failed to register user: ${String(err)}`;
					});

				conn.reducers
					.ensureInventory({
						accountId: user.accountId,
						game: DEFAULT_GAME
					})
					.catch((err: unknown) => {
						spacetimeState.error = `Failed to initialize inventory: ${String(err)}`;
					});

				const accountId = sqlEscape(user.accountId);

				conn
					.subscriptionBuilder()
					.onApplied((ctx: any) => {
						syncFromCache(ctx);
					})
					.onError(() => {
						spacetimeState.error = 'Subscription error';
					})
					.subscribe([
						`SELECT * FROM inventory WHERE owner_id = '${accountId}'`,
						`SELECT * FROM inventory_card WHERE owner_id = '${accountId}'`,
						`SELECT * FROM deck WHERE owner_id = '${accountId}'`,
						`SELECT * FROM deck_card WHERE owner_id = '${accountId}'`,
						`SELECT * FROM user_profile WHERE account_id = '${accountId}'`
					]);

				setupTableCallbacks(conn);
			})
			.onDisconnect(() => {
				spacetimeState.connected = false;
			})
			.onConnectError((_conn: unknown, err: unknown) => {
				spacetimeState.error = String(err);
				spacetimeState.connected = false;
			})
			.build();
	} catch (err) {
		spacetimeState.error = String(err);
	}
}

/**
 * Disconnect from SpacetimeDB and clean up.
 */
export function disconnect(): void {
	if (connection) {
		connection.disconnect();
		connection = null;
		spacetimeState.connected = false;
	}
}

/**
 * Get the current connection instance (for calling reducers directly).
 * Returns `any` because the generated SpacetimeDB types are opaque.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getConnection(): any {
	return connection;
}

/** Sync local state from the SpacetimeDB cache after subscription is applied. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function syncFromCache(ctx: any): void {
	spacetimeState.inventories = [...ctx.db.inventory.iter()] as Inventory[];
	spacetimeState.inventoryCards = [...ctx.db.inventoryCard.iter()] as InventoryCard[];
	spacetimeState.decks = [...ctx.db.deck.iter()] as Deck[];
	spacetimeState.deckCards = [...ctx.db.deckCard.iter()] as DeckCard[];

	const profiles = [...ctx.db.userProfile.iter()] as UserProfile[];
	spacetimeState.userProfile = profiles[0] ?? null;
}

/** Set up table onInsert/onDelete/onUpdate callbacks for real-time sync. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setupTableCallbacks(conn: any): void {
	conn.db.inventory.onInsert((_ctx: any, row: Inventory) => {
		spacetimeState.inventories = [...spacetimeState.inventories, row];
	});

	conn.db.inventory.onDelete((_ctx: any, row: Inventory) => {
		spacetimeState.inventories = spacetimeState.inventories.filter(
			(inventory) => inventory.id !== row.id
		);
	});

	conn.db.inventory.onUpdate((_ctx: any, _oldRow: Inventory, newRow: Inventory) => {
		spacetimeState.inventories = spacetimeState.inventories.map((inventory) =>
			inventory.id === newRow.id ? newRow : inventory
		);
	});

	conn.db.inventoryCard.onInsert((_ctx: any, row: InventoryCard) => {
		spacetimeState.inventoryCards = [...spacetimeState.inventoryCards, row];
	});

	conn.db.inventoryCard.onDelete((_ctx: any, row: InventoryCard) => {
		spacetimeState.inventoryCards = spacetimeState.inventoryCards.filter(
			(card) => card.entryId !== row.entryId
		);
	});

	conn.db.inventoryCard.onUpdate((_ctx: any, _oldRow: InventoryCard, newRow: InventoryCard) => {
		spacetimeState.inventoryCards = spacetimeState.inventoryCards.map((card) =>
			card.entryId === newRow.entryId ? newRow : card
		);
	});

	conn.db.deck.onInsert((_ctx: any, row: Deck) => {
		spacetimeState.decks = [...spacetimeState.decks, row];
	});

	conn.db.deck.onDelete((_ctx: any, row: Deck) => {
		spacetimeState.decks = spacetimeState.decks.filter((deck) => deck.id !== row.id);
	});

	conn.db.deck.onUpdate((_ctx: any, _oldRow: Deck, newRow: Deck) => {
		spacetimeState.decks = spacetimeState.decks.map((deck) =>
			deck.id === newRow.id ? newRow : deck
		);
	});

	conn.db.deckCard.onInsert((_ctx: any, row: DeckCard) => {
		spacetimeState.deckCards = [...spacetimeState.deckCards, row];
	});

	conn.db.deckCard.onDelete((_ctx: any, row: DeckCard) => {
		spacetimeState.deckCards = spacetimeState.deckCards.filter(
			(card) => card.entryId !== row.entryId
		);
	});

	conn.db.deckCard.onUpdate((_ctx: any, _oldRow: DeckCard, newRow: DeckCard) => {
		spacetimeState.deckCards = spacetimeState.deckCards.map((card) =>
			card.entryId === newRow.entryId ? newRow : card
		);
	});

	conn.db.userProfile.onInsert((_ctx: any, row: UserProfile) => {
		spacetimeState.userProfile = row;
	});

	conn.db.userProfile.onUpdate((_ctx: any, _oldRow: UserProfile, newRow: UserProfile) => {
		spacetimeState.userProfile = newRow;
	});
}
