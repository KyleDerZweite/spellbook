<script lang="ts">
	import OrnamentalDivider from '$lib/components/layout/OrnamentalDivider.svelte';
	import { spacetimeState } from '$lib/spacetimedb/state.svelte';
	import { getConnection } from '$lib/spacetimedb/client';
	import type { DeckCard } from '$bindings/types';

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

	let selectedDeckId: string | null = $state(null);
	let newDeckName = $state('');
	let newDeckDescription = $state('');
	let newDeckFormat = $state('Commander');
	let editDeckName = $state('');
	let editDeckDescription = $state('');
	let editDeckFormat = $state('Commander');
	let addQuery = $state('');

	let decks = $derived(spacetimeState.getDecks('mtg'));

	$effect(() => {
		if (selectedDeckId && decks.some((deck) => deck.id === selectedDeckId)) {
			return;
		}

		selectedDeckId = decks[0]?.id ?? null;
	});

	let selectedDeck = $derived(selectedDeckId ? spacetimeState.getDeck(selectedDeckId) : undefined);
	let deckCards = $derived(selectedDeckId ? spacetimeState.getDeckCards(selectedDeckId) : []);

	$effect(() => {
		if (!selectedDeck) {
			editDeckName = '';
			editDeckDescription = '';
			editDeckFormat = 'Commander';
			return;
		}

		editDeckName = selectedDeck.name;
		editDeckDescription = selectedDeck.description;
		editDeckFormat = selectedDeck.format || 'Commander';
	});

	let ownedByCanonical = $derived.by(() => {
		const map = new Map<string, OwnedCandidate>();
		for (const card of spacetimeState.getInventoryCards('mtg')) {
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

	async function handleCreateDeck() {
		const conn = getConnection();
		if (!conn || !newDeckName.trim()) return;

		try {
			await conn.reducers.createDeck({
				game: 'mtg',
				name: newDeckName.trim(),
				description: newDeckDescription.trim(),
				format: newDeckFormat
			});
			newDeckName = '';
			newDeckDescription = '';
			newDeckFormat = 'Commander';
		} catch (err) {
			spacetimeState.error = `Failed to create deck: ${String(err)}`;
		}
	}

	async function handleUpdateDeck() {
		const conn = getConnection();
		if (!conn || !selectedDeck) return;

		try {
			await conn.reducers.updateDeck({
				deckId: selectedDeck.id,
				name: editDeckName.trim(),
				description: editDeckDescription.trim(),
				format: editDeckFormat
			});
		} catch (err) {
			spacetimeState.error = `Failed to update deck: ${String(err)}`;
		}
	}

	async function handleDeleteDeck(deckId: string) {
		const conn = getConnection();
		if (!conn) return;

		try {
			await conn.reducers.deleteDeck({
				deckId
			});
		} catch (err) {
			spacetimeState.error = `Failed to delete deck: ${String(err)}`;
		}
	}

	async function handleAddCard(candidate: OwnedCandidate) {
		const conn = getConnection();
		if (!conn || !selectedDeckId) return;

		try {
			await conn.reducers.addToDeck({
				deckId: selectedDeckId,
				catalogCardId: candidate.catalogCardId,
				canonicalCardId: candidate.canonicalCardId,
				name: candidate.name,
				setCode: candidate.setCode,
				imageUri: candidate.imageUri,
				quantity: 1,
				role: 'main'
			});
		} catch (err) {
			spacetimeState.error = `Failed to add card to deck: ${String(err)}`;
		}
	}

	async function handleUpdateDeckCard(card: DeckCard, delta: number) {
		const conn = getConnection();
		if (!conn) return;

		const nextQuantity = card.quantity + delta;
		try {
			if (nextQuantity <= 0) {
				await conn.reducers.removeFromDeck({
					entryId: card.entryId
				});
			} else {
				await conn.reducers.updateDeckCard({
					entryId: card.entryId,
					quantity: nextQuantity
				});
			}
		} catch (err) {
			spacetimeState.error = `Failed to update deck card: ${String(err)}`;
		}
	}
</script>

<svelte:head>
	<title>MTG Decks | Spellbook</title>
</svelte:head>

<div class="grid gap-6 px-4 py-4 sm:px-6 sm:py-6 xl:grid-cols-[0.72fr_1.28fr]">
	<section
		class="rounded-lg p-5 bg-crypt/92 border border-gold/14"
	>
		<p class="font-mono text-[11px] uppercase tracking-[0.3em] text-gold-dim">MTG Deck Studio</p>
		<h1 class="mt-3 font-display text-3xl font-bold text-gold-bright">Decks</h1>
		<p class="mt-3 font-body leading-7 text-text-secondary">
			Decks are separate from inventory, but every list compares itself against what you already
			own.
		</p>

		<div class="mt-6 flex flex-col gap-3">
			<input
				type="text"
				bind:value={newDeckName}
				placeholder="Deck name"
				class="rounded px-4 py-3 font-body text-sm text-text-primary placeholder:text-text-muted focus:outline-none bg-crypt border border-gold/16"
			/>
			<textarea
				bind:value={newDeckDescription}
				rows="3"
				placeholder="Description"
				class="rounded px-4 py-3 font-body text-sm text-text-primary placeholder:text-text-muted focus:outline-none bg-crypt border border-gold/16"
			></textarea>
			<select
				bind:value={newDeckFormat}
				class="rounded px-4 py-3 font-body text-sm text-text-primary focus:outline-none bg-crypt border border-gold/16"
			>
				{#each DECK_FORMATS as format}<option>{format}</option>{/each}
			</select>
			<button
				onclick={handleCreateDeck}
				disabled={!newDeckName.trim()}
				class="rounded-lg px-5 py-3 font-display text-xs uppercase tracking-[0.24em] text-text-on-gold disabled:cursor-not-allowed disabled:opacity-50 bg-linear-to-br from-gold-dim to-gold border border-gold-bright"
			>
				Create Deck
			</button>
		</div>

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
						class="cursor-pointer rounded px-4 py-4 text-left border {selectedDeckId === deck.id ? 'bg-slate/92 border-gold/30' : 'bg-stone/60 border-gold/10'}"
					>
						<div class="flex items-start justify-between gap-3">
							<div>
								<p class="font-display text-lg text-text-primary">{deck.name}</p>
								<p class="mt-1 font-body text-sm text-text-secondary">{deck.format || 'Casual'}</p>
							</div>
							<button
								onclick={(event) => {
									event.stopPropagation();
									if (confirm('Delete "' + deck.name + '"?')) handleDeleteDeck(deck.id);
								}}
								class="rounded px-3 py-2 font-display text-[10px] uppercase tracking-[0.22em] text-error bg-error/10 border border-error/22"
							>
								Delete
							</button>
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

	<section
		class="rounded-lg p-5 bg-crypt/92 border border-gold/14"
	>
		{#if spacetimeState.error}
			<p
				class="mb-4 rounded px-3 py-2 font-body text-sm text-error bg-error/10 border border-error/30"
			>
				{spacetimeState.error}
				<button
					onclick={() => (spacetimeState.error = null)}
					class="ml-2 cursor-pointer border-none bg-transparent text-text-muted hover:text-text-primary"
					>&#10005;</button
				>
			</p>
		{/if}

		{#if selectedDeck}
			<div class="flex flex-col gap-6">
				<div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
					<div class="grid max-w-3xl gap-3">
						<input
							type="text"
							bind:value={editDeckName}
							class="rounded px-4 py-3 font-display text-2xl text-gold-bright focus:outline-none bg-stone/62 border border-gold/12"
						/>
						<textarea
							bind:value={editDeckDescription}
							rows="3"
							class="rounded px-4 py-3 font-body text-sm text-text-secondary focus:outline-none bg-stone/62 border border-gold/12"
						></textarea>
						<div class="flex flex-wrap items-center gap-3">
							<select
								bind:value={editDeckFormat}
								class="rounded px-4 py-2 font-body text-sm text-text-primary focus:outline-none bg-crypt border border-gold/18"
							>
								{#each DECK_FORMATS as format}<option>{format}</option>{/each}
							</select>
							<button
								onclick={handleUpdateDeck}
								disabled={!editDeckName.trim()}
								class="rounded-lg px-4 py-2 font-display text-[10px] uppercase tracking-[0.22em] text-text-on-gold disabled:cursor-not-allowed disabled:opacity-50 bg-linear-to-br from-gold-dim to-gold border border-gold-bright"
							>
								Save Deck
							</button>
						</div>
					</div>
					<div
						class="rounded px-4 py-3 bg-stone/58 border border-gold/10"
					>
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
										<button
											onclick={() => handleAddCard(candidate)}
											class="rounded-lg px-4 py-2 font-display text-[10px] uppercase tracking-[0.22em] text-text-on-gold bg-linear-to-br from-gold-dim to-gold border border-gold-bright"
										>
											Add
										</button>
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
								{#each deckCards as card (card.entryId)}
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
											<button
												onclick={() => handleUpdateDeckCard(card, -1)}
												class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full font-mono text-sm text-text-primary bg-crypt border border-gold/18"
											>
												-
											</button>
											<span class="w-8 text-center font-mono text-sm text-text-primary"
												>{card.quantity}</span
											>
											<button
												onclick={() => handleUpdateDeckCard(card, 1)}
												class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full font-mono text-sm text-text-primary bg-crypt border border-gold/18"
											>
												+
											</button>
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
