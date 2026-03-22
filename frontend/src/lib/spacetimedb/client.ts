import { DbConnection, type SubscriptionHandle } from '$bindings';
import {
  PUBLIC_SPACETIMEDB_URL,
  PUBLIC_SPACETIMEDB_MODULE,
} from '$env/static/public';
import { state } from './state.svelte';

let connection: DbConnection | null = null;
let subscription: SubscriptionHandle | null = null;

export interface UserIdentity {
  accountId: string;
  username: string;
  email: string;
}

export function connect(identity: UserIdentity): void {
  if (connection) return;

  connection = DbConnection.builder()
    .withUri(PUBLIC_SPACETIMEDB_URL)
    .withDatabaseName(PUBLIC_SPACETIMEDB_MODULE)
    .onConnect((conn, _identity, _token) => {
      state.connected = true;
      state.error = null;

      conn.reducers.connectUser({
        accountId: identity.accountId,
        username: identity.username,
        email: identity.email,
      });

      subscription = conn
        .subscriptionBuilder()
        .onApplied(() => {
          syncStateFromCache(conn);
        })
        .onError((ctx) => {
          state.error = `Subscription error: ${ctx.event?.message ?? 'Unknown error'}`;
        })
        .subscribe([
          'SELECT * FROM user_profile',
          'SELECT * FROM collection',
          'SELECT * FROM collection_card',
        ]);
    })
    .onDisconnect(() => {
      state.connected = false;
      connection = null;
      subscription = null;
    })
    .onConnectError((_ctx, err) => {
      state.error = `Connection failed: ${err.message}`;
      state.connected = false;
    })
    .build();

  setupTableHandlers(connection);
}

function setupTableHandlers(conn: DbConnection): void {
  conn.db.collection.onInsert((_ctx, row) => {
    state.collections = [...state.collections, row];
  });
  conn.db.collection.onDelete((_ctx, row) => {
    state.collections = state.collections.filter((c) => c.id !== row.id);
  });
  conn.db.collection.onUpdate((_ctx, _oldRow, newRow) => {
    state.collections = state.collections.map((c) => (c.id === newRow.id ? newRow : c));
  });

  conn.db.collectionCard.onInsert((_ctx, row) => {
    state.collectionCards = [...state.collectionCards, row];
  });
  conn.db.collectionCard.onDelete((_ctx, row) => {
    state.collectionCards = state.collectionCards.filter(
      (cc) => cc.compositeId !== row.compositeId,
    );
  });
  conn.db.collectionCard.onUpdate((_ctx, _oldRow, newRow) => {
    state.collectionCards = state.collectionCards.map((cc) =>
      cc.compositeId === newRow.compositeId ? newRow : cc,
    );
  });

  conn.db.userProfile.onInsert((_ctx, row) => {
    state.userProfile = row;
  });
  conn.db.userProfile.onUpdate((_ctx, _oldRow, newRow) => {
    state.userProfile = newRow;
  });
}

function syncStateFromCache(conn: DbConnection): void {
  state.collections = [...conn.db.collection.iter()];
  state.collectionCards = [...conn.db.collectionCard.iter()];
  const profiles = [...conn.db.userProfile.iter()];
  state.userProfile = profiles[0] ?? null;
}

export function getConnection(): DbConnection | null {
  return connection;
}

export function disconnect(): void {
  if (subscription) {
    subscription.unsubscribe();
    subscription = null;
  }
  if (connection) {
    connection.disconnect();
    connection = null;
  }
  state.connected = false;
}
