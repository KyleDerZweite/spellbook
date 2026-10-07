<script lang="ts">
	import { untrack, tick } from 'svelte';
	import ActionMenu from '#lib/components/ui/menu/ActionMenu.svelte';
	import type { InventoryGroup } from '#lib/types/legacy.ts';
	let {
		groups,
		canonicalURL,
		lazy = false,
		initialIndex = 0,
		onRange,
		dialogOpen,
		onRename,
		onRemove
	}: {
		groups: InventoryGroup[];
		canonicalURL?: URL;
		lazy?: boolean;
		initialIndex?: number;
		onRange?: (index: number) => void;
		dialogOpen: boolean;
		onRename: (group: InventoryGroup, trigger: HTMLElement | null) => void;
		onRemove: (group: InventoryGroup, trigger: HTMLElement | null) => void;
	} = $props();

	let list = $state<HTMLUListElement | null>(null);
	let top = $state(untrack(() => initialIndex * 112));
	let viewportHeight = $state(650);
	let measurements = $state(0);
	let focused = $state<number | null>(null);
	const heights = new Map<number, { id: string; height: number }>();
	let snapshot: { id: string | null; index: number; intra: number } | null = null;
	let mounted = true;
	function offset(index: number) {
		measurements;
		let value = index * 112;
		for (const [i, row] of heights) if (i < index) value += row.height - 112;
		return value;
	}
	function indexAt(value: number) {
		let low = 0,
			high = groups.length;
		while (low < high) {
			const middle = Math.floor((low + high) / 2);
			if (offset(middle + 1) <= value) low = middle + 1;
			else high = middle;
		}
		return Math.min(low, Math.max(0, groups.length - 1));
	}
	const start = $derived(lazy ? Math.max(0, indexAt(top) - 4) : 0);
	const end = $derived(
		lazy ? Math.min(groups.length, indexAt(top + viewportHeight) + 5, start + 199) : groups.length
	);
	const indexes = $derived(
		[
			...new Set([
				...Array.from({ length: end - start }, (_, i) => start + i),
				...(lazy && focused !== null ? [focused] : [])
			])
		]
			.slice(0, lazy ? 200 : 500)
			.sort((a, b) => a - b)
	);
	function headerHeight() {
		return (
			parseFloat(
				getComputedStyle(document.documentElement).getPropertyValue('--app-header-height')
			) || 80
		);
	}
	function geometry() {
		if (!list || !lazy) return;
		top = Math.max(0, -list.getBoundingClientRect().top + headerHeight());
		viewportHeight = Math.max(0, window.innerHeight - headerHeight());
		const index = indexAt(top);
		snapshot = { id: groups[index]?.id ?? null, index, intra: top - offset(index) };
	}
	export async function scrollToIndex(
		index: number,
		intra = 0,
		isCurrent: () => boolean = () => true
	) {
		await tick();
		if (!list || !lazy || !mounted || !isCurrent()) return;
		window.scrollTo({
			top: Math.max(
				0,
				list.getBoundingClientRect().top + window.scrollY + offset(index) + intra - headerHeight()
			),
			behavior: 'instant'
		});
		geometry();
	}
	function measure(node: HTMLElement, index: number) {
		if (!lazy) return;
		const id = groups[index]?.id;
		if (!id) return;
		const observer = new ResizeObserver(() => {
			if (!mounted || !node.isConnected || groups[index]?.id !== id) return;
			const height = node.getBoundingClientRect().height + 12;
			const old = heights.get(index)?.height ?? 112;
			if (Math.abs(old - height) < 0.5) return;
			const anchor = snapshot;
			heights.set(index, { id, height });
			measurements++;
			if (anchor && index < anchor.index) void scrollToIndex(anchor.index, anchor.intra);
		});
		observer.observe(node);
		return {
			destroy() {
				observer.disconnect();
			}
		};
	}
	$effect(() => {
		if (!lazy || !list) return;
		const element = list;
		const focus = (event: FocusEvent) => {
			const row = (event.target as HTMLElement).closest<HTMLElement>('[data-group-index]');
			focused = row ? Number(row.dataset.groupIndex) : null;
		};
		window.addEventListener('scroll', geometry, { passive: true });
		window.addEventListener('resize', geometry, { passive: true });
		element.addEventListener('focusin', focus);
		void scrollToIndex(untrack(() => initialIndex));
		return () => {
			window.removeEventListener('scroll', geometry);
			window.removeEventListener('resize', geometry);
			element.removeEventListener('focusin', focus);
		};
	});
	$effect(() => {
		const next = groups;
		untrack(() => {
			if (!lazy || !snapshot) return;
			const anchor = snapshot;
			const index = anchor.id ? next.findIndex((group) => group.id === anchor.id) : -1;
			if (index !== anchor.index && index >= 0) void scrollToIndex(index, anchor.intra);
		});
	});

	$effect(() => {
		const retained = new Set(indexes);
		untrack(() => {
			const anchor = snapshot;
			let changed = false;
			for (const index of heights.keys())
				if (!retained.has(index)) {
					heights.delete(index);
					changed = true;
				}
			if (changed) {
				measurements++;
				if (anchor) void scrollToIndex(anchor.index, anchor.intra);
			}
		});
	});
	$effect(() => {
		if (lazy) onRange?.(start);
	});
	$effect(() => {
		return () => {
			mounted = false;
		};
	});
	function groupHref(id: string) {
		const url = new URL(canonicalURL ?? 'http://local/mtg/inventory');
		url.searchParams.set('view', 'groups');
		url.searchParams.set('group', id);
		url.searchParams.set('page', '1');
		url.searchParams.delete('offset');
		url.searchParams.delete('limit');
		return url.pathname + url.search;
	}
	let triggers = $state<Record<string, HTMLButtonElement | null>>({});
	$effect(() => {
		const retained = new Set(indexes.map((index) => groups[index]?.id));
		untrack(() => {
			for (const id of Object.keys(triggers)) if (!retained.has(id)) delete triggers[id];
		});
	});
