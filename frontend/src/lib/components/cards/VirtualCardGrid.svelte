<script lang="ts">
	import type { CardDocument } from '#lib/search/types.ts';
	import CardGridItem from './CardGridItem.svelte';

	interface Props {
		cards: CardDocument[];
		selectedId?: string | null;
		onSelect?: (card: CardDocument) => void;
		class?: string;
	}

	let { cards, selectedId = null, onSelect, class: className = '' }: Props = $props();

	const GAP = 16;
	const MIN_COL_WIDTH = 190;
	const INFO_HEIGHT = 56;
	const OVERSCAN = 3;

	let wrapperEl: HTMLDivElement | null = $state(null);
	let containerWidth = $state(0);
	let viewportHeight = $state(0);
	let visibleTop = $state(0);

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
				grid-template-columns: repeat({cols}, minmax(0, 1fr));
				grid-auto-rows: {rowHeight - GAP}px;
				gap: {GAP}px;
				position: absolute;
				left: 0;
				right: 0;
				top: {offsetY}px;
			"
		>
			{#each visibleItems as { card } (card.id)}
				<CardGridItem {card} selected={selectedId === card.id} {onSelect} />
			{/each}
		</div>
	{/if}
</div>
