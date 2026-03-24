<script lang="ts">
	import type { Collection } from '$bindings/types';
	import OrnamentalDivider from '$lib/components/layout/OrnamentalDivider.svelte';
	import CollectionStats from './CollectionStats.svelte';
	import { spacetimeState } from '$lib/spacetimedb/state.svelte';
	import { getConnection } from '$lib/spacetimedb/client';

	let showCreateForm = $state(false);
	let newName = $state('');
	let newDescription = $state('');
	let confirmDeleteId: string | null = $state(null);

	function handleCreate() {
		const conn = getConnection();
		if (!conn || !newName.trim() || !spacetimeState.userProfile) return;

		conn.reducers.createCollection({
			accountId: spacetimeState.userProfile.accountId,
			name: newName.trim(),
			description: newDescription.trim()
		});

		newName = '';
		newDescription = '';
		showCreateForm = false;
	}

	function handleDelete(collectionId: string) {
		const conn = getConnection();
		if (!conn || !spacetimeState.userProfile) return;

		conn.reducers.deleteCollection({
			accountId: spacetimeState.userProfile.accountId,
			collectionId
		});

		confirmDeleteId = null;
	}

	// Accent colors for collection tiles
	const ACCENT_COLORS = [
		'var(--color-gold)',
		'var(--color-mana-blue)',
		'var(--color-mana-green)',
		'var(--color-mana-red)',
		'var(--color-ochre)',
		'var(--color-rarity-uncommon)'
	];

	function getAccentColor(index: number): string {
		return ACCENT_COLORS[index % ACCENT_COLORS.length];
	}
</script>

<div
	class="grid gap-6"
	style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));"
