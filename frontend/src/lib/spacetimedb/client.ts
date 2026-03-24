import {
	PUBLIC_SPACETIMEDB_URL,
	PUBLIC_SPACETIMEDB_MODULE
} from '$env/static/public';
import { DbConnection } from '$bindings';
import type { Collection, CollectionCard, UserProfile } from '$bindings/types';
import { spacetimeState } from './state.svelte';

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

/**
 * Connect to SpacetimeDB and set up subscriptions.
 * Safe to call multiple times; re-entrant guard prevents duplicate connections.
 */
export function connect(user: UserInfo): void {
	if (connection) return;

	try {
		connection = DbConnection.builder()
			.withUri(PUBLIC_SPACETIMEDB_URL)
			.withModuleName(PUBLIC_SPACETIMEDB_MODULE)
			.onConnect((conn: any, _identity: unknown, _token: unknown) => {
				spacetimeState.connected = true;
				spacetimeState.error = null;

				// Register the current user
				conn.reducers.connectUser({
					accountId: user.accountId,
					username: user.username,
					email: user.email
				});

				// Subscribe to all user-relevant tables
				conn
					.subscriptionBuilder()
					.subscribe([
						'SELECT * FROM collection',
						'SELECT * FROM collection_card',
						'SELECT * FROM user_profile'
					])
					.onApplied((ctx: any) => {
						syncFromCache(ctx);
					})
					.onError(() => {
						spacetimeState.error = 'Subscription error';
					});

				// Table callbacks for real-time updates
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
	spacetimeState.collections = [...ctx.db.collection.iter()] as Collection[];
	spacetimeState.collectionCards = [...ctx.db.collectionCard.iter()] as CollectionCard[];

	const profiles = [...ctx.db.userProfile.iter()] as UserProfile[];
	spacetimeState.userProfile = profiles[0] ?? null;
}

/** Set up table onInsert/onDelete/onUpdate callbacks for real-time sync. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setupTableCallbacks(conn: any): void {
	// Collection table
	conn.db.collection.onInsert((_ctx: any, row: Collection) => {
		spacetimeState.collections = [...spacetimeState.collections, row];
	});

	conn.db.collection.onDelete((_ctx: any, row: Collection) => {
		spacetimeState.collections = spacetimeState.collections.filter((c) => c.id !== row.id);
	});

	conn.db.collection.onUpdate((_ctx: any, _oldRow: Collection, newRow: Collection) => {
		spacetimeState.collections = spacetimeState.collections.map((c) =>
			c.id === newRow.id ? newRow : c
		);
	});

	// CollectionCard table
	conn.db.collectionCard.onInsert((_ctx: any, row: CollectionCard) => {
		spacetimeState.collectionCards = [...spacetimeState.collectionCards, row];
	});

	conn.db.collectionCard.onDelete((_ctx: any, row: CollectionCard) => {
		spacetimeState.collectionCards = spacetimeState.collectionCards.filter(
			(c) => c.compositeId !== row.compositeId
		);
	});

	conn.db.collectionCard.onUpdate(
		(_ctx: any, _oldRow: CollectionCard, newRow: CollectionCard) => {
			spacetimeState.collectionCards = spacetimeState.collectionCards.map((c) =>
				c.compositeId === newRow.compositeId ? newRow : c
			);
		}
	);

	// UserProfile table
	conn.db.userProfile.onInsert((_ctx: any, row: UserProfile) => {
		spacetimeState.userProfile = row;
	});

	conn.db.userProfile.onUpdate((_ctx: any, _oldRow: UserProfile, newRow: UserProfile) => {
		spacetimeState.userProfile = newRow;
	});
}
