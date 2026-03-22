<script lang="ts">
  import type { CardDocument } from '$lib/search/types';
  import { state as stdb } from '$lib/spacetimedb/state.svelte';
  import { getConnection } from '$lib/spacetimedb/client';

  let { card }: { card: CardDocument } = $props();

  let selectedCollectionId = $state('');
  let isFoil = $state(false);
  let condition = $state('NM');
  let quantity = $state(1);
  let feedback = $state<{ type: 'success' | 'error'; message: string } | null>(null);

  const conditions = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const;

  let ownedCollections = $derived(
    stdb.collections.filter((c) => c.ownerId === stdb.userProfile?.accountId),
  );

  $effect(() => {
    if (ownedCollections.length > 0 && !selectedCollectionId) {
      selectedCollectionId = ownedCollections[0].id;
    }
  });

  function addToCollection() {
    const conn = getConnection();
    if (!conn || !stdb.userProfile || !selectedCollectionId) return;

    try {
      conn.reducers.addToCollection({
        accountId: stdb.userProfile.accountId,
        collectionId: selectedCollectionId,
        scryfallId: card.id,
        oracleId: card.oracle_id,
        name: card.name,
        setCode: card.set_code,
        imageUri: card.image_uri,
        isFoil,
        condition,
        quantity,
      });
      feedback = { type: 'success', message: `Added ${quantity}x ${card.name} to collection` };
      setTimeout(() => (feedback = null), 3000);
    } catch (err) {
      feedback = { type: 'error', message: `Failed to add card: ${err}` };
    }
  }
</script>

<div class="rounded-lg border border-surface-600 bg-surface-900 p-4">
  <h4 class="mb-3 text-sm font-semibold">Add to Collection</h4>

  {#if ownedCollections.length === 0}
    <p class="text-sm text-gray-500">
      No collections.
      <a href="/collections" class="text-accent-400 hover:underline">Create one first.</a>
    </p>
  {:else}
    <div class="space-y-3">
      <select
        bind:value={selectedCollectionId}
        class="w-full rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-gray-100"
      >
        {#each ownedCollections as coll (coll.id)}
          <option value={coll.id}>{coll.name}</option>
        {/each}
      </select>

      <div class="flex gap-3">
        <select
          bind:value={condition}
          class="rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-gray-100"
        >
          {#each conditions as cond}
            <option value={cond}>{cond}</option>
          {/each}
        </select>

        <label class="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" bind:checked={isFoil} disabled={!card.is_foil_available} />
          Foil
        </label>

        <input
          type="number"
          bind:value={quantity}
          min="1"
          max="99"
          class="w-16 rounded-lg border border-surface-600 bg-surface-800 px-2 py-2 text-center text-sm text-gray-100"
        />
      </div>

      <button
        onclick={addToCollection}
        disabled={!selectedCollectionId || !stdb.connected}
        class="w-full rounded-lg bg-accent-500 py-2 text-sm font-medium text-surface-900 hover:bg-accent-400 disabled:opacity-50"
      >
        Add to Collection
      </button>

      {#if feedback}
        <p class="text-sm {feedback.type === 'success' ? 'text-green-400' : 'text-red-400'}">
          {feedback.message}
        </p>
      {/if}
    </div>
  {/if}
</div>
