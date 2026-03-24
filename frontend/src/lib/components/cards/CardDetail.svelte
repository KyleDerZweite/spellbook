<script lang="ts">
	import { Dialog } from 'bits-ui';
	import ManaCost from './ManaCost.svelte';
	import RarityBadge from './RarityBadge.svelte';
	import CardQuickAdd from './CardQuickAdd.svelte';
	import OrnamentalDivider from '$lib/components/layout/OrnamentalDivider.svelte';
	import { searchPrintings } from '$lib/search/meilisearch';
	import type { CardDocument } from '$lib/search/types';
	import { getManaFontClass } from '$lib/utils/manaCostParser';

	interface Props {
		card: CardDocument;
		onClose: () => void;
	}

	let { card, onClose }: Props = $props();

	let printings: CardDocument[] = $state([]);
	let selectedPrinting: CardDocument | null = $state(null);
	let loadingPrintings = $state(true);
	let detailOpen = $state(false);

	// bits-ui Dialog needs a false->true transition to properly open
	$effect(() => {
		detailOpen = true;
	});

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

	/** A segment in oracle text: either a plain text run or a mana symbol. */
	interface OracleSegment {
		type: 'text' | 'mana';
		value: string;
	}

	/** Split a single oracle text line into text and mana symbol segments. */
	function parseOracleSegments(text: string): OracleSegment[] {
		if (!text) return [];
		const segments: OracleSegment[] = [];
		const regex = /\{([^}]+)\}/g;
		let lastIndex = 0;
		let match: RegExpExecArray | null;

		while ((match = regex.exec(text)) !== null) {
			if (match.index > lastIndex) {
				segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
			}
			segments.push({ type: 'mana', value: match[1] });
			lastIndex = match.index + match[0].length;
		}

		if (lastIndex < text.length) {
			segments.push({ type: 'text', value: text.slice(lastIndex) });
		}

		return segments;
	}

	let oracleLines = $derived(
		activeCard.oracle_text ? activeCard.oracle_text.split('\n') : []
	);

	let hasPowerToughness = $derived(
		activeCard.power != null && activeCard.toughness != null
	);
</script>

<Dialog.Root open={detailOpen} onOpenChange={handleOpenChange}>
	<Dialog.Portal>
		<!-- Overlay: flex centering so the modal sits in the middle -->
		<Dialog.Overlay
			class="fixed inset-0 z-40 flex items-center justify-center p-4"
			style="background: rgba(13, 11, 15, 0.85); backdrop-filter: blur(4px); animation: fade-in 200ms ease-out;"
		>
			<Dialog.Content
				class="relative z-50 flex w-full max-w-3xl flex-col overflow-y-auto rounded-lg lg:flex-row"
				style="
					max-height: 90vh;
					background-color: var(--color-stone);
					border: 1px solid rgba(196, 146, 42, 0.35);
					box-shadow: 0 0 0 1px rgba(255,255,255,0.04) inset, 0 24px 64px rgba(13, 11, 15, 0.9);
					animation: modal-enter 220ms ease-out;
				"
				onInteractOutside={(e) => e.preventDefault()}
			>
				<!-- Close button -->
				<Dialog.Close
					class="absolute right-3 top-3 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded border-none bg-void/60 text-text-secondary transition-colors hover:text-gold-bright"
					aria-label="Close card detail"
				>
					&#10005;
				</Dialog.Close>

				<!-- Left column: card image -->
				{#if activeCard.image_uri || activeCard.image_uri_small}
					<div
						class="w-full shrink-0 lg:w-[300px]"
						style="aspect-ratio: 488 / 680;"
					>
						<img
							src={activeCard.image_uri || activeCard.image_uri_small}
							alt={activeCard.name}
							class="block h-full w-full rounded-t-lg object-cover lg:rounded-l-lg lg:rounded-tr-none"
						/>
					</div>
				{/if}

				<!-- Right column: info panel -->
				<div class="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
					<!-- Header: Name + mana cost -->
					<div class="pr-8">
						<Dialog.Title
							class="font-display text-lg font-bold text-text-primary"
							level={2}
						>
							{activeCard.name}
						</Dialog.Title>

						<!-- Type line -->
						{#if activeCard.type_line}
							<p class="mt-0.5 break-words font-body text-sm italic text-text-secondary">
								{activeCard.type_line}
							</p>
						{/if}
					</div>

					<!-- Mana cost row -->
					{#if activeCard.mana_cost}
						<div class="flex items-center gap-2">
							<span class="font-display text-xs uppercase tracking-widest text-text-secondary">
								Mana Cost
							</span>
							<ManaCost cost={activeCard.mana_cost} />
						</div>
					{/if}

					<OrnamentalDivider />

					<!-- Oracle text -->
					{#if oracleLines.length > 0}
						<div>
							<h3 class="mb-1.5 font-display text-xs uppercase tracking-widest text-text-secondary">
								Oracle Text
							</h3>
							<div class="flex flex-col gap-1.5">
								{#each oracleLines as line}
									<p class="break-words font-body text-sm leading-relaxed text-text-primary">
										{#each parseOracleSegments(line) as seg}
											{#if seg.type === 'mana'}
												<i
													class="ms ms-shadow {getManaFontClass(seg.value)}"
													title={seg.value}
													role="img"
													aria-label="{seg.value} mana"
												></i>
											{:else}
												{seg.value}
											{/if}
										{/each}
									</p>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Power / Toughness -->
					{#if hasPowerToughness}
						<p class="font-body text-sm text-text-secondary">
							<span class="font-display text-xs uppercase tracking-wider text-text-muted">P/T</span>
							<span class="ml-1.5 font-medium text-text-primary">
								{activeCard.power}/{activeCard.toughness}
							</span>
						</p>
					{/if}

					<OrnamentalDivider />

					<!-- Printings section -->
					<div>
						<h3 class="mb-2 font-display text-xs uppercase tracking-widest text-text-secondary">
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

					<Dialog.Description class="sr-only">
						Details for {activeCard.name}{activeCard.type_line ? `, a ${activeCard.type_line} card` : ''}.
					</Dialog.Description>
				</div>
			</Dialog.Content>
		</Dialog.Overlay>
	</Dialog.Portal>
</Dialog.Root>
