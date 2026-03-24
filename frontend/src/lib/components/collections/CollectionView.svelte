<script lang="ts">
	import type { Collection, CollectionCard } from '$bindings/types';
	import OrnamentalDivider from '$lib/components/layout/OrnamentalDivider.svelte';
	import CollectionStats from './CollectionStats.svelte';
	import RarityBadge from '$lib/components/cards/RarityBadge.svelte';
	import { spacetimeState } from '$lib/spacetimedb/state.svelte';
	import { getConnection } from '$lib/spacetimedb/client';

	interface Props {
		collection: Collection;
	}

	let { collection }: Props = $props();

	let editMode = $state(false);
	let editName = $state('');
	let editDescription = $state('');

	function startEdit() {
		editName = collection.name;
		editDescription = collection.description;
		editMode = true;
	}

	let cards = $derived(spacetimeState.getCardsForCollection(collection.id));
	let stats = $derived(spacetimeState.getCollectionStats(collection.id));

	async function handleSave() {
		const conn = getConnection();
		if (!conn || !spacetimeState.userProfile) return;

		try {
			await conn.reducers.updateCollection({
				accountId: spacetimeState.userProfile.accountId,
				collectionId: collection.id,
				name: editName.trim(),
				description: editDescription.trim()
			});

			editMode = false;
		} catch (err) {
			spacetimeState.error = `Failed to update collection: ${String(err)}`;
		}
	}

	async function handleUpdateQuantity(card: CollectionCard, delta: number) {
		const conn = getConnection();
		if (!conn || !spacetimeState.userProfile) return;

		const newQty = card.quantity + delta;
		try {
			if (newQty <= 0) {
				await conn.reducers.removeFromCollection({
					accountId: spacetimeState.userProfile.accountId,
					compositeId: card.compositeId
				});
			} else {
				await conn.reducers.updateCollectionCard({
					accountId: spacetimeState.userProfile.accountId,
					compositeId: card.compositeId,
					quantity: newQty,
					notes: card.notes
				});
			}
		} catch (err) {
			spacetimeState.error = `Failed to update card: ${String(err)}`;
		}
	}

	async function handleRemove(card: CollectionCard) {
		const conn = getConnection();
		if (!conn || !spacetimeState.userProfile) return;

		try {
			await conn.reducers.removeFromCollection({
				accountId: spacetimeState.userProfile.accountId,
				compositeId: card.compositeId
			});
		} catch (err) {
			spacetimeState.error = `Failed to remove card: ${String(err)}`;
		}
	}
