<script lang="ts">
  import { state as stdb } from "$lib/spacetimedb/state.svelte";
  import CollectionStats from "$lib/components/collections/CollectionStats.svelte";

  let ownedCollections = $derived(
    stdb.collections.filter((c) => c.ownerId === stdb.userProfile?.accountId),
  );
</script>

<div class="space-y-8">
  <div>
    <h1 class="text-3xl font-bold">
      {#if stdb.userProfile}
        Welcome, {stdb.userProfile.username}
      {:else}
        Spellbook
      {/if}
    </h1>
    <p class="mt-1 text-gray-400">
      Your Magic: The Gathering collection manager.
    </p>
  </div>

  <!-- Quick actions -->
  <div class="flex gap-4">
    <a
      href="/search"
      class="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-surface-900 hover:bg-accent-400"
    >
      Search Cards
    </a>
    <a
      href="/collections"
      class="rounded-lg border border-surface-600 px-4 py-2 text-sm font-medium text-gray-300 hover:border-surface-500"
    >
      My Collections ({ownedCollections.length})
    </a>
  </div>

  <!-- Overview -->
  {#if ownedCollections.length > 0}
    <div class="space-y-3">
      <h2 class="text-lg font-semibold">Your Collections</h2>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each ownedCollections as coll (coll.id)}
          {@const cards = stdb.collectionCards.filter(
            (cc) => cc.collectionId === coll.id,
          )}
          <a
            href="/collections/{coll.id}"
            class="rounded-lg border border-surface-700 bg-surface-800 p-4 transition-colors hover:border-surface-600"
          >
            <p class="font-medium">{coll.name}</p>
            <div class="mt-2">
              <CollectionStats {cards} />
            </div>
          </a>
        {/each}
      </div>
    </div>
  {:else if stdb.connected}
    <div
      class="rounded-lg border border-surface-700 bg-surface-800 p-8 text-center"
    >
      <p class="text-gray-400">No collections yet.</p>
      <a
        href="/collections"
        class="mt-2 inline-block text-sm text-accent-400 hover:underline"
      >
        Create your first collection
      </a>
    </div>
  {/if}

  {#if !stdb.connected}
    <p class="text-sm text-gray-500">
      Connecting to server...
      {#if stdb.error}
        <span class="text-red-400">{stdb.error}</span>
      {/if}
    </p>
  {/if}
</div>
