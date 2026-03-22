<script lang="ts">
  import type { CardDocument } from '$lib/search/types';

  let { cards, onselect }: {
    cards: CardDocument[];
    onselect?: (card: CardDocument) => void;
  } = $props();
</script>

{#if cards.length === 0}
  <p class="py-8 text-center text-gray-500">No cards to display.</p>
{:else}
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
    {#each cards as card (card.id)}
      <button
        type="button"
        onclick={() => onselect?.(card)}
        class="group overflow-hidden rounded-lg transition-transform hover:scale-105"
      >
        <img
          src={card.image_uri_small || card.image_uri}
          alt={card.name}
          loading="lazy"
          class="aspect-[5/7] w-full object-cover"
        />
      </button>
    {/each}
  </div>
{/if}
