<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tick, untrack } from 'svelte';
	import type { InventoryEntry } from '@spellbook/contracts/inventory.ts';
	import { inventoryRowSlots, type InventoryRowSlot } from '#lib/inventory/rows.ts';
	let {
		total,
		getEntry,
		loadedIndexes,
		version,
		queryKey,
		pinnedIndexes = [],
		initialIndex = 0,
		row,
		onRange
	}: {
		total: number;
		getEntry: (index: number) => InventoryEntry | undefined;
		loadedIndexes: number[];
		version: number;
		queryKey: string;
		pinnedIndexes?: number[];
		initialIndex?: number;
		row: Snippet<[InventoryEntry, number]>;
		onRange: (start: number, end: number) => void;
	} = $props();
	let viewport = $state<HTMLUListElement | null>(null),
		scrollTop = $state(untrack(() => initialIndex * 96)),
		height = $state(650),
		measurementVersion = $state(0),
		focused = $state<number | null>(null);
	let focusedSnapshot = $state<{ queryKey: string; index: number; entry: InventoryEntry } | null>(
		null
	);
	function rendered(index: number) {
		version;
		return (
			getEntry(index) ??
			(focusedSnapshot?.queryKey === queryKey && focusedSnapshot.index === index
				? focusedSnapshot.entry
				: undefined)
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
		return Math.min(total, indexAt(scrollTop + height) + 5, start + 195);
	});
	let indexes = $derived(
		[
			...new Set([
				...pinnedIndexes,
				...(focused === null ? [] : [focused]),
				...Array.from({ length: Math.max(0, Math.min(200, end - start)) }, (_, i) => start + i)
			])
		]
			.slice(0, 200)
			.filter((i) => i >= 0 && i < total)
			.sort((a, b) => a - b)
	);
	let measuredCount = $derived.by(() => {
		measurementVersion;
		return heights.size;
	});
	let rows = $derived(inventoryRowSlots(queryKey, indexes, rendered));
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
			const top = viewport.getBoundingClientRect().top + window.scrollY;
			window.scrollTo({
				top: Math.max(0, top + offset(index) + intra - headerHeight()),
				behavior: 'instant'
			});
			readGeometry();
		}
	}
	function measure(node: HTMLElement, slot: InventoryRowSlot) {
		const { index, queryKey: owner } = slot;
		const id = slot.entry?.id;
		if (!id) return;
		const observer = new ResizeObserver(() => {
			if (queryKey !== owner || rendered(index)?.id !== id || !node.isConnected) return;
			const measured = node.getBoundingClientRect().height + 8;
			const old = heights.get(index);
			if (old?.id === id && Math.abs(old.height - measured) < 0.5) return;
			const previous = old?.height ?? estimate;
			heights.set(index, { id, height: measured });
			if (viewport && index < indexAt(scrollTop)) {
				window.scrollBy({ top: measured - previous, behavior: 'instant' });
				readGeometry();
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
			scrollTop = initialIndex * estimate;
			void scrollToIndex(initialIndex);
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
					void scrollToIndex(anchorIndex, intra);
				}
			}
		});
	});
	$effect(() => {
		if (!viewport) return;
		const element = viewport;
		const scroll = () => readGeometry();
		const focus = (event: FocusEvent) => {
			const row = (event.target as HTMLElement).closest<HTMLElement>('[data-inventory-index]');
			if (!row) {
				focused = null;
				focusedSnapshot = null;
				return;
			}
			const index = Number(row.dataset.inventoryIndex);
			const entry = getEntry(index);
			if (
				!entry ||
				row.dataset.inventoryQuery !== queryKey ||
				entry.id !== row.dataset.inventoryEntry
			)
				return;
			focused = index;
			focusedSnapshot = { queryKey, index, entry };
		};
		window.addEventListener('scroll', scroll, { passive: true });
		window.addEventListener('resize', scroll, { passive: true });
		element.addEventListener('focusin', focus);
		resizeObserver = new ResizeObserver(readGeometry);
		resizeObserver.observe(element);
		return () => {
			window.removeEventListener('scroll', scroll);
			window.removeEventListener('resize', scroll);
			element.removeEventListener('focusin', focus);
			resizeObserver?.disconnect();
		};
	});
	function headerHeight() {
		return (
			parseFloat(
				getComputedStyle(document.documentElement).getPropertyValue('--app-header-height')
			) || 80
		);
	}
	function readGeometry() {
		if (!viewport) return;
		scrollTop = Math.max(0, -viewport.getBoundingClientRect().top + headerHeight());
		height = Math.max(0, window.innerHeight - headerHeight());
	}
	$effect(() => {
		onRange(start, end);
	});
</script>

<ul
	bind:this={viewport}
	class="virtual-inventory"
	aria-label="Inventory entries"
	style:height={`${extent}px`}
	data-measurements={measuredCount}
	data-inventory-rendered={rows.length}
>
	{#each rows as slot (slot.key)}<li
			class="virtual-row"
			data-inventory-index={slot.index}
			data-inventory-query={slot.queryKey}
			data-inventory-entry={slot.entry?.id}
			style:top={`${offset(slot.index)}px`}
			use:measure={slot}
		>
			{#if slot.entry}{@render row(slot.entry, slot.index)}{:else}<div
					class="row-placeholder"
					aria-label="Loading inventory entry"
					aria-busy="true"
				></div>{/if}
		</li>{/each}
</ul>

<style>
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
</style>
