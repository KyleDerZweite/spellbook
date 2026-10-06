<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tick, untrack } from 'svelte';
	import ScrollArea from '#lib/components/ui/scroll-area/ScrollArea.svelte';
	import type { InventoryEntry } from '@spellbook/contracts/inventory.ts';
	let {
		total,
		getEntry,
		loadedIndexes,
		version,
		queryKey,
		pinnedIndexes = [],
		row,
		onRange
	}: {
		total: number;
		getEntry: (index: number) => InventoryEntry | undefined;
		loadedIndexes: number[];
		version: number;
		queryKey: string;
		pinnedIndexes?: number[];
		row: Snippet<[InventoryEntry, number]>;
		onRange: (start: number, end: number) => void;
	} = $props();
	let viewport = $state<HTMLDivElement | null>(null),
		scrollTop = $state(0),
		height = $state(650),
		measurementVersion = $state(0),
		focused = $state<number | null>(null);
	let focusedSnapshot = $state<{ index: number; entry: InventoryEntry } | null>(null);
	function rendered(index: number) {
		version;
		return (
			getEntry(index) ?? (focusedSnapshot?.index === index ? focusedSnapshot.entry : undefined)
		);
	}
	const heights = new Map<number, { id: string; height: number }>();
	const estimate = 96;
	let resizeObserver: ResizeObserver | undefined;
	function offset(index: number) {
		measurementVersion;
		let value = index * estimate;
		for (const [i, row] of heights) if (i < index) value += row.height - estimate;
		return value;
	}
	function indexAt(top: number) {
		let low = 0,
			high = total;
		while (low < high) {
			const middle = Math.floor((low + high) / 2);
			if (offset(middle + 1) <= top) low = middle + 1;
			else high = middle;
		}
		return Math.min(low, Math.max(0, total - 1));
	}
	let start = $derived.by(() => {
		measurementVersion;
		version;
		return Math.max(0, indexAt(scrollTop) - 4);
	});
	let end = $derived.by(() => {
		measurementVersion;
		version;
		return Math.min(total, indexAt(scrollTop + height) + 5);
	});
	let indexes = $derived(
		[
			...new Set([
				...Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i),
				...pinnedIndexes,
				...(focused === null ? [] : [focused])
			])
		]
			.filter((i) => i >= 0 && i < total)
			.sort((a, b) => a - b)
	);
	let measuredCount = $derived.by(() => {
		measurementVersion;
		return heights.size;
	});
	let extent = $derived.by(() => {
		measurementVersion;
		return offset(total);
	});
	export function anchor() {
		const index = indexAt(scrollTop);
		return { id: rendered(index)?.id ?? null, index, intra: scrollTop - offset(index) };
	}
	export async function scrollToIndex(
		index: number,
		intra = 0,
		isCurrent: () => boolean = () => true
	) {
		await tick();
		if (viewport && isCurrent()) {
			viewport.scrollTop = Math.max(0, offset(index) + intra);
			scrollTop = viewport.scrollTop;
		}
	}
	function measure(node: HTMLElement, index: number) {
		const observer = new ResizeObserver(() => {
			const entry = rendered(index);
			if (!entry) return;
			const measured = node.getBoundingClientRect().height + 8;
			const old = heights.get(index);
			if (old?.id === entry.id && Math.abs(old.height - measured) < 0.5) return;
			const previous = old?.height ?? estimate;
			heights.set(index, { id: entry.id, height: measured });
			if (viewport && index < indexAt(viewport.scrollTop)) {
				viewport.scrollTop += measured - previous;
				scrollTop = viewport.scrollTop;
			}
			measurementVersion++;
		});
		observer.observe(node);
		return {
			destroy() {
				observer.disconnect();
			}
		};
	}
	$effect(() => {
		queryKey;
		untrack(() => {
			heights.clear();
			focused = null;
			focusedSnapshot = null;
			measurementVersion++;
			scrollTop = 0;
			if (viewport) viewport.scrollTop = 0;
		});
	});
	$effect(() => {
		version;
		const retained = new Set([
			...loadedIndexes,
			...pinnedIndexes,
			...(focused === null ? [] : [focused])
		]);
		untrack(() => {
			const anchorIndex = indexAt(scrollTop),
				intra = scrollTop - offset(anchorIndex);
			let changed = false;
			for (const index of heights.keys())
				if (!retained.has(index)) {
					heights.delete(index);
					changed = true;
				}
			if (changed) {
				measurementVersion++;
				if (viewport) {
					viewport.scrollTop = Math.max(0, offset(anchorIndex) + intra);
					scrollTop = viewport.scrollTop;
				}
			}
		});
	});
	$effect(() => {
		if (!viewport) return;
		const element = viewport;
		const scroll = () => (scrollTop = element.scrollTop);
		const focus = (event: FocusEvent) => {
			const row = (event.target as HTMLElement).closest<HTMLElement>('[data-inventory-index]');
			focused = row ? Number(row.dataset.inventoryIndex) : null;
			const entry = focused === null ? undefined : getEntry(focused);
			focusedSnapshot = entry && focused !== null ? { index: focused, entry } : null;
		};
		element.addEventListener('scroll', scroll, { passive: true });
		element.addEventListener('focusin', focus);
		resizeObserver = new ResizeObserver(() => (height = element.clientHeight));
		resizeObserver.observe(element);
		return () => {
			element.removeEventListener('scroll', scroll);
			element.removeEventListener('focusin', focus);
			resizeObserver?.disconnect();
		};
	});
	$effect(() => {
		onRange(start, end);
	});
</script>

<ScrollArea
	class="inventory-scroll"
	bind:viewportRef={viewport}
	viewportLabel="Inventory entries"
	smoothWheel={false}
>
	<ul
		class="virtual-inventory"
		aria-label="Inventory entries"
		style:height={`${extent}px`}
		data-measurements={measuredCount}
	>
		{#each indexes as index (index)}<li
				class="virtual-row"
				data-inventory-index={index}
				style:top={`${offset(index)}px`}
				use:measure={index}
			>
				{#if rendered(index)}{@render row(rendered(index)!, index)}{:else}<div
						class="row-placeholder"
						aria-label="Loading inventory entry"
						aria-busy="true"
					></div>{/if}
			</li>{/each}
	</ul>
</ScrollArea>

<style>
	:global(.inventory-scroll) {
		height: clamp(320px, calc(100dvh - 23rem), 850px);
		min-height: 320px;
		margin-top: 0.5rem;
	}
	.virtual-inventory {
		position: relative;
		margin: 0;
		padding: 0;
		list-style: none;
		overflow-anchor: none;
		min-width: 0;
	}
	.virtual-row {
		position: absolute;
		left: 0;
		right: 0;
		min-width: 0;
		list-style: none;
	}
	.row-placeholder {
		height: 88px;
		background: var(--color-surface);
		border-radius: 0.5rem;
		opacity: 0.45;
	}
	@media (max-width: 600px) {
		:global(.inventory-scroll) {
			height: calc(100dvh - 22rem);
			min-height: 320px;
		}
	}
</style>
