<script lang="ts">
	import OrnamentalDivider from '$lib/components/layout/OrnamentalDivider.svelte';
	import { activeGameState } from '$lib/state/activeGame.svelte';
	import type { DeckCard, Deck, InventoryCard } from '$lib/server/data/types';

	interface OwnedCandidate {
		canonicalCardId: string;
		catalogCardId: string;
		name: string;
		setCode: string;
		imageUri: string;
		owned: number;
	}

	const DECK_FORMATS = ['Commander', 'Standard', 'Modern', 'Pioneer', 'Casual'] as const;
	const CANDIDATE_LIMIT = 12;

	let { data } = $props();
	let selectedDeckId: string | null = $state(null);
	let addQuery = $state('');

	let decks = $derived(data.decks as Deck[]);
	let allDeckCards = $derived(data.deckCards as DeckCard[]);
	let inventoryCards = $derived(data.inventoryCards as InventoryCard[]);

	$effect(() => {
		if (selectedDeckId && decks.some((deck) => deck.id === selectedDeckId)) {
			return;
		}

		selectedDeckId = decks[0]?.id ?? null;
	});

	let selectedDeck = $derived(
		selectedDeckId ? decks.find((deck) => deck.id === selectedDeckId) : undefined
	);
	let deckCards = $derived(
		selectedDeckId ? allDeckCards.filter((card) => card.deckId === selectedDeckId) : []
	);

	let ownedByCanonical = $derived.by(() => {
		const map = new Map<string, OwnedCandidate>();
		for (const card of inventoryCards) {
			const existing = map.get(card.canonicalCardId);
			if (existing) {
				existing.owned += card.quantity;
				continue;
			}
			map.set(card.canonicalCardId, {
				canonicalCardId: card.canonicalCardId,
				catalogCardId: card.catalogCardId,
				name: card.name,
				setCode: card.setCode,
				imageUri: card.imageUri,
				owned: card.quantity
			});
		}
		return map;
	});

	let ownedCandidates = $derived.by(() => {
		const normalizedQuery = addQuery.trim().toLowerCase();
		return [...ownedByCanonical.values()]
			.filter((c) => !normalizedQuery || c.name.toLowerCase().includes(normalizedQuery))
			.sort((a, b) => a.name.localeCompare(b.name))
			.slice(0, CANDIDATE_LIMIT);
	});

	function getOwnedStatus(card: DeckCard): { owned: number; missing: number } {
		const owned = ownedByCanonical.get(card.canonicalCardId)?.owned ?? 0;
		return {
			owned,
			missing: Math.max(card.quantity - owned, 0)
		};
	}

	function nextQuantity(card: DeckCard, delta: number): number {
		return card.quantity + delta;
	}
</script>

<svelte:head>
	<title>Decks | Spellbook</title>
</svelte:head>

