<script lang="ts">
	import OrnamentalDivider from '$lib/components/layout/OrnamentalDivider.svelte';
	import { spacetimeState } from '$lib/spacetimedb/state.svelte';
	import { getConnection } from '$lib/spacetimedb/client';
	import { getSetCatalogSize } from '$lib/search/meilisearch';
	import type { InventoryCard } from '$bindings/types';

	type InventoryMode = 'list' | 'spellbook';
	type InventorySort = 'name' | 'set' | 'recent';

	interface SetProgress {
		setCode: string;
		owned: number;
		total: number;
		percent: number;
		completed: boolean;
	}

	const SPELLBOOK_PAGE_SIZE = 9;

	let mode: InventoryMode = $state('list');
	let sortBy: InventorySort = $state('name');
	let query = $state('');
	let setTotals: Record<string, number> = $state({});
	let setProgressLoading = $state(false);
	let draggedEntryId: string | null = $state(null);

	let inventoryCards = $derived(spacetimeState.getInventoryCards('mtg'));
	let inventoryStats = $derived(spacetimeState.getInventoryStats('mtg'));

	let listCards = $derived.by(() => {
		const normalizedQuery = query.trim().toLowerCase();
		let next = [...inventoryCards];

		if (normalizedQuery) {
			next = next.filter(
				(card) =>
					card.name.toLowerCase().includes(normalizedQuery) ||
					card.setCode.toLowerCase().includes(normalizedQuery) ||
					card.condition.toLowerCase().includes(normalizedQuery)
			);
		}

		next.sort((a, b) => {
			if (sortBy === 'set') {
				return a.setCode.localeCompare(b.setCode) || a.name.localeCompare(b.name);
			}
			if (sortBy === 'recent') {
				return Number(b.updatedAt) - Number(a.updatedAt);
			}
			return a.name.localeCompare(b.name);
		});

		return next;
	});

	let spellbookCards = $derived(
		[...inventoryCards].sort((a, b) => a.spellbookPosition - b.spellbookPosition)
	);

	let spellbookPages = $derived.by(() => {
		const pages: Array<Array<InventoryCard | null>> = [];
		for (
			let index = 0;
			index < Math.max(spellbookCards.length, SPELLBOOK_PAGE_SIZE);
			index += SPELLBOOK_PAGE_SIZE
		) {
			const pageCards = spellbookCards.slice(index, index + SPELLBOOK_PAGE_SIZE);
			const page = Array.from(
				{ length: SPELLBOOK_PAGE_SIZE },
				(_, slotIndex) => pageCards[slotIndex] ?? null
			);
			pages.push(page);
		}
		return pages;
	});

	let setProgress = $derived.by(() => {
		const ownedBySet = new Map<string, Set<string>>();
		for (const card of inventoryCards) {
			if (!ownedBySet.has(card.setCode)) {
				ownedBySet.set(card.setCode, new Set());
			}
			ownedBySet.get(card.setCode)?.add(card.canonicalCardId);
		}

		return Object.entries(setTotals)
			.map(([setCode, total]) => {
				const owned = ownedBySet.get(setCode)?.size ?? 0;
				const percent = total > 0 ? Math.round((owned / total) * 100) : 0;
				return {
					setCode,
					owned,
					total,
					percent,
					completed: total > 0 && owned >= total
				} satisfies SetProgress;
			})
			.sort((a, b) => b.percent - a.percent || a.setCode.localeCompare(b.setCode));
	});

	let completedSetCount = $derived(setProgress.filter((entry) => entry.completed).length);

	$effect(() => {
		const setCodes = [
			...new Set(inventoryCards.map((card) => card.setCode).filter(Boolean))
		].sort();
		if (setCodes.length === 0) {
			setTotals = {};
			return;
		}

		let cancelled = false;
		setProgressLoading = true;

		Promise.all(
			setCodes.map(async (setCode) => [setCode, await getSetCatalogSize(setCode, 'mtg')] as const)
		)
			.then((entries) => {
				if (!cancelled) {
					setTotals = Object.fromEntries(entries);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setTotals = {};
				}
			})
			.finally(() => {
				if (!cancelled) {
					setProgressLoading = false;
				}
			});

		return () => {
			cancelled = true;
		};
	});

	async function handleUpdateQuantity(card: InventoryCard, delta: number) {
		const conn = getConnection();
		if (!conn || !spacetimeState.userProfile) return;

		const nextQuantity = card.quantity + delta;
		try {
			if (nextQuantity <= 0) {
				await conn.reducers.removeFromInventory({
					accountId: spacetimeState.userProfile.accountId,
					entryId: card.entryId
				});
			} else {
				await conn.reducers.updateInventoryCard({
					accountId: spacetimeState.userProfile.accountId,
					entryId: card.entryId,
					quantity: nextQuantity,
					notes: card.notes
				});
			}
		} catch (err) {
			spacetimeState.error = `Failed to update inventory card: ${String(err)}`;
		}
	}

	async function handleRemove(card: InventoryCard) {
		const conn = getConnection();
		if (!conn || !spacetimeState.userProfile) return;

		try {
			await conn.reducers.removeFromInventory({
				accountId: spacetimeState.userProfile.accountId,
				entryId: card.entryId
			});
		} catch (err) {
			spacetimeState.error = `Failed to remove inventory card: ${String(err)}`;
		}
	}

	async function handleDrop(targetPosition: number) {
		if (!draggedEntryId || !spacetimeState.userProfile) return;

		const conn = getConnection();
		if (!conn) return;

		try {
			await conn.reducers.reorderInventoryCard({
				accountId: spacetimeState.userProfile.accountId,
				entryId: draggedEntryId,
				targetPosition
			});
		} catch (err) {
			spacetimeState.error = `Failed to reorder spellbook: ${String(err)}`;
		} finally {
			draggedEntryId = null;
		}
	}
