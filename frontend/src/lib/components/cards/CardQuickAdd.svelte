<script lang="ts">
  import type { CardDocument } from '$lib/search/types';
  import { state as stdb } from '$lib/spacetimedb/state.svelte';
  import { getConnection } from '$lib/spacetimedb/client';
  import { Select } from 'bits-ui';

  let { card }: { card: CardDocument } = $props();

  let selectedCollectionId = $state('');
  let isFoil = $state(false);
  let condition = $state('NM');
  let quantity = $state(1);
  let feedback = $state<{ type: 'success' | 'error'; message: string } | null>(null);

  const conditions = [
    { value: 'NM', label: 'Near Mint' },
    { value: 'LP', label: 'Lightly Played' },
    { value: 'MP', label: 'Moderately Played' },
    { value: 'HP', label: 'Heavily Played' },
    { value: 'DMG', label: 'Damaged' },
  ] as const;

  let ownedCollections = $derived(
    stdb.collections.filter((c) => c.ownerId === stdb.userProfile?.accountId),
  );

  let collectionItems = $derived(
    ownedCollections.map((c) => ({ value: c.id, label: c.name })),
  );

  let selectedConditionLabel = $derived(
    conditions.find((c) => c.value === condition)?.label ?? 'Near Mint',
  );

  let selectedCollectionLabel = $derived(
    ownedCollections.find((c) => c.id === selectedCollectionId)?.name ?? 'Select collection',
  );

  $effect(() => {
    if (ownedCollections.length > 0 && !selectedCollectionId) {
      selectedCollectionId = ownedCollections[0].id;
    }
  });

  function addToCollection() {
    const conn = getConnection();
    if (!conn || !stdb.userProfile || !selectedCollectionId) return;

    const qty = Math.max(1, Math.floor(quantity));

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
        quantity: qty,
      });
      feedback = { type: 'success', message: `Added ${qty}x ${card.name} to collection` };
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
      <!-- Collection select -->
      <Select.Root type="single" bind:value={selectedCollectionId}>
        <Select.Trigger
          class="flex w-full items-center justify-between rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-gray-100 outline-none focus:border-accent-500"
          aria-label="Collection"
        >
          {selectedCollectionLabel}
          <span class="text-gray-500">&#9662;</span>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            class="z-[60] rounded-lg border border-surface-600 bg-surface-800 p-1 shadow-xl"
            sideOffset={4}
          >
            <Select.Viewport>
              {#each collectionItems as item (item.value)}
                <Select.Item
                  value={item.value}
                  label={item.label}
                  class="cursor-pointer rounded px-3 py-1.5 text-sm text-gray-100 outline-none data-[highlighted]:bg-surface-700"
                >
                  {item.label}
                </Select.Item>
              {/each}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      <div class="flex gap-3">
        <!-- Condition select -->
        <Select.Root type="single" bind:value={condition}>
          <Select.Trigger
            class="flex items-center gap-2 rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-gray-100 outline-none focus:border-accent-500"
            aria-label="Condition"
          >
            {selectedConditionLabel}
            <span class="text-gray-500">&#9662;</span>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content
              class="z-[60] rounded-lg border border-surface-600 bg-surface-800 p-1 shadow-xl"
              sideOffset={4}
            >
              <Select.Viewport>
                {#each conditions as cond (cond.value)}
                  <Select.Item
                    value={cond.value}
                    label={cond.label}
                    class="cursor-pointer rounded px-3 py-1.5 text-sm text-gray-100 outline-none data-[highlighted]:bg-surface-700"
                  >
                    {cond.label}
                  </Select.Item>
                {/each}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        <label class="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" bind:checked={isFoil} disabled={!card.is_foil_available} />
          Foil
        </label>

        <input
          type="number"
          bind:value={quantity}
          min="1"
          max="99"
          step="1"
          aria-label="Quantity"
          class="w-16 rounded-lg border border-surface-600 bg-surface-800 px-2 py-2 text-center text-sm text-gray-100 outline-none focus:border-accent-500"
        />
      </div>

      <button
        onclick={addToCollection}
        disabled={!selectedCollectionId || !stdb.connected || !stdb.userProfile}
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
