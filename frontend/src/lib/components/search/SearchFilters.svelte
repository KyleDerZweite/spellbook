<script lang="ts">
  import { filters, COLORS, RARITIES, type Color, type Rarity } from '$lib/search/filters.svelte';
  import { ToggleGroup } from 'bits-ui';

  const colorLabels: Record<Color, string> = {
    W: 'White',
    U: 'Blue',
    B: 'Black',
    R: 'Red',
    G: 'Green',
  };

  const colorClasses: Record<Color, { active: string; inactive: string }> = {
    W: { active: 'bg-amber-100 text-amber-900', inactive: 'bg-amber-100/30 text-amber-900/50' },
    U: { active: 'bg-blue-500 text-white', inactive: 'bg-blue-500/30 text-white/50' },
    B: { active: 'bg-gray-700 text-gray-200 ring-1 ring-gray-500', inactive: 'bg-gray-700/30 text-gray-200/40' },
    R: { active: 'bg-red-600 text-white', inactive: 'bg-red-600/30 text-white/50' },
    G: { active: 'bg-green-600 text-white', inactive: 'bg-green-600/30 text-white/50' },
  };

  let selectedColors = $state<string[]>([...filters.selectedColors]);
  let selectedRarities = $state<string[]>([...filters.selectedRarities]);

  $effect(() => {
    const next = new Set(selectedColors as Color[]);
    if (setsEqual(next, filters.selectedColors)) return;
    filters.selectedColors = next;
  });

  $effect(() => {
    const next = new Set(selectedRarities as Rarity[]);
    if (setsEqual(next, filters.selectedRarities)) return;
    filters.selectedRarities = next;
  });

  function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }
</script>

<div class="space-y-4">
  <div>
    <p class="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Colors</p>
    <ToggleGroup.Root
      type="multiple"
      bind:value={selectedColors}
      class="flex flex-wrap gap-2"
    >
      {#each COLORS as color}
        {@const active = selectedColors.includes(color)}
        <ToggleGroup.Item
          value={color}
          aria-label={colorLabels[color]}
          class="rounded-full px-3 py-1 text-xs font-medium transition-all
                 {active ? colorClasses[color].active : colorClasses[color].inactive}"
        >
          {colorLabels[color]}
        </ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>
  </div>

  <div>
    <p class="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Rarity</p>
    <ToggleGroup.Root
      type="multiple"
      bind:value={selectedRarities}
      class="flex flex-wrap gap-2"
    >
      {#each RARITIES as rarity}
        {@const active = selectedRarities.includes(rarity)}
        <ToggleGroup.Item
          value={rarity}
          aria-label={rarity}
          class="rounded-lg border px-3 py-1 text-xs font-medium capitalize transition-colors
                 {active
                   ? 'border-accent-500 text-accent-400'
                   : 'border-surface-600 text-gray-500 hover:text-gray-300'}"
        >
          {rarity}
        </ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>
  </div>

  {#if filters.activeFilterCount > 0}
    <button
      onclick={() => {
        filters.clear();
        selectedColors = [];
        selectedRarities = [];
      }}
      class="text-xs text-gray-500 hover:text-gray-300"
    >
      Clear filters
    </button>
  {/if}
</div>
