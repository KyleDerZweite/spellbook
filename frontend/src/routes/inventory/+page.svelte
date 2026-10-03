<script lang="ts">
	import { getSetCatalogSize } from '#lib/search/catalog.ts';
	import { activeGameState } from '#lib/state/activeGame.svelte.ts';
	import type { InventoryCard } from '#lib/server/data/types.ts';

	type InventorySort = 'name' | 'set' | 'recent';

	interface SetProgress {
		setCode: string;
		owned: number;
		total: number;
		percent: number;
		completed: boolean;
	}

	let { data, form } = $props();
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

<div class="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-6">
	{#if form?.message}<p
			role="alert"
			class="rounded border border-error/30 bg-error/10 p-3 text-sm text-error"
		>
			{form.message}
		</p>{/if}
	<section class="py-1">
		<div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
			<div><h1 class="font-display text-xl font-semibold text-text-primary">Inventory</h1></div>

			<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<div class="panel px-4 py-3">
					<p class="text-lg font-semibold tabular-nums text-text-primary">{inventoryStats.total}</p>
					<p class="text-xs text-text-secondary">Cards</p>
				</div>
				<div class="panel px-4 py-3">
					<p class="text-lg font-semibold tabular-nums text-text-primary">
						{inventoryStats.unique}
					</p>
					<p class="text-xs text-text-secondary">Unique</p>
				</div>
				<div class="panel px-4 py-3">
					<p class="text-lg font-semibold tabular-nums text-text-primary">{inventoryStats.sets}</p>
					<p class="text-xs text-text-secondary">Sets</p>
				</div>
				<div class="panel px-4 py-3">
					<p class="text-lg font-semibold tabular-nums text-text-primary">{completedSetCount}</p>
					<p class="text-xs text-text-secondary">Completed</p>
				</div>
			</div>
		</div>
	</section>

	<section class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
		<div class="panel order-2 p-5">
			<div class="flex items-center justify-between gap-3">
				<div>
					<span class="sr-only">Set progress</span>
				</div>
				{#if setProgressLoading}
					<span class="text-xs text-text-muted">Syncing</span>
				{/if}
			</div>

			<div class="flex flex-col gap-3">
				{#if setProgress.length > 0}
					{#each setProgress.slice(0, 10) as progress}
						<div class="rounded-lg border border-border bg-crypt/40 px-3 py-3">
							<div class="flex items-center justify-between gap-3">
								<div>
									<p class="text-sm font-medium text-text-primary">
										{progress.setCode.toUpperCase()}
									</p>
									<p class="font-body text-xs text-text-secondary">
										{progress.owned} / {progress.total} card names
									</p>
								</div>
								<span
									class="rounded px-2.5 py-1 text-xs tabular-nums border {progress.completed
										? 'bg-success/18 border-success/35 text-success'
										: 'bg-stone/90 border-gold/14 text-gold-bright'}"
								>
									{progress.percent}%
								</span>
							</div>
							<div class="mt-3 h-2 overflow-hidden rounded-full bg-void/60">
								<div
									class="h-full rounded-full"
									style="width: {Math.min(progress.percent, 100)}%; background: var(--color-gold);"
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

		<div class="panel order-1 min-w-0 p-4 sm:p-5">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<input
					type="search"
					aria-label="Search inventory"
					bind:value={query}
					placeholder="Search inventory..."
					class="input min-w-0 flex-1"
				/>
				<select
					aria-label="Sort inventory"
					bind:value={sortBy}
					class="input w-full sm:w-auto sm:min-w-44"
				>
					<option value="name">Sort by name</option>
					<option value="set">Sort by set</option>
					<option value="recent">Recently updated</option>
				</select>
			</div>

			<div class="border-t border-border my-5" aria-hidden="true"></div>

			{#if inventoryCards.length === 0}
				<div class="flex min-h-[280px] items-center justify-center text-center">
					<div>
						<p class="font-body text-sm text-text-primary">Your MTG inventory is empty.</p>
						<p class="mt-3 font-body text-sm leading-7 text-text-secondary">
							Add owned printings from card search.
						</p>
						<a href="/search" class="btn btn-primary mt-4"> Find cards </a>
					</div>
				</div>
			{:else if listCards.length === 0}
				<p class="py-12 text-center text-sm text-text-secondary">
					No inventory cards match "{query}".
				</p>
			{:else}
				<div class="flex flex-col gap-2">
					{#each listCards as card (card.id)}
						<div
							class="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-3 rounded-lg border border-border bg-crypt/30 px-3 py-3 sm:grid-cols-[48px_minmax(0,1fr)_auto]"
						>
							<img src={card.imageUri} alt={card.name} class="h-[67px] w-12 rounded object-cover" />
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<p class="font-display text-sm font-semibold text-text-primary">{card.name}</p>
									<span
										class="rounded border border-border px-1.5 py-0.5 text-[10px] bg-void/40 text-gold-bright"
									>
										{card.setCode}
									</span>
									<span
										class="rounded border border-border px-1.5 py-0.5 text-[10px] bg-void/40 text-text-secondary"
									>
										{card.finish}
									</span>
									<span
										class="rounded border border-border px-1.5 py-0.5 text-[10px] bg-void/40 text-text-secondary"
									>
										{card.condition}
									</span>
								</div>
							</div>
							<div
								class="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-auto sm:justify-end"
							>
								<form method="POST" action="?/updateQuantity">
									<input type="hidden" name="entryId" value={card.id} />
									<input type="hidden" name="quantity" value={nextQuantity(card, -1)} />
									<input type="hidden" name="notes" value={card.notes} />
									<button
										type="submit"
										aria-label={`Decrease ${card.name} quantity`}
										class="btn btn-secondary h-8 w-8 p-0"
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
										aria-label={`Increase ${card.name} quantity`}
										class="btn btn-secondary h-8 w-8 p-0"
									>
										+
									</button>
								</form>
								<form method="POST" action="?/remove">
									<input type="hidden" name="entryId" value={card.id} />
									<button type="submit" class="btn btn-ghost text-xs text-error"> Remove </button>
								</form>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</section>
</div>
