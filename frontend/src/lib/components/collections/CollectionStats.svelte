<script lang="ts">
  import type { CollectionCard } from '$bindings/types';

  let { cards }: { cards: CollectionCard[] } = $props();

  let totalCards = $derived(cards.reduce((sum, c) => sum + c.quantity, 0));
  let uniqueCards = $derived(cards.length);
  let foilCount = $derived(cards.filter((c) => c.isFoil).reduce((sum, c) => sum + c.quantity, 0));
</script>

<div class="flex gap-6 text-sm text-gray-400">
  <div>
    <span class="font-medium text-gray-200">{totalCards}</span> total
  </div>
  <div>
    <span class="font-medium text-gray-200">{uniqueCards}</span> unique
  </div>
  {#if foilCount > 0}
    <div>
      <span class="font-medium text-accent-400">{foilCount}</span> foil
    </div>
  {/if}
</div>
