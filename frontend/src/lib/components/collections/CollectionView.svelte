<script lang="ts">
  import type { Collection, CollectionCard } from '$bindings/types';
  import { state as stdb } from '$lib/spacetimedb/state.svelte';
  import { getConnection } from '$lib/spacetimedb/client';
  import CollectionStats from './CollectionStats.svelte';

  let { collection }: { collection: Collection } = $props();

  let cards = $derived(
    stdb.collectionCards.filter((cc) => cc.collectionId === collection.id),
  );

  function removeCard(compositeId: string) {
    const conn = getConnection();
    if (!conn || !stdb.userProfile) return;
    conn.reducers.removeFromCollection({
      accountId: stdb.userProfile.accountId,
      compositeId,
    });
  }

  function updateQuantity(card: CollectionCard, delta: number) {
    const conn = getConnection();
    if (!conn || !stdb.userProfile) return;
    const newQuantity = card.quantity + delta;
    if (newQuantity <= 0) {
      removeCard(card.compositeId);
      return;
    }
    conn.reducers.updateCollectionCard({
      accountId: stdb.userProfile.accountId,
      compositeId: card.compositeId,
      quantity: newQuantity,
      notes: card.notes,
    });
  }
</script>

<div class="space-y-4">
  <div>
    <h2 class="text-xl font-bold">{collection.name}</h2>
    {#if collection.description}
      <p class="text-sm text-gray-400">{collection.description}</p>
    {/if}
  </div>

  <CollectionStats {cards} />

  {#if cards.length === 0}
    <p class="py-8 text-center text-gray-500">
      No cards in this collection yet.
      <a href="/search" class="text-accent-400 hover:underline">Search cards</a> to add some.
    </p>
  {:else}
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {#each cards as card (card.compositeId)}
        <div class="group relative overflow-hidden rounded-lg">
          <img
            src={card.imageUri}
            alt={card.name}
            loading="lazy"
            class="aspect-[5/7] w-full object-cover"
          />
          <div class="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 to-transparent opacity-0 transition-opacity group-hover:opacity-100">
            <div class="space-y-1 p-2">
              <p class="text-xs font-medium">{card.name}</p>
              <p class="text-xs text-gray-400">
                {card.setCode.toUpperCase()}
                {card.isFoil ? ' Foil' : ''}
                {card.condition}
              </p>
              <div class="flex items-center gap-2">
                <button
                  onclick={() => updateQuantity(card, -1)}
                  class="rounded bg-surface-700 px-2 py-0.5 text-xs hover:bg-surface-600"
                >-</button>
                <span class="text-xs font-medium">{card.quantity}</span>
                <button
                  onclick={() => updateQuantity(card, 1)}
                  class="rounded bg-surface-700 px-2 py-0.5 text-xs hover:bg-surface-600"
                >+</button>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