</script>

{#if groups.length === 0}
	<div class="empty-state">
		<p>No groups yet. Create one, then assign cards from their row menu.</p>
	</div>
{:else}
	<ul
		bind:this={list}
		class="group-directory"
		class:lazy
		aria-label="Inventory groups"
		style:height={lazy ? `${offset(groups.length)}px` : undefined}
		data-group-rendered={indexes.length}
	>
		{#each indexes as index (groups[index].id)}
			{@const group = groups[index]}
			<li
				data-group-index={index}
				style:top={lazy ? `${offset(index)}px` : undefined}
				use:measure={index}
			>
				<a href={groupHref(group.id)} class="group-link">
					<svg
						aria-hidden="true"
						width="22"
						height="22"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.4"
						><path
							d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"
						/></svg
					>
					<span
						><strong>{group.name}</strong><small
							>{group.quantity.toLocaleString()}
							{group.quantity === 1 ? 'card' : 'cards'} · {group.entryCount}
							{group.entryCount === 1 ? 'entry' : 'entries'}</small
						></span
					>
				</a>
				<ActionMenu
					label={`Actions for group ${group.name}`}
					iconOnly
					bind:triggerRef={() => triggers[group.id] ?? null, (ref) => (triggers[group.id] = ref)}
					onCloseAutoFocus={(event) => {
						if (dialogOpen) event.preventDefault();
					}}
					items={[
						{ label: 'Rename', onSelect: () => onRename(group, triggers[group.id] ?? null) },
						{
							label: 'Delete group',
							destructive: true,
							onSelect: () => onRemove(group, triggers[group.id] ?? null)
						}
					]}
				/>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.group-directory {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 19rem), 1fr));
		gap: 0.75rem;
		margin-top: 1rem;
	}
	.group-directory.lazy {
		display: block;
		position: relative;
		overflow-anchor: none;
	}
	.group-directory.lazy li {
		position: absolute;
		left: 0;
		right: 0;
	}
	.group-directory li {
		display: flex;
		align-items: center;
		min-width: 0;
		gap: 0.25rem;
		padding: 0.625rem;
		border-radius: 0.625rem;
		background: var(--color-surface);
	}
	.group-link {
		display: flex;
		flex: 1;
		align-items: center;
		min-width: 0;
		gap: 0.875rem;
		padding: 0.5rem;
		text-decoration: none;
	}
	.group-link svg {
		flex-shrink: 0;
		color: var(--color-icon-inventory, var(--color-text-secondary));
	}
	.group-link span {
		display: flex;
		flex-direction: column;
		min-width: 0;
		gap: 0.375rem;
	}
	.group-link strong {
		font-size: 0.875rem;
		font-weight: 500;
		overflow-wrap: anywhere;
	}
	.group-link small {
		font-size: 0.6875rem;
		color: var(--color-text-muted);
	}
	.group-link:hover strong {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
</style>
