<script lang="ts">
	import OrnamentalDivider from '$lib/components/layout/OrnamentalDivider.svelte';
	import { getSetCatalogSize } from '$lib/search/meilisearch';
	import { activeGameState } from '$lib/state/activeGame.svelte';
	import type { InventoryCard } from '$lib/server/data/types';

	type InventorySort = 'name' | 'set' | 'recent';

	interface SetProgress {
		setCode: string;
		owned: number;
		total: number;
		percent: number;
		completed: boolean;
	}

	let { data } = $props();
	let sortBy: InventorySort = $state('name');
	let query = $state('');
	let setTotals: Record<string, number> = $state({});
	let setProgressLoading = $state(false);

	let inventoryCards = $derived(data.cards as InventoryCard[]);
	let inventoryStats = $derived(data.stats);

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
				return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
			}
			return a.name.localeCompare(b.name);
		});

		return next;
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
			setCodes.map(
				async (setCode) =>
					[setCode, await getSetCatalogSize(setCode, activeGameState.current)] as const
			)
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
	function nextQuantity(card: InventoryCard, delta: number): number {
		return card.quantity + delta;
	}
</script>

<svelte:head>
	<title>Inventory | Spellbook</title>
</svelte:head>

<div class="flex flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6">
	<section class="surface-card p-6 sm:p-7">
		<div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
			<div class="max-w-2xl">
				<p class="font-mono text-[11px] uppercase tracking-[0.3em] text-text-secondary">
					{activeGameState.current.toUpperCase()} Inventory
				</p>
				<h1 class="mt-3 font-display text-3xl font-bold text-gold-bright sm:text-4xl">
					Your owned card ledger.
				</h1>
				<p class="mt-3 font-body leading-7 text-text-secondary">
					Track what you own and inspect set completion progress.
				</p>
			</div>

			<div class="grid gap-3 sm:grid-cols-4">
				<div class="rounded px-4 py-3 bg-stone/62 border border-gold/12">
					<p class="font-mono text-xl text-gold-bright">{inventoryStats.total}</p>
					<p class="font-body text-[11px] uppercase tracking-[0.2em] text-text-secondary">Cards</p>
				</div>
				<div class="rounded px-4 py-3 bg-stone/62 border border-gold/12">
					<p class="font-mono text-xl text-gold-bright">{inventoryStats.unique}</p>
					<p class="font-body text-[11px] uppercase tracking-[0.2em] text-text-secondary">Unique</p>
				</div>
				<div class="rounded px-4 py-3 bg-stone/62 border border-gold/12">
					<p class="font-mono text-xl text-gold-bright">{inventoryStats.sets}</p>
					<p class="font-body text-[11px] uppercase tracking-[0.2em] text-text-secondary">Sets</p>
				</div>
				<div class="rounded px-4 py-3 bg-stone/62 border border-gold/12">
					<p class="font-mono text-xl text-gold-bright">{completedSetCount}</p>
					<p class="font-body text-[11px] uppercase tracking-[0.2em] text-text-secondary">
						Completed
					</p>
				</div>
			</div>
		</div>
	</section>

	<section class="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
		<div class="rounded-lg p-5 bg-crypt/92 border border-gold/14">
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
						<div class="rounded px-4 py-3 bg-stone/60 border border-gold/10">
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
									class="rounded px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] border {progress.completed
										? 'bg-success/18 border-success/35 text-success'
										: 'bg-stone/90 border-gold/14 text-gold-bright'}"
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

		<div class="rounded-lg p-5 bg-crypt/92 border border-gold/14">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<input
					type="search"
					bind:value={query}
					placeholder="Search inventory..."
					class="min-w-[220px] rounded px-4 py-2 font-body text-sm text-text-primary placeholder:text-text-muted focus:outline-none bg-crypt border border-gold/20"
				/>
				<select
					bind:value={sortBy}
					class="rounded px-4 py-2 font-body text-sm text-text-primary focus:outline-none bg-crypt border border-gold/20"
				>
					<option value="name">Sort by Name</option>
					<option value="set">Sort by Set</option>
					<option value="recent">Sort by Recent</option>
				</select>
			</div>

			<OrnamentalDivider class="my-5" />

			{#if inventoryCards.length === 0}
				<div class="flex min-h-[280px] items-center justify-center text-center">
					<div>
						<p class="font-display text-2xl text-text-primary">Your MTG inventory is empty.</p>
						<p class="mt-3 font-body text-sm leading-7 text-text-secondary">
							Start in catalog search, add owned printings, then come back here to review set
							progress.
						</p>
						<a
							href="/search"
							class="mt-6 inline-flex rounded-lg px-5 py-3 font-display text-xs uppercase tracking-[0.24em] text-text-on-gold no-underline bg-linear-to-br from-gold-dim to-gold border border-gold-bright"
						>
							Go to Search
						</a>
					</div>
				</div>
			{:else}
				<div class="flex flex-col gap-3">
					{#each listCards as card (card.id)}
						<div
							class="grid gap-4 rounded px-4 py-4 sm:grid-cols-[72px_1fr_auto] bg-stone/58 border border-gold/10"
						>
							<img
								src={card.imageUri}
								alt={card.name}
								class="h-[100px] w-[72px] rounded object-cover"
							/>
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<p class="font-display text-xl text-text-primary">{card.name}</p>
									<span
										class="rounded px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] bg-void/80 text-gold-bright"
									>
										{card.setCode}
									</span>
									<span
										class="rounded px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] bg-void/80 text-text-secondary"
									>
										{card.finish}
									</span>
									<span
										class="rounded px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] bg-void/80 text-text-secondary"
									>
										{card.condition}
									</span>
								</div>
							</div>
							<div class="flex items-center gap-2 sm:justify-end">
								<form method="POST" action="?/updateQuantity">
									<input type="hidden" name="entryId" value={card.id} />
									<input type="hidden" name="quantity" value={nextQuantity(card, -1)} />
									<input type="hidden" name="notes" value={card.notes} />
									<button
										type="submit"
										class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full font-mono text-sm text-text-primary bg-crypt border border-gold/18"
									>
										-
									</button>
								</form>
								<span class="w-8 text-center font-mono text-sm text-text-primary"
									>{card.quantity}</span
								>
								<form method="POST" action="?/updateQuantity">
									<input type="hidden" name="entryId" value={card.id} />
									<input type="hidden" name="quantity" value={nextQuantity(card, 1)} />
									<input type="hidden" name="notes" value={card.notes} />
									<button
										type="submit"
										class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full font-mono text-sm text-text-primary bg-crypt border border-gold/18"
									>
										+
									</button>
								</form>
								<form method="POST" action="?/remove">
									<input type="hidden" name="entryId" value={card.id} />
									<button
										type="submit"
										class="rounded px-3 py-2 font-display text-[10px] uppercase tracking-[0.22em] text-error bg-error/10 border border-error/22"
									>
										Remove
									</button>
								</form>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</section>
</div>
