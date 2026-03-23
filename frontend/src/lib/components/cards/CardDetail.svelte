<script lang="ts">
  import type { CardDocument } from '$lib/search/types';
  import { searchPrintings } from '$lib/search/meilisearch';
  import { Dialog } from 'bits-ui';
  import CardQuickAdd from './CardQuickAdd.svelte';

  let { card, onclose }: {
    card: CardDocument;
    onclose: () => void;
  } = $props();

  let printings = $state<CardDocument[]>([]);
  let loadingPrintings = $state(true);
  let selectedPrinting = $state<CardDocument | null>(null);
  let printingGen = 0;

  $effect(() => {
    const gen = ++printingGen;
    selectedPrinting = null;
    loadingPrintings = true;
    searchPrintings(card.oracle_id).then((result) => {
      if (gen !== printingGen) return;
      printings = result.hits;
      loadingPrintings = false;
    });
  });

  let displayCard = $derived(selectedPrinting ?? card);
</script>

<Dialog.Root
  open={true}
  onOpenChange={(open) => { if (!open) onclose(); }}
>
  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-40 bg-black/70 transition-opacity"
    />
    <Dialog.Content
      class="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-surface-800 p-6 shadow-xl outline-none sm:max-w-2xl"
      oninteractoutside={(e) => { e.preventDefault(); onclose(); }}
    >
      <div class="mb-4 flex items-start justify-between">
        <div>
          <Dialog.Title class="text-xl font-bold">{card.name}</Dialog.Title>
          <Dialog.Description class="text-sm text-gray-400">{card.type_line}</Dialog.Description>
        </div>
        <Dialog.Close
          class="text-2xl leading-none text-gray-400 hover:text-gray-200"
          aria-label="Close"
        >&times;</Dialog.Close>
      </div>

      <div class="flex flex-col gap-6 sm:flex-row">
        <!-- Main card image -->
        <div class="shrink-0">
          <img
            src={displayCard.image_uri}
            alt={displayCard.name}
            class="w-64 rounded-lg"
          />
          {#if displayCard.back_face_image_uri}
            <img
              src={displayCard.back_face_image_uri}
              alt={displayCard.back_face_name ?? 'Back face'}
              class="mt-2 w-64 rounded-lg"
            />
          {/if}
        </div>

        <!-- Card info -->
        <div class="flex-1 space-y-4">
          <div>
            <p class="text-sm text-gray-400">Mana Cost</p>
            <p class="font-mono">{card.mana_cost || 'None'}</p>
          </div>
          <div>
            <p class="text-sm text-gray-400">Oracle Text</p>
            <p class="whitespace-pre-line text-sm">{card.oracle_text || 'No text.'}</p>
          </div>
          {#if card.power || card.toughness}
            <div>
              <p class="text-sm text-gray-400">P/T</p>
              <p>{card.power}/{card.toughness}</p>
            </div>
          {/if}
        </div>
      </div>

      <!-- Printings picker -->
      <div class="mt-8">
        <h3 class="mb-3 text-lg font-semibold">
          Printings
          {#if !loadingPrintings}
            <span class="text-sm font-normal text-gray-500">({printings.length})</span>
          {/if}
        </h3>

        {#if loadingPrintings}
          <p class="text-sm text-gray-500">Loading printings...</p>
        {:else}
          <div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {#each printings as printing (printing.id)}
              <button
                type="button"
                onclick={() => (selectedPrinting = printing)}
                class="overflow-hidden rounded-lg border-2 transition-colors
                       {selectedPrinting?.id === printing.id
                         ? 'border-accent-500'
                         : 'border-transparent hover:border-surface-600'}"
              >
                <img
                  src={printing.image_uri_small || printing.image_uri}
                  alt="{printing.name} ({printing.set_code})"
                  loading="lazy"
                  class="aspect-[5/7] w-full object-cover"
                />
                <div class="bg-surface-700 px-1.5 py-1 text-center text-xs">
                  <span class="uppercase">{printing.set_code}</span>
                  {#if printing.is_foil_available}
                    <span class="text-accent-400"> F</span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Add to collection -->
      <div class="mt-6">
        <CardQuickAdd card={displayCard} />
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