</script>

<svelte:head>
	<title>MTG Inventory | Spellbook</title>
</svelte:head>

<div class="flex flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6">
	<section
		class="rounded-[1.75rem] p-6 sm:p-7"
		style="
			background:
				linear-gradient(150deg, rgba(24, 20, 28, 0.96), rgba(12, 10, 14, 0.96)),
				radial-gradient(circle at 80% 20%, rgba(196, 146, 42, 0.22), transparent 28%);
			border: 1px solid rgba(196, 146, 42, 0.18);
			box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
		"
	>
		<div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
			<div class="max-w-2xl">
				<p class="font-mono text-[11px] uppercase tracking-[0.3em] text-gold-dim">MTG Inventory</p>
				<h1 class="mt-3 font-display text-3xl font-bold text-gold-bright sm:text-4xl">
					One owned ledger, two ways to inhabit it.
				</h1>
				<p class="mt-3 font-body leading-7 text-text-secondary">
					List mode is for speed. Spellbook mode is for arranging the cards like a living binder.
				</p>
			</div>

			<div class="grid gap-3 sm:grid-cols-4">
				<div
					class="rounded-2xl px-4 py-3"
					style="background-color: rgba(28, 23, 32, 0.62); border: 1px solid rgba(196, 146, 42, 0.12);"
				>
					<p class="font-mono text-xl text-gold-bright">{inventoryStats.total}</p>
					<p class="font-body text-[11px] uppercase tracking-[0.2em] text-text-secondary">Cards</p>
				</div>
				<div
					class="rounded-2xl px-4 py-3"
					style="background-color: rgba(28, 23, 32, 0.62); border: 1px solid rgba(196, 146, 42, 0.12);"
				>
					<p class="font-mono text-xl text-gold-bright">{inventoryStats.unique}</p>
					<p class="font-body text-[11px] uppercase tracking-[0.2em] text-text-secondary">Unique</p>
				</div>
				<div
					class="rounded-2xl px-4 py-3"
					style="background-color: rgba(28, 23, 32, 0.62); border: 1px solid rgba(196, 146, 42, 0.12);"
				>
					<p class="font-mono text-xl text-gold-bright">{inventoryStats.sets}</p>
					<p class="font-body text-[11px] uppercase tracking-[0.2em] text-text-secondary">Sets</p>
				</div>
				<div
					class="rounded-2xl px-4 py-3"
					style="background-color: rgba(28, 23, 32, 0.62); border: 1px solid rgba(196, 146, 42, 0.12);"
				>
					<p class="font-mono text-xl text-gold-bright">{completedSetCount}</p>
					<p class="font-body text-[11px] uppercase tracking-[0.2em] text-text-secondary">
						Completed
					</p>
				</div>
			</div>
		</div>
	</section>

	{#if spacetimeState.error}
		<p
			class="rounded px-3 py-2 font-body text-sm text-error"
			style="background-color: rgba(138, 32, 32, 0.1); border: 1px solid rgba(138, 32, 32, 0.3);"
		>
			{spacetimeState.error}
			<button
				onclick={() => (spacetimeState.error = null)}
				class="ml-2 cursor-pointer border-none bg-transparent text-text-muted hover:text-text-primary"
				>&#10005;</button
			>
		</p>
	{/if}

	<section class="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
		<div
			class="rounded-[1.5rem] p-5"
			style="background-color: rgba(20, 16, 24, 0.92); border: 1px solid rgba(196, 146, 42, 0.14);"
		>
			<div class="flex items-center justify-between gap-3">
				<div>
					<p class="font-display text-lg font-bold text-text-primary">Set Progress</p>
					<p class="font-body text-sm text-text-secondary">
						Completion is based on owning one of each card name in a set.
					</p>
				</div>
				{#if setProgressLoading}
					<span class="font-mono text-xs uppercase tracking-[0.2em] text-text-muted">Syncing</span>
				{/if}
			</div>

			<div class="mt-5 flex flex-col gap-3">
				{#if setProgress.length > 0}
					{#each setProgress.slice(0, 10) as progress}
						<div
							class="rounded-2xl px-4 py-3"
							style="background-color: rgba(28, 23, 32, 0.6); border: 1px solid rgba(196, 146, 42, 0.1);"
						>
							<div class="flex items-center justify-between gap-3">
								<div>
									<p class="font-display text-base text-text-primary">
										{progress.setCode.toUpperCase()}
									</p>
									<p class="font-body text-xs text-text-secondary">
										{progress.owned} / {progress.total} card names
									</p>
								</div>
								<span
									class="rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em]"
									style="
										background-color: {progress.completed ? 'rgba(58, 138, 74, 0.18)' : 'rgba(28, 23, 32, 0.9)'};
										border: 1px solid {progress.completed ? 'rgba(58, 138, 74, 0.35)' : 'rgba(196, 146, 42, 0.14)'};
										color: {progress.completed ? 'var(--color-success)' : 'var(--color-gold-bright)'};
									"
								>
									{progress.percent}%
								</span>
							</div>
							<div class="mt-3 h-2 overflow-hidden rounded-full bg-void/60">
								<div
									class="h-full rounded-full"
									style="width: {progress.percent}%; background: linear-gradient(90deg, var(--color-gold-dim), var(--color-gold-bright));"
								></div>
							</div>
						</div>
					{/each}
				{:else}
					<p class="font-body text-sm leading-7 text-text-secondary">
						Add cards from the MTG search to start tracking inventory and set completion.
					</p>
				{/if}
			</div>
		</div>

		<div
			class="rounded-[1.5rem] p-5"
			style="background-color: rgba(20, 16, 24, 0.92); border: 1px solid rgba(196, 146, 42, 0.14);"
		>
			<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div class="flex items-center gap-2">
					<button
						onclick={() => (mode = 'list')}
						class="rounded-full px-4 py-2 font-display text-xs uppercase tracking-[0.24em]"
						style="
							background-color: {mode === 'list' ? 'var(--color-mist)' : 'transparent'};
							border: 1px solid {mode === 'list' ? 'var(--color-gold)' : 'rgba(196, 146, 42, 0.18)'};
							color: {mode === 'list' ? 'var(--color-gold-bright)' : 'var(--color-text-secondary)'};
						"
					>
						List
					</button>
					<button
						onclick={() => (mode = 'spellbook')}
						class="rounded-full px-4 py-2 font-display text-xs uppercase tracking-[0.24em]"
						style="
							background-color: {mode === 'spellbook' ? 'var(--color-mist)' : 'transparent'};
							border: 1px solid {mode === 'spellbook' ? 'var(--color-gold)' : 'rgba(196, 146, 42, 0.18)'};
							color: {mode === 'spellbook' ? 'var(--color-gold-bright)' : 'var(--color-text-secondary)'};
						"
					>
						Spellbook
					</button>
				</div>

				<div class="flex flex-col gap-3 sm:flex-row">
					<input
						type="search"
						bind:value={query}
						placeholder={mode === 'list' ? 'Search inventory...' : 'Search affects list mode only'}
						class="min-w-[220px] rounded-full px-4 py-2 font-body text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
						style="background-color: var(--color-crypt); border: 1px solid rgba(196, 146, 42, 0.2);"
					/>
					<select
						bind:value={sortBy}
						class="rounded-full px-4 py-2 font-body text-sm text-text-primary focus:outline-none"
						style="background-color: var(--color-crypt); border: 1px solid rgba(196, 146, 42, 0.2);"
					>
						<option value="name">Sort by Name</option>
						<option value="set">Sort by Set</option>
						<option value="recent">Sort by Recent</option>
					</select>
				</div>
			</div>

			<OrnamentalDivider class="my-5" />

			{#if inventoryCards.length === 0}
				<div class="flex min-h-[280px] items-center justify-center text-center">
					<div>
						<p class="font-display text-2xl text-text-primary">Your MTG inventory is empty.</p>
						<p class="mt-3 font-body text-sm leading-7 text-text-secondary">
							Start in catalog search, add owned printings, then come back here to review set
							progress or arrange the spellbook binder.
						</p>
						<a
							href="/mtg/search"
							class="mt-6 inline-flex rounded-full px-5 py-3 font-display text-xs uppercase tracking-[0.24em] text-text-on-gold no-underline"
							style="background: linear-gradient(135deg, var(--color-gold-dim), var(--color-gold)); border: 1px solid var(--color-gold-bright);"
						>
							Go to Search
						</a>
					</div>
				</div>
			{:else if mode === 'list'}
				<div class="flex flex-col gap-3">
					{#each listCards as card (card.entryId)}
						<div
							class="grid gap-4 rounded-[1.25rem] px-4 py-4 sm:grid-cols-[72px_1fr_auto]"
							style="background-color: rgba(28, 23, 32, 0.58); border: 1px solid rgba(196, 146, 42, 0.1);"
						>
							<img
								src={card.imageUri}
								alt={card.name}
								class="h-[100px] w-[72px] rounded-xl object-cover"
							/>
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<p class="font-display text-xl text-text-primary">{card.name}</p>
									<span
										class="rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em]"
										style="background-color: rgba(13, 11, 15, 0.8); color: var(--color-gold-bright);"
									>
										{card.setCode}
									</span>
									<span
										class="rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em]"
										style="background-color: rgba(13, 11, 15, 0.8); color: var(--color-text-secondary);"
									>
										{card.finish}
									</span>
									<span
										class="rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em]"
										style="background-color: rgba(13, 11, 15, 0.8); color: var(--color-text-secondary);"
									>
										{card.condition}
									</span>
								</div>
								<p class="mt-2 font-body text-sm text-text-secondary">
									Spellbook slot {card.spellbookPosition + 1}
								</p>
							</div>
							<div class="flex items-center gap-2 sm:justify-end">
								<button
									onclick={() => handleUpdateQuantity(card, -1)}
									class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full font-mono text-sm text-text-primary"
									style="background-color: var(--color-crypt); border: 1px solid rgba(196, 146, 42, 0.18);"
								>
									-
								</button>
								<span class="w-8 text-center font-mono text-sm text-text-primary"
									>{card.quantity}</span
								>
								<button
									onclick={() => handleUpdateQuantity(card, 1)}
									class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full font-mono text-sm text-text-primary"
									style="background-color: var(--color-crypt); border: 1px solid rgba(196, 146, 42, 0.18);"
								>
									+
								</button>
								<button
									onclick={() => handleRemove(card)}
									class="rounded-full px-3 py-2 font-display text-[10px] uppercase tracking-[0.22em] text-error"
									style="background-color: rgba(138, 32, 32, 0.1); border: 1px solid rgba(138, 32, 32, 0.22);"
								>
									Remove
								</button>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="flex flex-col gap-6">
					<p class="font-body text-sm leading-7 text-text-secondary">
						Drag cards between slots to rearrange the spellbook. This view always uses the full
						binder order so positions stay stable.
					</p>
					{#each spellbookPages as pageCards, pageIndex}
						<div
							class="rounded-[1.5rem] p-4"
							style="background-color: rgba(28, 23, 32, 0.55); border: 1px solid rgba(196, 146, 42, 0.1);"
						>
							<div class="mb-4 flex items-center justify-between">
								<p class="font-display text-lg text-text-primary">Page {pageIndex + 1}</p>
								<p class="font-mono text-[11px] uppercase tracking-[0.22em] text-text-muted">
									9-pocket layout
								</p>
							</div>
							<div class="grid gap-3 sm:grid-cols-3">
								{#each pageCards as card, slotIndex}
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										class="relative aspect-[5/7] overflow-hidden rounded-[1.25rem]"
										style="
											background:
												linear-gradient(180deg, rgba(16, 13, 18, 0.96), rgba(9, 8, 11, 0.96));
											border: 1px solid rgba(196, 146, 42, 0.14);
										"
										ondragover={(event: DragEvent) => event.preventDefault()}
										ondrop={() => handleDrop(pageIndex * SPELLBOOK_PAGE_SIZE + slotIndex)}
									>
										{#if card}
											<img
												src={card.imageUri}
												alt={card.name}
												class="h-full w-full object-cover"
												draggable="true"
												ondragstart={() => {
													draggedEntryId = card.entryId;
												}}
												ondragend={() => {
													draggedEntryId = null;
												}}
											/>
											<div
												class="absolute inset-x-0 bottom-0 flex items-center justify-between bg-void/80 px-3 py-2"
											>
												<div class="min-w-0">
													<p class="truncate font-display text-xs text-text-primary">{card.name}</p>
													<p
														class="font-mono text-[10px] uppercase tracking-[0.18em] text-text-secondary"
													>
														{card.quantity} owned
													</p>
												</div>
												<span
													class="rounded-full px-2 py-1 font-mono text-[10px] text-gold-bright"
													style="background-color: rgba(13, 11, 15, 0.8);"
												>
													#{card.spellbookPosition + 1}
												</span>
											</div>
										{:else}
											<div class="flex h-full items-center justify-center">
												<div class="text-center">
													<p
														class="font-display text-sm uppercase tracking-[0.2em] text-text-muted"
													>
														Empty Slot
													</p>
													<p
														class="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted"
													>
														Drop here
													</p>
												</div>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</section>
</div>
