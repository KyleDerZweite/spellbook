<script lang="ts">
  import { filters, COLORS, RARITIES, type Color, type Rarity } from '$lib/search/filters.svelte';

  const colorLabels: Record<Color, string> = {
    W: 'White',
    U: 'Blue',
    B: 'Black',
    R: 'Red',
    G: 'Green',
  };

  const colorClasses: Record<Color, string> = {
    W: 'bg-amber-100 text-amber-900',
    U: 'bg-blue-500 text-white',
    B: 'bg-gray-800 text-gray-200 border border-gray-600',
    R: 'bg-red-600 text-white',
    G: 'bg-green-600 text-white',
  };
</script>

<div class="space-y-4">
  <div>
    <p class="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Colors</p>
    <div class="flex flex-wrap gap-2">
      {#each COLORS as color}
        <button
          onclick={() => filters.toggleColor(color)}
          class="rounded-full px-3 py-1 text-xs font-medium transition-opacity
                 {colorClasses[color]}
                 {filters.selectedColors.has(color) ? 'opacity-100' : 'opacity-40'}"
        >
          {colorLabels[color]}
        </button>
      {/each}
    </div>
  </div>

  <div>
    <p class="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Rarity</p>
    <div class="flex flex-wrap gap-2">
      {#each RARITIES as rarity}
        <button
          onclick={() => filters.toggleRarity(rarity)}
          class="rounded-lg border px-3 py-1 text-xs font-medium capitalize transition-colors
                 {filters.selectedRarities.has(rarity)
                   ? 'border-accent-500 text-accent-400'
                   : 'border-surface-600 text-gray-500 hover:text-gray-300'}"
        >
          {rarity}
        </button>
      {/each}
    </div>
  </div>

  {#if filters.activeFilterCount > 0}
    <button
      onclick={() => filters.clear()}
      class="text-xs text-gray-500 hover:text-gray-300"
    >
      Clear filters
    </button>
  {/if}
</div>
