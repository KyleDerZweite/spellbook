<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import type { CardDocument } from '#lib/search/types.ts';
	import Button from '#lib/components/ui/button/Button.svelte';
	import Select from '#lib/components/ui/select/Select.svelte';
	import ManaCost from '#lib/components/cards/ManaCost.svelte';
	let {
		deckId,
		query = $bindable(''),
		ownedOnly = $bindable(false),
		addRole = $bindable('main'),
		addQuantity = $bindable(1),
		cards,
		owned,
		roles,
		busy,
		searching,
		searchError,
		requestId,
		addAction,
		submit,
		onSearch,
		onInspect,
		printingHref,
		native = false
	}: {
		deckId: string | undefined;
		query?: string;
		ownedOnly?: boolean;
		addRole?: string;
		addQuantity?: number;
		cards: CardDocument[];
		owned: ReadonlyMap<string, number>;
		roles: { value: string; label: string }[];
		busy: boolean;
		searching: boolean;
		searchError: string;
		requestId: string;
		addAction: string;
		submit: SubmitFunction;
		onSearch: (event: SubmitEvent) => void;
		onInspect: (card: CardDocument) => void;
		printingHref: (id: string) => string;
		native?: boolean;
	} = $props();
</script>

<form class="search-form" method="GET" action="/mtg/decks" onsubmit={onSearch}>
	<input type="hidden" name="deck" value={deckId} /><input
		type="hidden"
		name="flow"
		value="search"
	/>
	<input
		class="input"
		type="search"
		name="q"
		bind:value={query}
		aria-label="Search cards"
		placeholder="Search cards"
		minlength="2"
		maxlength="200"
		required
	/>
	<Button type="submit" variant="default" disabled={searching}>Search</Button>
</form>
<div class="catalog-options">
	<label><input type="checkbox" bind:checked={ownedOnly} /> Owned only</label>
	<span>{searching ? 'Searching…' : `${cards.length} shown`}</span>
</div>
{#if !native}<div class="add-options">
		<div class="add-section">
			<span class="label">Add to</span><Select
				label="Add to section"
				bind:value={addRole}
				options={roles}
			/>
		</div>
		<label
			>Quantity <input
				class="input quantity"
				type="number"
				min="1"
				max="10000"
				bind:value={addQuantity}
			/></label
		>
	</div>{/if}
<div class="catalog-results" aria-busy={searching}>
	{#if searchError}<p class="notice" role="alert">{searchError}</p>{/if}
	{#each cards as card (card.id)}
		<div class="catalog-row">
			<button
				class="catalog-art"
				onclick={() => onInspect(card)}
				aria-label={`Inspect ${card.name}`}
				><img src={card.image_uri_small || card.image_uri} alt={card.name} loading="lazy" /></button
			>
			<div class="catalog-card-info">
				<button class="card-name" onclick={() => onInspect(card)}>{card.name}</button>
				<ManaCost cost={card.mana_cost} />
				<p class="muted">
					{card.set_code.toUpperCase()} #{card.collector_number} · {owned.get(card.oracle_id) ?? 0} owned
				</p>
				<form method="POST" action={addAction} use:enhance={submit}>
					<input type="hidden" name="requestId" value={requestId} />
					<input type="hidden" name="deckId" value={deckId} /><input
						type="hidden"
						name="catalogCardId"
						value={card.id}
					/>
					{#if native}<label
							>Section<select name="role" class="input"
								>{#each roles as role}<option value={role.value} selected={role.value === addRole}
										>{role.label}</option
									>{/each}</select
							></label
						><label
							>Quantity<input
								name="quantity"
								type="number"
								class="input"
								min="1"
								max="10000"
								value={addQuantity}
							/></label
						>{:else}<input type="hidden" name="role" value={addRole} /><input
							type="hidden"
							name="quantity"
							value={addQuantity}
						/>{/if}
					<Button
						type="submit"
						variant="secondary"
						disabled={busy ||
							!Number.isInteger(addQuantity) ||
							addQuantity < 1 ||
							addQuantity > 10000}
						aria-label={`Add ${card.name}`}>Add</Button
					>
					<Button
						variant="ghost"
						href={printingHref(card.oracle_id)}
						onclick={(event) => {
							event.preventDefault();
							onInspect(card);
						}}>Printings</Button
					>
				</form>
			</div>
		</div>
	{:else}<p class="empty-state">
			{query
				? 'No cards found. Try another search or turn off the owned filter.'
				: 'Find a card to add to your deck.'}
		</p>{/each}
</div>

<style>
	.search-form {
		display: flex;
		gap: 0.5rem;
	}
	.search-form input {
		min-width: 0;
		flex: 1;
	}
	.catalog-options {
		font-size: 0.75rem;
		margin: 1rem 0;
	}
	.catalog-options label {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.add-options {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	.add-options label,
	.add-section {
		font-size: 0.7rem;
		color: var(--color-text-secondary);
	}
	.add-section {
		flex: 1;
		min-width: 0;
	}
	.add-options :global(.input) {
		margin-top: 0.3rem;
	}
	.quantity {
		width: 4.5rem;
	}
	.catalog-row {
		display: flex;
		gap: 0.8rem;
		padding: 1rem 0;
	}
	.catalog-art {
		width: 72px;
		flex-shrink: 0;
		align-self: start;
	}
	.catalog-art img {
		width: 100%;
		border-radius: 5px;
	}
	.catalog-card-info {
		min-width: 0;
	}
	.catalog-card-info p {
		margin: 0.4rem 0;
	}
	.catalog-card-info :global(.card-name) {
		margin-bottom: 0.4rem;
	}

	.catalog-options {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.catalog-results {
		max-height: calc(100dvh - 310px);
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.card-name {
		text-align: left;
		font-size: 0.85rem;
		overflow-wrap: anywhere;
		font-weight: 500;
	}
	.card-name:hover {
		text-decoration: underline;
	}
	.muted,
	.notice,
	.empty-state {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
	}
	.empty-state {
		padding: 2rem 0;
	}
	.catalog-card-info form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.catalog-card-info form label {
		flex: 1 0 100%;
	}
	@media (max-width: 1000px) {
		.catalog-results {
			max-height: none;
		}
	}
</style>
