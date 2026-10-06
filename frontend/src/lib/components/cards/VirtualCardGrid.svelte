<script lang="ts">
	import { untrack } from 'svelte';
	import type { CardDocument } from '#lib/search/types.ts';
	import type { CatalogRange } from '#lib/search/catalogWindow.ts';
	import CardGridItem from './CardGridItem.svelte';

	interface Props {
		cards?: CardDocument[];
		totalCount?: number;
		getCard?: (index: number) => CardDocument | undefined;
		onRangeChange?: (range: CatalogRange) => void;
		resetKey?: number;
		onFocusReset?: () => void;
		selectedId?: string | null;
		onSelect?: (card: CardDocument) => void;
		class?: string;
	}

	let {
		cards = [],
		totalCount = cards.length,
		getCard = (index: number) => cards[index],
		onRangeChange,
		resetKey = 0,
		onFocusReset,
		selectedId = null,
		onSelect,
		class: className = ''
	}: Props = $props();

	const itemCount = $derived(totalCount);
	const resetToken = $derived(resetKey);

	const GAP = 16;
	const MIN_COL_WIDTH = 190;
	const INFO_HEIGHT = 56;
	const OVERSCAN = 3;

	let wrapperEl: HTMLDivElement | null = $state(null);
	let containerWidth = $state(0);
	let viewportHeight = $state(0);
	let visibleTop = $state(0);
	let direction: 1 | -1 = $state(1);
	let focused: { index: number; card: CardDocument } | null = $state(null);

	const cols = $derived(
		containerWidth > 0
			? Math.max(
					1,
					Math.floor((containerWidth + GAP) / ((containerWidth < 480 ? 130 : MIN_COL_WIDTH) + GAP))
				)
			: 1
	);
	const colWidth = $derived(cols > 0 ? (containerWidth - GAP * (cols - 1)) / cols : MIN_COL_WIDTH);
	const imageHeight = $derived(colWidth * (7 / 5));
	const rowHeight = $derived(imageHeight + INFO_HEIGHT + GAP);
	const totalRows = $derived(Math.ceil(itemCount / cols));
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
		const end = Math.min(itemCount, (endRow + 1) * cols);
		const indices = Array.from({ length: end - start }, (_, index) => start + index);
		if (focused && !indices.includes(focused.index)) {
			indices.push(focused.index);
			indices.sort((a, b) => a - b);
		}
		return indices.map((index) => ({
			index,
			card: focused?.index === index ? focused.card : getCard(index)
		}));
	});

	$effect(() => {
		if (containerWidth <= 0 || endRow < startRow) return;
		onRangeChange?.({
			start: startRow * cols,
			end: Math.min(itemCount, (endRow + 1) * cols),
			direction
		});
	});

	$effect(() => {
		void resetToken;
		if (!wrapperEl) return;
		const wrapper = wrapperEl;
		untrack(() => {
			if (wrapper.contains(document.activeElement)) onFocusReset?.();
			focused = null;
			getScrollParent(wrapper).scrollTop = 0;
			visibleTop = 0;
		});
	});

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
			const nextTop = Math.max(0, pr.top - wr.top);
			if (nextTop !== visibleTop) direction = nextTop > visibleTop ? 1 : -1;
			visibleTop = nextTop;
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
		untrack(measure);

		return () => {
			ro.disconnect();
			scrollParent.removeEventListener('scroll', onScroll);
		};
	});
</script>

<div bind:this={wrapperEl} class={className} style="height: {totalHeight}px; position: relative;">
	{#if containerWidth > 0}
		{#each visibleItems as { card, index } (index)}
			<div
				class="catalog-slot"
				style="position: absolute; top: {Math.floor(index / cols) * rowHeight}px; left: {(index %
					cols) *
					(colWidth + GAP)}px; width: {colWidth}px; height: {rowHeight - GAP}px;"
				onfocusin={() => {
					if (card) focused = { index, card };
				}}
				onfocusout={(event) => {
					if (!event.currentTarget.contains(event.relatedTarget as Node | null)) focused = null;
				}}
			>
				{#if card}
					<CardGridItem {card} selected={selectedId === card.id} {onSelect} />
				{:else}
					<div class="catalog-placeholder" aria-hidden="true">
						<div class="catalog-placeholder-image"></div>
						<div class="catalog-placeholder-name"></div>
						<div class="catalog-placeholder-meta"></div>
					</div>
				{/if}
			</div>
		{/each}
	{/if}
</div>

<style>
	.catalog-slot :global(.card-grid-item) {
		width: 100%;
	}
	.catalog-placeholder-image {
		aspect-ratio: 5 / 7;
		border-radius: 9px;
		background: var(--color-slate);
	}
	.catalog-placeholder-name {
		width: 75%;
		height: 14px;
		margin-top: 8px;
		border-radius: 3px;
		background: var(--color-slate);
	}
	.catalog-placeholder-meta {
		width: 40%;
		height: 12px;
		margin-top: 4px;
		border-radius: 3px;
		background: var(--color-slate);
	}
</style>
