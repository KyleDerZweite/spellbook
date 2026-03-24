<script lang="ts">
	import { Dialog } from 'bits-ui';
	import ManaCost from './ManaCost.svelte';
	import RarityBadge from './RarityBadge.svelte';
	import CardQuickAdd from './CardQuickAdd.svelte';
	import OrnamentalDivider from '$lib/components/layout/OrnamentalDivider.svelte';
	import { searchPrintings } from '$lib/search/meilisearch';
	import type { CardDocument } from '$lib/search/types';

	interface Props {
		card: CardDocument;
		onClose: () => void;
	}

	let { card, onClose }: Props = $props();

	let printings: CardDocument[] = $state([]);
	let selectedPrinting: CardDocument | null = $state(null);
	let loadingPrintings = $state(true);
	let detailOpen = $state(true);

	// Active card is either the selected printing or the original card
	let activeCard = $derived(selectedPrinting ?? card);

	// CRITICAL: fetch printings with AbortController cleanup to prevent navigation bugs
	$effect(() => {
		const oracleId = card.oracle_id;
		const controller = new AbortController();
		selectedPrinting = null;
		loadingPrintings = true;

		searchPrintings(oracleId)
			.then((result) => {
				if (!controller.signal.aborted) {
					printings = result.hits;
					loadingPrintings = false;
				}
			})
			.catch(() => {
				if (!controller.signal.aborted) {
					loadingPrintings = false;
				}
			});

		return () => controller.abort();
	});

	function handleOpenChange(open: boolean) {
		if (!open) {
			onClose();
		}
		detailOpen = open;
	}

	/** Parse oracle text for display, handling mana symbols and line breaks. */
	function formatOracleText(text: string): string[] {
		if (!text) return [];
		return text.split('\n');
	}

	let oracleLines = $derived(formatOracleText(activeCard.oracle_text ?? ''));

	/** Extract flavor text from oracle text if present, or empty. */
	let hasPowerToughness = $derived(
		activeCard.power !== undefined && activeCard.toughness !== undefined
	);
</script>

<Dialog.Root open={detailOpen} onOpenChange={handleOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-40"
			style="background: rgba(13, 11, 15, 0.85); backdrop-filter: blur(4px); animation: fade-in 200ms ease-out;"
		/>

		<Dialog.Content
			class="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col overflow-y-auto"
			style="
				background-color: var(--color-stone);
				border-left: 1px solid rgba(196, 146, 42, 0.3);
				box-shadow: 0 0 0 1px rgba(255,255,255,0.04) inset, -8px 0 40px rgba(13, 11, 15, 0.8);
				animation: slide-up 200ms ease-out;
			"
		>
			<!-- Close button -->
			<Dialog.Close
				class="absolute right-3 top-3 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded border-none bg-void/60 text-text-secondary transition-colors hover:text-gold-bright"
				aria-label="Close card detail"
			>
				&#10005;
			</Dialog.Close>

			<!-- Card image -->
			<div class="relative w-full shrink-0" style="aspect-ratio: 488 / 680;">
				<img
					src={activeCard.image_uri}
					alt={activeCard.name}
					class="block h-full w-full object-cover"
				/>
			</div>

			<!-- Card info panel -->
			<div class="flex flex-col gap-3 p-4">
				<!-- Header: Name + mana cost -->
				<Dialog.Title
					class="flex items-start justify-between gap-2 font-display text-lg font-bold text-text-primary"
					level={2}
				>
					<span>{activeCard.name}</span>
					{#if activeCard.mana_cost}
						<ManaCost cost={activeCard.mana_cost} />
					{/if}
				</Dialog.Title>

				<!-- Type line -->
				<p class="font-body text-sm italic text-text-secondary">{activeCard.type_line}</p>

				<OrnamentalDivider />

				<!-- Oracle text -->
				{#if oracleLines.length > 0}
					<div class="flex flex-col gap-1.5">
						{#each oracleLines as line}
							<p class="font-body text-sm text-text-primary">{line}</p>
						{/each}
					</div>
				{/if}

				<!-- Power / Toughness -->
				{#if hasPowerToughness}
					<p class="font-body text-sm text-text-secondary">
						<span class="font-medium text-text-primary">{activeCard.power}</span>
						/
						<span class="font-medium text-text-primary">{activeCard.toughness}</span>
					</p>
				{/if}

				<OrnamentalDivider />

				<!-- Printings section -->
				<div>
					<h3
						class="mb-2 font-display text-xs uppercase tracking-widest text-text-secondary"
					>
						Printings
					</h3>
					{#if loadingPrintings}
						<p class="font-body text-xs italic text-text-muted">Loading printings...</p>
					{:else if printings.length > 0}
						<div class="flex flex-wrap gap-1.5">
							{#each printings as printing}
								{@const isActive =
									selectedPrinting?.id === printing.id ||
									(!selectedPrinting && printing.id === card.id)}
								<button
									onclick={() => (selectedPrinting = printing)}
									class="inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 font-mono text-[11px] transition-all duration-150"
									style="
										background-color: {isActive ? 'var(--color-mist)' : 'var(--color-slate)'};
										border: 1px solid {isActive ? 'var(--color-gold)' : 'rgba(196, 146, 42, 0.2)'};
										color: {isActive ? 'var(--color-gold-bright)' : 'var(--color-text-secondary)'};
									"
								>
									<span class="uppercase">{printing.set_code}</span>
									<RarityBadge rarity={printing.rarity} />
								</button>
							{/each}
						</div>
					{:else}
						<p class="font-body text-xs italic text-text-muted">No other printings found.</p>
					{/if}
				</div>

				<OrnamentalDivider />

				<!-- Quick add to collection -->
				<CardQuickAdd card={activeCard} />
			</div>

			<Dialog.Description class="sr-only">
				Details for {activeCard.name}, a {activeCard.type_line} card.
			</Dialog.Description>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