<div class="grid gap-6 px-4 py-4 sm:px-6 sm:py-6 xl:grid-cols-[0.72fr_1.28fr]">
	<section class="rounded-lg p-5 bg-crypt/92 border border-gold/14">
		<p class="font-mono text-[11px] uppercase tracking-[0.3em] text-text-secondary">
			{activeGameState.current.toUpperCase()} Deck Studio
		</p>
		<h1 class="mt-3 font-display text-3xl font-bold text-gold-bright">Decks</h1>
		<p class="mt-3 font-body leading-7 text-text-secondary">
			Decks are separate from inventory, but every list compares itself against what you already
			own.
		</p>

		<form method="POST" action="?/createDeck" class="mt-6 flex flex-col gap-3">
			<input type="hidden" name="game" value={activeGameState.current} />
			<input
				type="text"
				name="name"
				placeholder="Deck name"
				class="rounded px-4 py-3 font-body text-sm text-text-primary placeholder:text-text-muted focus:outline-none bg-crypt border border-gold/16"
			/>
			<textarea
				name="description"
				rows="3"
				placeholder="Description"
				class="rounded px-4 py-3 font-body text-sm text-text-primary placeholder:text-text-muted focus:outline-none bg-crypt border border-gold/16"
			></textarea>
			<select
				name="format"
				class="rounded px-4 py-3 font-body text-sm text-text-primary focus:outline-none bg-crypt border border-gold/16"
			>
				{#each DECK_FORMATS as format}<option>{format}</option>{/each}
			</select>
			<button
				type="submit"
				class="rounded-lg px-5 py-3 font-display text-xs uppercase tracking-[0.24em] text-text-on-gold disabled:cursor-not-allowed disabled:opacity-50 bg-linear-to-br from-gold-dim to-gold border border-gold-bright"
			>
				Create Deck
			</button>
		</form>

		<OrnamentalDivider class="my-5" />

		<div class="flex flex-col gap-3">
			{#if decks.length > 0}
				{#each decks as deck}
					<div
						onclick={() => (selectedDeckId = deck.id)}
						onkeydown={(event) => {
							if (event.key === 'Enter' || event.key === ' ') {
								event.preventDefault();
								selectedDeckId = deck.id;
							}
						}}
						role="button"
						tabindex="0"
						class="cursor-pointer rounded px-4 py-4 text-left border {selectedDeckId === deck.id
							? 'bg-slate/92 border-gold/30'
							: 'bg-stone/60 border-gold/10'}"
					>
						<div class="flex items-start justify-between gap-3">
							<div>
								<p class="font-display text-lg text-text-primary">{deck.name}</p>
								<p class="mt-1 font-body text-sm text-text-secondary">{deck.format || 'Casual'}</p>
							</div>
							<form method="POST" action="?/deleteDeck">
								<input type="hidden" name="deckId" value={deck.id} />
								<button
									type="submit"
									onclick={(event) => event.stopPropagation()}
									class="rounded px-3 py-2 font-display text-[10px] uppercase tracking-[0.22em] text-error bg-error/10 border border-error/22"
								>
									Delete
								</button>
							</form>
						</div>
						{#if deck.description}
							<p class="mt-3 font-body text-sm leading-7 text-text-secondary">{deck.description}</p>
						{/if}
					</div>
				{/each}
			{:else}
				<p class="font-body text-sm leading-7 text-text-secondary">
					No decks yet. Create one here, then add cards from the owned inventory picker on the
					right.
				</p>
			{/if}
		</div>
	</section>

	<section class="rounded-lg p-5 bg-crypt/92 border border-gold/14">
		{#if selectedDeck}
			<div class="flex flex-col gap-6">
				<div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
					<form method="POST" action="?/updateDeck" class="grid max-w-3xl gap-3">
						<input type="hidden" name="deckId" value={selectedDeck.id} />
						<input
							type="text"
							name="name"
							value={selectedDeck.name}
							class="rounded px-4 py-3 font-display text-2xl text-gold-bright focus:outline-none bg-stone/62 border border-gold/12"
						/>
						<textarea
							name="description"
							rows="3"
							class="rounded px-4 py-3 font-body text-sm text-text-secondary focus:outline-none bg-stone/62 border border-gold/12"
							>{selectedDeck.description}</textarea
						>
						<div class="flex flex-wrap items-center gap-3">
							<select
								name="format"
								value={selectedDeck.format || 'Commander'}
								class="rounded px-4 py-2 font-body text-sm text-text-primary focus:outline-none bg-crypt border border-gold/18"
							>
								{#each DECK_FORMATS as format}<option>{format}</option>{/each}
							</select>
							<button
								type="submit"
								class="rounded-lg px-4 py-2 font-display text-[10px] uppercase tracking-[0.22em] text-text-on-gold disabled:cursor-not-allowed disabled:opacity-50 bg-linear-to-br from-gold-dim to-gold border border-gold-bright"
							>
								Save Deck
							</button>
						</div>
					</form>
					<div class="rounded px-4 py-3 bg-stone/58 border border-gold/10">
						<p class="font-mono text-xl text-gold-bright">
							{deckCards.reduce((sum, card) => sum + card.quantity, 0)}
						</p>
						<p class="font-body text-[11px] uppercase tracking-[0.2em] text-text-secondary">
							Cards in Deck
						</p>
					</div>
				</div>

				<div class="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
					<div>
						<div class="flex items-center justify-between gap-3">
							<p class="font-display text-lg text-text-primary">Owned Cards</p>
							<input
								type="search"
								bind:value={addQuery}
								placeholder="Search owned cards..."
								class="rounded px-4 py-2 font-body text-sm text-text-primary placeholder:text-text-muted focus:outline-none bg-crypt border border-gold/18"
							/>
						</div>

						<div class="mt-4 flex flex-col gap-3">
							{#if ownedCandidates.length > 0}
								{#each ownedCandidates as candidate}
									<div
										class="grid gap-3 rounded px-4 py-4 sm:grid-cols-[60px_1fr_auto] bg-stone/58 border border-gold/10"
									>
										<img
											src={candidate.imageUri}
											alt={candidate.name}
											class="h-[84px] w-[60px] rounded object-cover"
										/>
										<div>
											<p class="font-display text-lg text-text-primary">{candidate.name}</p>
											<p class="mt-1 font-body text-sm text-text-secondary">
												{candidate.owned} owned · {candidate.setCode.toUpperCase()}
											</p>
										</div>
										<form method="POST" action="?/addCard">
											<input type="hidden" name="deckId" value={selectedDeck.id} />
											<input type="hidden" name="catalogCardId" value={candidate.catalogCardId} />
											<input
												type="hidden"
												name="canonicalCardId"
												value={candidate.canonicalCardId}
											/>
											<input type="hidden" name="name" value={candidate.name} />
											<input type="hidden" name="setCode" value={candidate.setCode} />
											<input type="hidden" name="imageUri" value={candidate.imageUri} />
											<input type="hidden" name="quantity" value="1" />
											<input type="hidden" name="role" value="main" />
											<button
												type="submit"
												class="rounded-lg px-4 py-2 font-display text-[10px] uppercase tracking-[0.22em] text-text-on-gold bg-linear-to-br from-gold-dim to-gold border border-gold-bright"
											>
												Add
											</button>
										</form>
									</div>
								{/each}
							{:else}
								<p class="font-body text-sm leading-7 text-text-secondary">
									No owned cards match this search. Add cards to inventory first from MTG search.
								</p>
							{/if}
						</div>
					</div>

					<div>
						<p class="font-display text-lg text-text-primary">Deck List</p>
						<div class="mt-4 flex flex-col gap-3">
							{#if deckCards.length > 0}
								{#each deckCards as card (card.id)}
									{@const status = getOwnedStatus(card)}
									<div
										class="grid gap-3 rounded px-4 py-4 sm:grid-cols-[60px_1fr_auto] bg-stone/58 border border-gold/10"
									>
										<img
											src={card.imageUri}
											alt={card.name}
											class="h-[84px] w-[60px] rounded object-cover"
										/>
										<div>
											<p class="font-display text-lg text-text-primary">{card.name}</p>
											<p class="mt-1 font-body text-sm text-text-secondary">
												Need {card.quantity} · Own {status.owned}
												{#if status.missing > 0}
													<span class="text-error"> · Missing {status.missing}</span>
												{/if}
											</p>
										</div>
										<div class="flex items-center gap-2 sm:justify-end">
											<form method="POST" action="?/updateCard">
												<input type="hidden" name="entryId" value={card.id} />
												<input type="hidden" name="quantity" value={nextQuantity(card, -1)} />
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
											<form method="POST" action="?/updateCard">
												<input type="hidden" name="entryId" value={card.id} />
												<input type="hidden" name="quantity" value={nextQuantity(card, 1)} />
												<button
													type="submit"
													class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full font-mono text-sm text-text-primary bg-crypt border border-gold/18"
												>
													+
												</button>
											</form>
										</div>
									</div>
								{/each}
							{:else}
								<p class="font-body text-sm leading-7 text-text-secondary">
									This deck is empty. Add owned cards from the left panel to start shaping the list.
								</p>
							{/if}
						</div>
					</div>
				</div>
			</div>
		{:else}
			<div class="flex min-h-[380px] items-center justify-center text-center">
				<div>
					<p class="font-display text-2xl text-text-primary">Create a deck to begin.</p>
					<p class="mt-3 font-body text-sm leading-7 text-text-secondary">
						Once a deck exists, this panel turns into the deck studio with owned-card suggestions
						and owned-versus-required counts.
					</p>
				</div>
			</div>
		{/if}
	</section>
</div>