>
	{#each spacetimeState.collections as collection, i (collection.id)}
		{@const stats = spacetimeState.getCollectionStats(collection.id)}
		<div
			class="group relative flex flex-col overflow-hidden rounded transition-all duration-200"
			style="
				background-color: var(--color-stone);
				border: 1px solid rgba(196, 146, 42, 0.22);
				border-radius: 4px;
				box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
			"
			onmouseenter={(e) => {
				const el = e.currentTarget as HTMLElement;
				el.style.transform = 'translateY(-2px)';
				el.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 4px 16px rgba(138, 106, 42, 0.2)';
				el.style.borderColor = 'rgba(196, 146, 42, 0.4)';
			}}
			onmouseleave={(e) => {
				const el = e.currentTarget as HTMLElement;
				el.style.transform = 'translateY(0)';
				el.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.04)';
				el.style.borderColor = 'rgba(196, 146, 42, 0.22)';
			}}
		>
			<!-- Top accent strip -->
			<div class="h-1 w-full" style="background-color: {getAccentColor(i)};"></div>

			<a
				href="/collections/{collection.id}"
				class="flex flex-1 flex-col gap-2 p-4 no-underline"
			>
				<h2 class="font-display text-base font-bold text-text-primary">
					{collection.name}
				</h2>
				{#if collection.description}
					<p class="font-body text-sm text-text-secondary line-clamp-2">
						{collection.description}
					</p>
				{/if}
				<CollectionStats total={stats.total} unique={stats.unique} foils={stats.foils} class="mt-auto pt-2" />
			</a>

			<!-- Delete button -->
			<div class="flex items-center justify-end border-t px-3 py-2" style="border-color: rgba(196, 146, 42, 0.1);">
				{#if confirmDeleteId === collection.id}
					<div class="flex items-center gap-2">
						<span class="font-body text-xs text-error">Delete?</span>
						<button
							onclick={() => handleDelete(collection.id)}
							class="cursor-pointer rounded border px-2 py-1 font-body text-xs text-error transition-colors hover:bg-error/10"
							style="border-color: rgba(138, 32, 32, 0.4); background: transparent;"
						>
							Yes
						</button>
						<button
							onclick={() => (confirmDeleteId = null)}
							class="cursor-pointer rounded border px-2 py-1 font-body text-xs text-text-secondary transition-colors hover:text-text-primary"
							style="border-color: rgba(196, 146, 42, 0.2); background: transparent;"
						>
							No
						</button>
					</div>
				{:else}
					<button
						onclick={() => (confirmDeleteId = collection.id)}
						class="cursor-pointer border-none bg-transparent font-body text-xs text-text-muted transition-colors hover:text-error"
					>
						Delete
					</button>
				{/if}
			</div>
		</div>
	{/each}

	<!-- New Collection ghost tile -->
	{#if showCreateForm}
		<div
			class="flex flex-col overflow-hidden rounded"
			style="
				background-color: var(--color-stone);
				border: 1px solid rgba(196, 146, 42, 0.3);
				border-radius: 4px;
			"
		>
			<div class="h-1 w-full" style="background-color: var(--color-gold-dim);"></div>
			<div class="flex flex-col gap-3 p-4">
				<h2 class="font-display text-sm uppercase tracking-wider text-gold-bright">
					New Collection
				</h2>
				<input
					type="text"
					bind:value={newName}
					placeholder="Collection name..."
					class="w-full rounded px-3 py-2 font-body text-sm text-text-primary placeholder:italic placeholder:text-text-muted focus:outline-none"
					style="background-color: var(--color-crypt); border: 1px solid rgba(196, 146, 42, 0.3);"
					onfocus={(e: FocusEvent) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-gold)'; }}
					onblur={(e: FocusEvent) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(196, 146, 42, 0.3)'; }}
				/>
				<textarea
					bind:value={newDescription}
					placeholder="Description (optional)..."
					rows="2"
					class="w-full resize-none rounded px-3 py-2 font-body text-sm text-text-primary placeholder:italic placeholder:text-text-muted focus:outline-none"
					style="background-color: var(--color-crypt); border: 1px solid rgba(196, 146, 42, 0.3);"
					onfocus={(e: FocusEvent) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-gold)'; }}
					onblur={(e: FocusEvent) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(196, 146, 42, 0.3)'; }}
				></textarea>
				<div class="flex gap-2">
					<button
						onclick={handleCreate}
						disabled={!newName.trim()}
						class="flex-1 cursor-pointer rounded py-2 font-display text-xs font-bold uppercase tracking-wider transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50"
						style="
							background: linear-gradient(135deg, var(--color-gold-dim), var(--color-gold));
							color: var(--color-text-on-gold);
							border: 1px solid var(--color-gold-bright);
						"
					>
						Create
					</button>
					<button
						onclick={() => { showCreateForm = false; newName = ''; newDescription = ''; }}
						class="cursor-pointer rounded border px-4 py-2 font-display text-xs uppercase tracking-wider text-text-secondary transition-colors hover:text-text-primary"
						style="border-color: rgba(196, 146, 42, 0.3); background: transparent;"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	{:else}
		<button
			onclick={() => (showCreateForm = true)}
			class="flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-2 rounded transition-all duration-200 hover:border-gold-dim"
			style="
				background-color: transparent;
				border: 2px dashed rgba(196, 146, 42, 0.25);
				border-radius: 4px;
			"
			onmouseenter={(e) => {
				const el = e.currentTarget as HTMLElement;
				el.style.borderColor = 'rgba(196, 146, 42, 0.5)';
				el.style.backgroundColor = 'rgba(28, 23, 32, 0.5)';
			}}
			onmouseleave={(e) => {
				const el = e.currentTarget as HTMLElement;
				el.style.borderColor = 'rgba(196, 146, 42, 0.25)';
				el.style.backgroundColor = 'transparent';
			}}
		>
			<span class="text-2xl text-gold-dim">+</span>
			<span class="font-display text-xs uppercase tracking-wider text-text-secondary">
				New Collection
			</span>
		</button>
	{/if}
</div>
