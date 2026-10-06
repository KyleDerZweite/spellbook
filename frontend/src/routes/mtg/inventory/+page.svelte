<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import type { PageProps } from './$types';
	import CardDetail from '#lib/components/cards/CardDetail.svelte';
	import Select from '#lib/components/ui/select/Select.svelte';
	import { storedCardDocument } from '#lib/mtg/stored-card.ts';
	import { getSetCatalogSize } from '#lib/search/catalog.ts';
	import { activeGameState } from '#lib/state/activeGame.svelte.ts';

	let { data, form }: PageProps = $props();
	let sortBy = $state('name');
	let query = $state('');
	let selectedSet = $state('all');
	let selectedFinish = $state('all');
	let inspectedId = $state<string | null>(null);
	let removeId = $state<string | null>(null);
	let pendingId = $state<string | null>(null);
	let status = $state('');
	let mutationError = $state('');
	let setCatalogTotal = $state<number | null>(null);
	let setProgressLoading = $state(false);
	const sortOptions = [
		{ value: 'name', label: 'Name' },
		{ value: 'set', label: 'Set' },
		{ value: 'recent', label: 'Recently updated' }
	];
	const finishOptions = [
		{ value: 'all', label: 'Any finish' },
		{ value: 'nonfoil', label: 'Nonfoil' },
		{ value: 'foil', label: 'Foil' }
	];
	let inventoryCards = $derived(data.cards);
	let inspected = $derived(inventoryCards.find((card) => card.id === inspectedId));
	let setOptions = $derived([
		{ value: 'all', label: 'All sets' },
		...[
			...new Set([
				...inventoryCards.map((card) => card.setCode),
				...(selectedSet === 'all' ? [] : [selectedSet])
			])
		]
			.sort()
			.map((value) => ({ value, label: value.toUpperCase() }))
	]);
	let hasFilters = $derived(
		query.trim() !== '' || selectedSet !== 'all' || selectedFinish !== 'all'
	);
	let listCards = $derived.by(() => {
		const normalizedQuery = query.trim().toLowerCase();
		const next = inventoryCards.filter((card) => {
			if (selectedSet !== 'all' && card.setCode !== selectedSet) return false;
			if (selectedFinish !== 'all' && card.finish !== selectedFinish) return false;
			return (
				!normalizedQuery ||
				[card.name, card.setCode, card.condition, card.notes].some((value) =>
					value.toLowerCase().includes(normalizedQuery)
				)
			);
		});
		next.sort((a, b) => {
			if (sortBy === 'set')
				return a.setCode.localeCompare(b.setCode) || a.name.localeCompare(b.name);
			if (sortBy === 'recent')
				return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
			return a.name.localeCompare(b.name) || a.setCode.localeCompare(b.setCode);
		});
		return next;
	});
	let matchingQuantity = $derived(listCards.reduce((total, card) => total + card.quantity, 0));
	let ownedInSet = $derived(
		new Set(
			inventoryCards
				.filter((card) => card.setCode === selectedSet)
				.map((card) => card.canonicalCardId)
		).size
	);

	$effect(() => {
		const setCode = selectedSet;
		const game = activeGameState.current;
		setCatalogTotal = null;
		setProgressLoading = setCode !== 'all';
		if (setCode === 'all') return;
		let cancelled = false;
		getSetCatalogSize(setCode, game)
			.then((total) => {
				if (!cancelled) setCatalogTotal = total;
			})
			.catch(() => {
				if (!cancelled) setCatalogTotal = null;
			})
			.finally(() => {
				if (!cancelled) setProgressLoading = false;
			});
		return () => {
			cancelled = true;
		};
	});
	function clearFilters() {
		query = '';
		selectedSet = 'all';
		selectedFinish = 'all';
	}
	const saveEntry: SubmitFunction = ({ formData, action, cancel }) => {
		if (pendingId) {
			cancel();
			return;
		}
		const id = String(formData.get('entryId'));
		const card = inventoryCards.find((entry) => entry.id === id);
		const removing = action.searchParams.has('/remove');
		pendingId = id;
		status = 'Saving…';
		mutationError = '';
		return async ({ result, update }) => {
			try {
				if (result.type === 'success') {
					await update({ reset: false });
					removeId = null;
					status = removing
						? `${card?.name ?? 'Entry'} removed.`
						: `${card?.name ?? 'Quantity'} saved.`;
				} else if (result.type === 'redirect') {
					await update();
				} else {
					mutationError =
						result.type === 'failure' && typeof result.data?.message === 'string'
							? result.data.message
							: 'Could not save this change. Try again.';
					status = '';
				}
			} catch {
				mutationError = 'Could not refresh inventory. Reload before trying again.';
				status = '';
			} finally {
				pendingId = null;
			}
		};
	};