</script>

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="shrink-0 px-6 pt-6 pb-4">
		{#if editMode}
			<div class="flex flex-col gap-2">
				<input
					type="text"
					bind:value={editName}
					class="w-full max-w-md rounded px-3 py-2 font-display text-lg font-bold text-text-primary focus:outline-none"
					style="background-color: var(--color-crypt); border: 1px solid rgba(196, 146, 42, 0.3);"
					onfocus={(e: FocusEvent) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-gold)'; }}
					onblur={(e: FocusEvent) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(196, 146, 42, 0.3)'; }}
				/>
				<textarea
					bind:value={editDescription}
					rows="2"
					class="w-full max-w-md resize-none rounded px-3 py-2 font-body text-sm text-text-primary focus:outline-none"
					style="background-color: var(--color-crypt); border: 1px solid rgba(196, 146, 42, 0.3);"
					onfocus={(e: FocusEvent) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-gold)'; }}
					onblur={(e: FocusEvent) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(196, 146, 42, 0.3)'; }}
				></textarea>
				<div class="flex gap-2">
					<button
						onclick={handleSave}
						class="cursor-pointer rounded px-4 py-1.5 font-display text-xs font-bold uppercase tracking-wider"
						style="background: linear-gradient(135deg, var(--color-gold-dim), var(--color-gold)); color: var(--color-text-on-gold); border: 1px solid var(--color-gold-bright);"
					>
						Save
					</button>
					<button
						onclick={() => { editMode = false; }}
						class="cursor-pointer rounded border px-4 py-1.5 font-display text-xs uppercase tracking-wider text-text-secondary"
						style="border-color: rgba(196, 146, 42, 0.3); background: transparent;"
					>
						Cancel
					</button>
				</div>
			</div>
		{:else}
			<div class="flex items-start justify-between">
				<div>
					<h1 class="font-display text-2xl font-bold text-gold-bright">
						{collection.name}
					</h1>
					{#if collection.description}
						<p class="mt-1 font-body text-sm text-text-secondary">{collection.description}</p>
					{/if}
				</div>
				<button
					onclick={startEdit}
					class="cursor-pointer rounded border px-3 py-1.5 font-display text-xs uppercase tracking-wider text-gold-bright transition-colors hover:bg-mist"
					style="border-color: rgba(196, 146, 42, 0.5); background: transparent;"
				>
					Edit
				</button>
			</div>
		{/if}

		<CollectionStats total={stats.total} unique={stats.unique} foils={stats.foils} class="mt-3" />
	</div>

	<OrnamentalDivider class="mx-6" />

	<!-- Card grid -->
	<div class="flex-1 overflow-y-auto p-6">
		{#if cards.length === 0}
			<div class="flex items-center justify-center py-20">
				<div class="text-center">
					<p class="font-display text-lg text-text-secondary">No Cards Yet</p>
					<p class="mt-2 font-body text-sm italic text-text-muted">
						Search for cards and add them to this collection.
					</p>
				</div>
			</div>
		{:else}
			<div
				class="grid gap-4"
				style="grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));"
			>
				{#each cards as card (card.compositeId)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="group relative overflow-hidden rounded transition-all duration-200"
						style="
							background-color: var(--color-stone);
							border: 1px solid rgba(196, 146, 42, 0.22);
							border-radius: 4px;
							box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
						"
						onmouseenter={(e) => {
							const el = e.currentTarget as HTMLElement;
							el.style.transform = 'translateY(-4px)';
							el.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 8px 24px rgba(138, 106, 42, 0.25)';
						}}
						onmouseleave={(e) => {
							const el = e.currentTarget as HTMLElement;
							el.style.transform = 'translateY(0)';
							el.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.04)';
						}}
					>
						<!-- Card image -->
						<div class="relative overflow-hidden" style="aspect-ratio: 5 / 7; border-radius: 8px 8px 0 0;">
							<img
								src={card.imageUri}
								alt={card.name}
								loading="lazy"
								class="block h-full w-full object-cover"
							/>

							<!-- Foil shimmer -->
							{#if card.isFoil}
								<div
									class="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
									style="
										background: linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%);
										background-size: 200% 200%;
										animation: foil-shimmer 1.5s ease-in-out infinite;
									"
								></div>
							{/if}

							<!-- Quantity badge -->
							{#if card.quantity > 1}
								<span
									class="absolute right-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full px-1 font-mono text-[11px] font-medium"
									style="background-color: rgba(13, 11, 15, 0.8); color: var(--color-gold-bright); border: 1px solid rgba(196, 146, 42, 0.4);"
								>
									x{card.quantity}
								</span>
							{/if}

							<!-- Hover controls overlay -->
							<div
								class="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-void/80 py-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
							>
								<button
									onclick={() => handleUpdateQuantity(card, -1)}
									class="flex h-7 w-7 cursor-pointer items-center justify-center rounded bg-crypt font-mono text-sm text-text-primary transition-colors hover:bg-mist"
									style="border: 1px solid rgba(196, 146, 42, 0.3);"
									aria-label="Decrease quantity"
								>
									-
								</button>
								<span class="font-mono text-sm text-text-primary">{card.quantity}</span>
								<button
									onclick={() => handleUpdateQuantity(card, 1)}
									class="flex h-7 w-7 cursor-pointer items-center justify-center rounded bg-crypt font-mono text-sm text-text-primary transition-colors hover:bg-mist"
									style="border: 1px solid rgba(196, 146, 42, 0.3);"
									aria-label="Increase quantity"
								>
									+
								</button>
								<button
									onclick={() => handleRemove(card)}
									class="flex h-7 w-7 cursor-pointer items-center justify-center rounded font-mono text-sm text-error transition-colors hover:bg-error/10"
									style="border: 1px solid rgba(138, 32, 32, 0.4); background: var(--color-crypt);"
									aria-label="Remove card"
								>
									&#10005;
								</button>
							</div>
						</div>

						<!-- Card info -->
						<div class="px-2 py-1.5">
							<p
								class="truncate font-display text-xs leading-tight text-text-primary"
								title={card.name}
							>
								{card.name}
							</p>
							<div class="mt-0.5 flex items-center gap-1.5">
								<span class="font-mono text-[10px] uppercase text-text-secondary">
									{card.setCode}
								</span>
								{#if card.isFoil}
									<span class="font-body text-[10px] italic text-gold-dim">Foil</span>
								{/if}
								{#if card.condition !== 'NM'}
									<span class="font-mono text-[10px] text-text-muted">{card.condition}</span>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
