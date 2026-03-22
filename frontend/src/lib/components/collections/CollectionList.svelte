<script lang="ts">
  import { state as stdb } from '$lib/spacetimedb/state.svelte';
  import { getConnection } from '$lib/spacetimedb/client';

  let showCreate = $state(false);
  let newName = $state('');
  let newDescription = $state('');

  function createCollection() {
    const conn = getConnection();
    if (!conn || !stdb.userProfile || !newName.trim()) return;

    conn.reducers.createCollection({
      accountId: stdb.userProfile.accountId,
      name: newName.trim(),
      description: newDescription.trim(),
    });

    newName = '';
    newDescription = '';
    showCreate = false;
  }

  function deleteCollection(collectionId: string) {
    const conn = getConnection();
    if (!conn || !stdb.userProfile) return;

    conn.reducers.deleteCollection({
      accountId: stdb.userProfile.accountId,
      collectionId,
    });
  }

  let ownedCollections = $derived(
    stdb.collections.filter((c) => c.ownerId === stdb.userProfile?.accountId),
  );

  function cardCount(collectionId: string): number {
    return stdb.collectionCards
      .filter((cc) => cc.collectionId === collectionId)
      .reduce((sum, cc) => sum + cc.quantity, 0);
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h2 class="text-xl font-bold">My Collections</h2>
    <button
      onclick={() => (showCreate = !showCreate)}
      class="rounded-lg bg-accent-500 px-3 py-1.5 text-sm font-medium text-surface-900 hover:bg-accent-400"
    >
      {showCreate ? 'Cancel' : 'New Collection'}
    </button>
  </div>

  {#if showCreate}
    <form onsubmit={(e) => { e.preventDefault(); createCollection(); }} class="space-y-3 rounded-lg border border-surface-600 bg-surface-800 p-4">
      <input
        type="text"
        bind:value={newName}
        placeholder="Collection name"
        class="w-full rounded-lg border border-surface-600 bg-surface-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-accent-500"
      />
      <input
        type="text"
        bind:value={newDescription}
        placeholder="Description (optional)"
        class="w-full rounded-lg border border-surface-600 bg-surface-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-accent-500"
      />
      <button
        type="submit"
        disabled={!newName.trim()}
        class="rounded-lg bg-accent-500 px-3 py-1.5 text-sm font-medium text-surface-900 hover:bg-accent-400 disabled:opacity-50"
      >
        Create
      </button>
    </form>
  {/if}

  {#if ownedCollections.length === 0 && !showCreate}
    <p class="py-8 text-center text-gray-500">
      No collections yet. Create one to start tracking your cards.
    </p>
  {:else}
    <div class="space-y-2">
      {#each ownedCollections as coll (coll.id)}
        <a
          href="/collections/{coll.id}"
          class="flex items-center justify-between rounded-lg border border-surface-700 bg-surface-800 px-4 py-3 transition-colors hover:border-surface-600"
        >
          <div>
            <p class="font-medium">{coll.name}</p>
            {#if coll.description}
              <p class="text-sm text-gray-500">{coll.description}</p>
            {/if}
          </div>
          <div class="flex items-center gap-4">
            <span class="text-sm text-gray-400">{cardCount(coll.id)} cards</span>
            <button
              onclick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (confirm(`Delete "${coll.name}" and all its cards?`)) {
                  deleteCollection(coll.id);
                }
              }}
              class="text-sm text-red-400 hover:text-red-300"
            >
              Delete
            </button>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