</script>

<svelte:head><title>Inventory | Spellbook</title></svelte:head>

<div class="inventory-page workspace-container">
	<div class="inventory-heading">
		<div>
			<div class="page-title"><h1>Inventory</h1></div>
			<p class="inventory-totals">
				<strong>{data.stats.total.toLocaleString()}</strong> cards <span>·</span>
				<strong>{data.stats.unique.toLocaleString()}</strong>
				card names <span>·</span> <strong>{data.stats.sets}</strong> sets
			</p>
		</div>
		<div class="inventory-actions">
			<a href="/mtg/scan" class="btn btn-ghost">Scan</a><a
				href="/mtg/search"
				class="btn btn-primary">Add cards</a
			>
		</div>
	</div>
	{#if mutationError || form?.message}<p class="mutation-error" role="alert">
			{mutationError || form?.message}
		</p>{/if}
	{#if inventoryCards.length === 0}
		<div class="empty-state">
			<p>No cards yet.</p>
			<a href="/mtg/search" class="btn btn-secondary">Find your first card</a>
		</div>
	{:else}
		<div class="inventory-toolbar">
			<div class="inventory-search">
				<svg
					aria-hidden="true"
					width="17"
					height="17"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"><circle cx="10" cy="10" r="7" /><path d="m15 15 6 6" /></svg
				><input
					type="search"
					aria-label="Search inventory"
					bind:value={query}
					placeholder="Search inventory"
					class="input"
				/>
			</div>
			<Select label="Filter by set" bind:value={selectedSet} options={setOptions} />
			<Select label="Filter by finish" bind:value={selectedFinish} options={finishOptions} />
			<Select
				label="Sort inventory"
				bind:value={sortBy}
				options={sortOptions}
				displayValue={sortOptions.find((option) => option.value === sortBy)?.label}
			/>
		</div>
		<div class="inventory-context">
			<p>
				{listCards.length}
				{listCards.length === 1 ? 'entry' : 'entries'} <span>·</span>
				{matchingQuantity} cards
			</p>
			{#if hasFilters}<button type="button" class="clear-filters" onclick={clearFilters}
					>Clear filters</button
				>{/if}<span class="save-status" role="status">{status}</span>
		</div>
		{#if selectedSet !== 'all'}
			<div class="set-progress">
				<p>
					{selectedSet.toUpperCase()} <span>·</span>
					{setCatalogTotal !== null && setCatalogTotal > 0
						? `${ownedInSet} of ${setCatalogTotal} card names owned`
						: `${ownedInSet} card names owned`}
					{#if setProgressLoading}<span>·</span> Loading set total…{:else if setCatalogTotal === null || setCatalogTotal === 0}<span
							>·</span
						> Set total unavailable{/if}
				</p>
				{#if setCatalogTotal !== null && setCatalogTotal > 0}<progress
						value={Math.min(ownedInSet, setCatalogTotal)}
						max={setCatalogTotal}
						aria-label={`${selectedSet.toUpperCase()} set completion`}
					></progress>{/if}
			</div>
		{/if}
		{#if listCards.length === 0}<div class="empty-state">
				<p>No cards match these filters.</p>
				<button class="btn btn-secondary" onclick={clearFilters}>Clear filters</button>
			</div>
		{:else}
			<div class="inventory-columns" aria-hidden="true">
				<span>Card</span><span>Set</span><span>Finish</span><span>Condition</span><span
					>Quantity</span
				><span></span>
			</div>
			<ul class="inventory-list" aria-label="Inventory entries">
				{#each listCards as card (card.id)}
					<li class="inventory-row" class:saving={pendingId === card.id}>
						<button
							class="card-identity"
							onclick={() => (inspectedId = card.id)}
							aria-label={`Inspect ${card.name}, ${card.setCode.toUpperCase()}, ${card.finish}, ${card.condition}`}
							><img src={card.imageUri} alt="" width="40" height="56" loading="lazy" /><span
								><strong>{card.name}</strong><span class="mobile-metadata"
									>{card.setCode.toUpperCase()} · {card.finish === 'foil' ? 'Foil' : 'Nonfoil'} · {card.condition}</span
								>{#if card.notes}<span class="entry-notes">{card.notes}</span>{/if}</span
							></button
						>
						<span class="row-metadata set-code">{card.setCode.toUpperCase()}</span><span
							class="row-metadata">{card.finish === 'foil' ? 'Foil' : 'Nonfoil'}</span
						><span class="row-metadata">{card.condition}</span>
						<div class="quantity-controls">
							{#each [-1, 1] as delta}
								{#if delta === 1}<span class="quantity" aria-label={`${card.quantity} copies`}
										>{card.quantity}</span
									>{/if}
								<form method="POST" action="?/updateQuantity" use:enhance={saveEntry}>
									<input type="hidden" name="entryId" value={card.id} /><input
										type="hidden"
										name="quantity"
										value={card.quantity + delta}
									/><input type="hidden" name="notes" value={card.notes} /><button
										type="submit"
										class="quantity-button"
										disabled={pendingId !== null || (delta === -1 && card.quantity <= 1)}
										aria-label={`${delta === -1 ? 'Decrease' : 'Increase'} ${card.name} quantity`}
										><svg
											aria-hidden="true"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="1.5"
											><path d="M5 12h14" />{#if delta === 1}<path d="M12 5v14" />{/if}</svg
										></button
									>
								</form>
							{/each}
						</div>
						<button
							class="remove-entry"
							aria-label={`Remove ${card.name} entry`}
							disabled={pendingId !== null}
							onclick={() => (removeId = removeId === card.id ? null : card.id)}>Remove</button
						>
						{#if removeId === card.id}<div class="remove-confirmation">
								<p>
									Remove {card.quantity > 1 ? 'all ' : ''}{card.quantity}
									{card.quantity === 1 ? 'copy' : 'copies'} of {card.name}?
								</p>
								<div>
									<button
										class="btn btn-ghost btn-sm"
										disabled={pendingId !== null}
										onclick={() => (removeId = null)}>Cancel</button
									>
									<form method="POST" action="?/remove" use:enhance={saveEntry}>
										<input type="hidden" name="entryId" value={card.id} /><button
											class="btn btn-destructive btn-sm"
											type="submit"
											disabled={pendingId !== null}>Remove</button
										>
									</form>
								</div>
							</div>{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

{#if inspected}
	<CardDetail card={storedCardDocument(inspected)} onClose={() => (inspectedId = null)}>
		{#snippet actions(activeCard)}
			{#if inspected && activeCard.id === inspected.catalogCardId}
				<form
					method="POST"
					action="?/updateQuantity"
					use:enhance={saveEntry}
					class="inspector-form"
				>
					<input type="hidden" name="entryId" value={inspected.id} />
					<p>
						{inspected.setCode.toUpperCase()} · {inspected.finish === 'foil' ? 'Foil' : 'Nonfoil'} · {inspected.condition}
					</p>
					<label class="label" for="inventory-quantity">Owned quantity</label><input
						class="input"
						id="inventory-quantity"
						name="quantity"
						type="number"
						min="1"
						step="1"
						required
						value={inspected.quantity}
					/><label class="label" for="inventory-notes">Notes</label><textarea
						class="input"
						id="inventory-notes"
						name="notes"
						rows="2"
						value={inspected.notes}></textarea><button
						type="submit"
						class="btn btn-primary"
						disabled={pendingId !== null}>{pendingId === inspected.id ? 'Saving…' : 'Save'}</button
					>{#if mutationError}<p class="mutation-error" role="alert">{mutationError}</p>{:else}<p
							class="text-sm text-text-muted"
							role="status"
						>
							{status}
						</p>{/if}
				</form>
			{:else}<a
					class="btn btn-secondary"
					href={`/mtg/search?q=${encodeURIComponent(activeCard.name)}`}>Find this card in Search</a
				>{/if}
		{/snippet}
	</CardDetail>
{/if}

<style>
	.inventory-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.25rem;
	}
	.inventory-totals {
		margin-top: 0.5rem;
		color: var(--color-text-muted);
		font-size: 0.8125rem;
	}
	.inventory-totals strong {
		font-weight: 500;
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}
	.inventory-totals span,
	.inventory-context p span,
	.set-progress p span {
		margin: 0 0.4rem;
		color: var(--color-text-muted);
	}
	.inventory-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.inventory-toolbar {
		display: grid;
		grid-template-columns: minmax(180px, 1fr) 140px 150px 190px;
		gap: 0.625rem;
	}
	.inventory-search {
		position: relative;
		min-width: 0;
	}
	.inventory-search svg {
		position: absolute;
		left: 0.8rem;
		top: 50%;
		transform: translateY(-50%);
		color: var(--color-text-muted);
		pointer-events: none;
	}
	.inventory-search input {
		width: 100%;
		padding-left: 2.4rem;
	}
	.inventory-context {
		min-height: 2.5rem;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		column-gap: 0.75rem;
		row-gap: 0.25rem;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		padding: 0.5rem 0;
	}
	.clear-filters {
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
		color: var(--color-text-secondary);
	}
	.save-status {
		margin-left: auto;
	}
	.set-progress {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 1.25rem;
		color: var(--color-text-secondary);
		font-size: 0.8125rem;
	}
	.set-progress progress {
		width: 160px;
		height: 4px;
		border: 0;
		border-radius: 4px;
		overflow: hidden;
		background: var(--color-muted);
		accent-color: var(--color-text-secondary);
	}
	.set-progress progress::-webkit-progress-bar {
		background: var(--color-muted);
	}
	.set-progress progress::-webkit-progress-value {
		background: var(--color-text-secondary);
	}
	.inventory-columns,
	.inventory-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 75px 85px 85px 115px 65px;
		gap: 1rem;
		align-items: center;
	}
	.inventory-columns {
		padding: 0 0.625rem 0.625rem;
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}
	.inventory-columns span:nth-child(5) {
		text-align: center;
	}
	.inventory-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.inventory-row {
		padding: 0.5rem 0.625rem;
		border-radius: 0.5rem;
		min-height: 72px;
	}
	.inventory-row:hover,
	.inventory-row:focus-within {
		background: var(--color-surface);
	}
	.inventory-row.saving {
		opacity: 0.65;
	}
	.card-identity {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		text-align: left;
		min-width: 0;
		cursor: pointer;
	}
	.card-identity img {
		width: 40px;
		height: 56px;
		flex-shrink: 0;
		border-radius: 3px;
		object-fit: cover;
		background: var(--color-muted);
	}
	.card-identity > span {
		min-width: 0;
	}
	.card-identity strong {
		display: block;
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}
	.card-identity:hover strong {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.row-metadata {
		color: var(--color-text-secondary);
		font-size: 0.8125rem;
	}
	.set-code {
		letter-spacing: 0.025em;
	}
	.mobile-metadata {
		display: none;
	}
	.entry-notes {
		display: block;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--color-text-muted);
		font-size: 0.75rem;
		margin-top: 0.15rem;
	}
	.quantity-controls {
		display: flex;
		justify-content: center;
		align-items: center;
	}
	.quantity-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 0.375rem;
		color: var(--color-text-secondary);
		cursor: pointer;
	}
	.quantity-button:hover:not(:disabled) {
		background: var(--color-muted);
		color: var(--color-text-primary);
	}
	.quantity-button:disabled {
		opacity: 0.25;
	}
	.quantity {
		min-width: 2rem;
		text-align: center;
		font-size: 0.8125rem;
		font-variant-numeric: tabular-nums;
	}
	.remove-entry {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		min-height: 36px;
		cursor: pointer;
	}
	.remove-entry:hover {
		color: var(--color-error);
	}
	.remove-confirmation {
		grid-column: 1 / -1;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 0 0.25rem;
		font-size: 0.8125rem;
	}
	.remove-confirmation > div {
		display: flex;
		gap: 0.5rem;
	}
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		min-height: 280px;
		text-align: center;
		color: var(--color-text-secondary);
	}
	.mutation-error {
		color: var(--color-error);
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}
	.inspector-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.inspector-form > p {
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
	}
	.inspector-form .label {
		margin: 0.25rem 0 0;
	}
	@media (max-width: 900px) {
		.inventory-toolbar {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.inventory-search {
			grid-column: 1 / -1;
		}
		.inventory-columns,
		.inventory-row {
			grid-template-columns: minmax(0, 1fr) 108px 55px;
			gap: 0.5rem;
		}
		.inventory-columns {
			display: none;
		}
		.row-metadata {
			display: none;
		}
		.mobile-metadata {
			display: block;
			color: var(--color-text-muted);
			font-size: 0.75rem;
			margin-top: 0.25rem;
		}
	}
	@media (max-width: 560px) {
		.inventory-heading {
			align-items: flex-start;
			gap: 0.5rem;
			margin-bottom: 1rem;
		}
		.inventory-heading > div:first-child {
			min-width: 0;
		}
		.inventory-totals {
			font-size: 0.75rem;
		}
		.inventory-totals span {
			margin: 0 0.15rem;
		}
		.inventory-actions {
			flex-direction: column-reverse;
			gap: 0;
		}
		.inventory-actions .btn {
			font-size: 0.75rem;
		}
		.inventory-toolbar {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 0.5rem;
		}
		.inventory-toolbar :global(> button) {
			font-size: 0.75rem;
			padding-inline: 0.5rem;
			gap: 0.25rem;
		}
		.inventory-row {
			grid-template-columns: minmax(0, 1fr) 112px;
			padding: 0.375rem 0;
			gap: 0 0.5rem;
		}
		.card-identity {
			grid-column: 1;
			grid-row: 1 / 3;
			gap: 0.625rem;
		}
		.card-identity strong {
			font-size: 0.8125rem;
		}
		.mobile-metadata {
			font-size: 0.75rem;
		}
		.quantity-controls {
			grid-column: 2;
		}
		.quantity-button {
			width: 44px;
			height: 44px;
		}
		.quantity {
			min-width: 24px;
		}
		.remove-entry {
			grid-column: 2;
			min-height: 44px;
		}
		.remove-confirmation {
			flex-wrap: wrap;
		}
		.remove-confirmation > div {
			margin-left: auto;
		}
		.set-progress {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.5rem;
		}
		.set-progress progress {
			width: 100%;
		}
		.save-status:empty {
			display: none;
		}
	}
	@media (max-width: 360px) {
		.inventory-heading {
			flex-wrap: wrap;
		}
		.inventory-actions {
			flex-direction: row;
		}
		.inventory-toolbar {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.inventory-toolbar :global(> button:last-child) {
			grid-column: 1 / -1;
		}
	}
</style>
