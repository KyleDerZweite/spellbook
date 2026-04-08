import { DbConnection } from '$bindings';
import type { Deck, DeckCard, Inventory, InventoryCard, UserProfile } from '$bindings/types';
import type { AuthUser } from '$lib/auth/types';
import { publicEnv } from '$lib/env/public';
import { spacetimeState } from './state.svelte';

// The SpacetimeDB generated types are complex and don't expose members cleanly
// for external TypeScript. We use `any` for the connection instance and cast
// through the runtime-validated SDK API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let connection: any = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let manualDisconnect = false;
let currentAuth: { user: AuthUser; token: string } | null = null;

const MAX_RECONNECT_DELAY_MS = 30_000;

function sqlEscape(value: string): string {
	return value.replaceAll("'", "''");
}

function clearReconnectTimer(): void {
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
}

function scheduleReconnect(): void {
	if (manualDisconnect || !currentAuth || reconnectTimer || connection) {
		return;
	}

	const delay = Math.min(1000 * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY_MS);
	reconnectAttempts += 1;
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		if (!manualDisconnect && currentAuth && !connection) {
			openConnection(currentAuth);
		}
	}, delay);
}

/**
 * Connect to SpacetimeDB and set up subscriptions.
 * Safe to call multiple times; re-entrant guard prevents duplicate connections.
 */
export function connect(auth: { user: AuthUser; token: string }): void {
	const sameAuth =
		currentAuth?.user.accountId === auth.user.accountId && currentAuth?.token === auth.token;
	currentAuth = auth;
	manualDisconnect = false;
	clearReconnectTimer();

	if (sameAuth && connection) {
		return;
	}

	reconnectAttempts = 0;
	if (connection) {
		connection.disconnect();
		connection = null;
	}

	openConnection(auth);
}

function openConnection(auth: { user: AuthUser; token: string }): void {
	try {
		connection = DbConnection.builder()
			.withUri(publicEnv.PUBLIC_SPACETIMEDB_URL)
			.withDatabaseName(publicEnv.PUBLIC_SPACETIMEDB_MODULE)
			.withToken(auth.token)
			.onConnect((conn: any, _identity: unknown, _token: unknown) => {
				reconnectAttempts = 0;
				spacetimeState.connected = true;
				spacetimeState.error = null;
				const accountId = sqlEscape(auth.user.accountId);

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
			.onDisconnect((_ctx: any, err?: Error) => {
				connection = null;
				spacetimeState.connected = false;
				if (err) {
					spacetimeState.error = String(err);
				}
				if (!manualDisconnect) {
					scheduleReconnect();
				}
			})
			.onConnectError((_conn: unknown, err: unknown) => {
				spacetimeState.error = String(err);
				spacetimeState.connected = false;
				connection = null;
				scheduleReconnect();
			})
			.build();
	} catch (err) {
		spacetimeState.error = String(err);
		connection = null;
		scheduleReconnect();
	}
}

/**
 * Disconnect from SpacetimeDB and clean up.
 */
export function disconnect(): void {
	manualDisconnect = true;
	currentAuth = null;
	reconnectAttempts = 0;
	clearReconnectTimer();
	if (connection) {
		connection.disconnect();
		connection = null;
	}
	spacetimeState.reset();
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
