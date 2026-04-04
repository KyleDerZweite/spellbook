<script lang="ts">
	import type { CardDocument } from '$lib/search/types';
	import RarityBadge from './RarityBadge.svelte';

	interface Props {
		cards: CardDocument[];
		selectedId?: string | null;
		onSelect?: (card: CardDocument) => void;
		class?: string;
	}

	let { cards, selectedId = null, onSelect, class: className = '' }: Props = $props();

	const GAP = 16;
	const MIN_COL_WIDTH = 160;
	const INFO_HEIGHT = 42;
	const OVERSCAN = 3;

	let wrapperEl: HTMLDivElement | null = $state(null);
	let containerWidth = $state(0);
	let viewportHeight = $state(0);
	let visibleTop = $state(0);

	const cols = $derived(
		containerWidth > 0 ? Math.max(1, Math.floor((containerWidth + GAP) / (MIN_COL_WIDTH + GAP))) : 1
	);
	const colWidth = $derived(cols > 0 ? (containerWidth - GAP * (cols - 1)) / cols : MIN_COL_WIDTH);
	const imageHeight = $derived(colWidth * (7 / 5));
	const rowHeight = $derived(imageHeight + INFO_HEIGHT + GAP);
	const totalRows = $derived(Math.ceil(cards.length / cols));
	const totalHeight = $derived(Math.max(0, totalRows > 0 ? totalRows * rowHeight - GAP : 0));

	const startRow = $derived(
		totalRows <= 0 || rowHeight <= 0
			? 0
			: Math.max(0, Math.floor(visibleTop / rowHeight) - OVERSCAN)
	);
	const endRow = $derived(
		totalRows <= 0 || rowHeight <= 0
			? -1
			: Math.min(totalRows - 1, Math.ceil((visibleTop + viewportHeight) / rowHeight) + OVERSCAN)
	);

	const visibleItems = $derived.by(() => {
		if (endRow < startRow || containerWidth <= 0) return [];
		const start = startRow * cols;
		const end = Math.min(cards.length, (endRow + 1) * cols);
		return cards.slice(start, end).map((card, i) => ({ card, index: start + i }));
	});

	const offsetY = $derived(startRow * rowHeight);

	function getScrollParent(el: HTMLElement): HTMLElement {
		let parent = el.parentElement;
		while (parent) {
			const style = getComputedStyle(parent);
			if (style.overflowY === 'auto' || style.overflowY === 'scroll') return parent;
			parent = parent.parentElement;
		}
		return document.documentElement;
	}

	$effect(() => {
		if (!wrapperEl) return;
		const wrapper = wrapperEl;
		const scrollParent = getScrollParent(wrapper);

		function measure() {
			containerWidth = wrapper.clientWidth;
			viewportHeight = scrollParent.clientHeight;
			const wr = wrapper.getBoundingClientRect();
			const pr = scrollParent.getBoundingClientRect();
			visibleTop = Math.max(0, pr.top - wr.top);
		}

		const ro = new ResizeObserver(() => measure());
		ro.observe(wrapper);
		ro.observe(scrollParent);

		let ticking = false;
		function onScroll() {
			if (!ticking) {
				requestAnimationFrame(() => {
					measure();
					ticking = false;
				});
				ticking = true;
			}
		}

		scrollParent.addEventListener('scroll', onScroll, { passive: true });
		measure();

		return () => {
			ro.disconnect();
			scrollParent.removeEventListener('scroll', onScroll);
		};
	});
</script>

<div bind:this={wrapperEl} class={className} style="height: {totalHeight}px; position: relative;">
	{#if containerWidth > 0}
		<div
			class="grid"
			style="
				grid-template-columns: repeat({cols}, 1fr);
				gap: {GAP}px;
				position: absolute;
				left: 0;
				right: 0;
				top: {offsetY}px;
			"
		>
			{#each visibleItems as { card } (card.id)}
				{@const isSelected = selectedId === card.id}
				<button
					class="card-grid-item group cursor-pointer overflow-hidden rounded bg-stone p-0 text-left"
					class:card-grid-item--selected={isSelected}
					onclick={() => onSelect?.(card)}
				>
					<div
						class="relative overflow-hidden"
						style="aspect-ratio: 5 / 7; border-radius: 8px 8px 0 0;"
					>
						<img
							src={card.image_uri || card.image_uri_small}
							alt={card.name}
							loading="lazy"
							class="block h-full w-full object-cover"
						/>
						{#if card.is_foil_available}
							<div
								class="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
								style="
									background: linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%);
									background-size: 200% 200%;
									animation: foil-shimmer 1.5s ease-in-out infinite;
								"
							></div>
						{/if}
					</div>
					<div class="px-2 py-1.5">
						<p
							class="truncate font-display text-xs leading-tight text-text-primary"
							title={card.name}
						>
							{card.name}
						</p>
						<div class="mt-0.5 flex items-center gap-1.5">
							<span class="font-mono text-[10px] uppercase text-text-secondary">
								{card.set_code}
							</span>
							<RarityBadge rarity={card.rarity} />
						</div>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>
