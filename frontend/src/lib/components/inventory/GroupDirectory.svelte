<script lang="ts">
	import { untrack } from 'svelte';
	import ActionMenu from '#lib/components/ui/menu/ActionMenu.svelte';
	import type { InventoryGroup } from '#lib/types/legacy.ts';
	let {
		groups,
		dialogOpen,
		onRename,
		onRemove
	}: {
		groups: InventoryGroup[];
		dialogOpen: boolean;
		onRename: (group: InventoryGroup, trigger: HTMLElement | null) => void;
		onRemove: (group: InventoryGroup, trigger: HTMLElement | null) => void;
	} = $props();
	let triggers = $state<Record<string, HTMLButtonElement | null>>({});
	$effect(() => {
		const retained = new Set(groups.map((g) => g.id));
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
	<ul class="group-directory" aria-label="Inventory groups">
		{#each groups as group (group.id)}
			<li>
				<a href={`/mtg/inventory?view=groups&group=${group.id}`} class="group-link">
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
