<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { tick } from 'svelte';
	import type { PageProps } from './$types';
	import CardDetail from '#lib/components/cards/CardDetail.svelte';
	import Select from '#lib/components/ui/select/Select.svelte';
	import ActionMenu from '#lib/components/ui/menu/ActionMenu.svelte';
	import {
		describeInventoryOrder,
		filterInventory,
		inventoryConditions,
		inventorySetColor,
		isNewInventoryEntry,
		nextInventoryOrder,
		orderInventory,
		type InventoryColumn,
		type InventoryOrder
	} from '#lib/mtg/inventory-view.ts';
	import { storedCardDocument } from '#lib/mtg/stored-card.ts';
	import { getSetCatalogSize } from '#lib/search/catalog.ts';
	import { activeGameState } from '#lib/state/activeGame.svelte.ts';

	let { data, form }: PageProps = $props();
	let order = $state<InventoryOrder>({ base: 'name', direction: 'asc', variant: null });
	let query = $state('');
	let selectedSet = $state('all');
	let selectedFinish = $state('all');
	let selectedCondition = $state('all');
	let inspectedId = $state<string | null>(null);
	let removeId = $state<string | null>(null);
	let pendingId = $state<string | null>(null);
	let status = $state('');
	let mutationError = $state('');
	let setCatalogTotal = $state<number | null>(null);
	let setProgressLoading = $state(false);
	let viewedAt = $state<Date | null>(null);
	let asOf = $derived(viewedAt ?? data.viewedAt);
	let searchInput = $state<HTMLInputElement | null>(null);
	let emptyAction = $state<HTMLAnchorElement | null>(null);
	let removeCancel = $state<HTMLButtonElement | null>(null);
	let rowMenuRefs = $state<Record<string, HTMLButtonElement | null>>({});
	const addedDate = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' });
	const columns: Array<{ column: Exclude<InventoryColumn, 'newest'>; label: string }> = [
		{ column: 'name', label: 'Card' },
		{ column: 'set', label: 'Set' },
		{ column: 'finish', label: 'Finish' },
		{ column: 'condition', label: 'Condition' },
		{ column: 'quantity', label: 'Quantity' }
	];
	const conditionOptions = [
		{ value: 'all', label: 'Any condition' },
		...inventoryConditions.map((value) => ({ value, label: value }))
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
		query.trim() !== '' ||
			selectedSet !== 'all' ||
			selectedFinish !== 'all' ||
			selectedCondition !== 'all'
	);
	let listCards = $derived(
		orderInventory(
			filterInventory(inventoryCards, {
				query,
				set: selectedSet,
				finish: selectedFinish,
				condition: selectedCondition
			}),
			order
		)
	);
	let sortDescription = $derived(describeInventoryOrder(order));
	$effect(() => {
		const anchor = data.viewedAt.getTime();
		const started = Date.now();
		viewedAt = data.viewedAt;
		const timer = setInterval(() => {
			viewedAt = new Date(anchor + Date.now() - started);
		}, 60_000);
		return () => clearInterval(timer);
	});
	async function cancelRemoval(id: string) {
		removeId = null;
		await tick();
		rowMenuRefs[id]?.focus();
	}
	function focusRemoval(event: Event, id: string) {
		if (removeId !== id) return;
		event.preventDefault();
		void tick().then(() => (removeCancel ?? rowMenuRefs[id])?.focus());
	}
	function columnDirection(column: InventoryColumn) {
		return order.base === column
			? order.direction
			: order.variant?.column === column
				? order.variant.direction
				: null;
	}
	function setColumnFilter(column: InventoryColumn, value: string) {
		if (column === 'set') selectedSet = value;
		if (column === 'finish') selectedFinish = value;
		if (column === 'condition') selectedCondition = value;
	}
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
		selectedCondition = 'all';
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
					const index = listCards.findIndex((entry) => entry.id === id);
					const neighbor = listCards[index + 1] ?? listCards[index - 1];
					await update({ reset: false });
					removeId = null;
					if (removing) {
						await tick();
						(rowMenuRefs[neighbor?.id ?? ''] ?? searchInput ?? emptyAction)?.focus();
					}
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
			<a bind:this={emptyAction} href="/mtg/search" class="btn btn-secondary"
				>Find your first card</a
			>
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
					bind:this={searchInput}
					aria-label="Search inventory"
					bind:value={query}
					placeholder="Search inventory"
					class="input"
				/>
			</div>
			<p class="inventory-result-count">
				{listCards.length}
				{listCards.length === 1 ? 'entry' : 'entries'} <span>·</span>
				{matchingQuantity} cards
			</p>
		</div>
		<div class="inventory-context">
			<div class="active-filters">
				{#if selectedSet !== 'all'}<button
						type="button"
						class="active-filter"
						aria-label={`Clear set filter ${selectedSet.toUpperCase()}`}
						onclick={() => (selectedSet = 'all')}
						>Set: {selectedSet.toUpperCase()} <span aria-hidden="true">×</span></button
					>{/if}
				{#if selectedFinish !== 'all'}<button
						type="button"
						class="active-filter"
						aria-label={`Clear finish filter ${selectedFinish}`}
						onclick={() => (selectedFinish = 'all')}
						>{selectedFinish === 'foil' ? 'Foil' : 'Nonfoil'}
						<span aria-hidden="true">×</span></button
					>{/if}
				{#if selectedCondition !== 'all'}<button
						type="button"
						class="active-filter"
						aria-label={`Clear condition filter ${selectedCondition}`}
						onclick={() => (selectedCondition = 'all')}
						>{selectedCondition} <span aria-hidden="true">×</span></button
					>{/if}
				{#if hasFilters}<button type="button" class="clear-filters" onclick={clearFilters}
						>Clear filters</button
					>{/if}
			</div>
			<span class="save-status" role="status">{status}</span>
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
		<p class="sr-only" id="inventory-order" role="status">{sortDescription}</p>
		<div
			class="inventory-columns"
			role="group"
			aria-label="Inventory sorting and filters"
			aria-describedby="inventory-order"
		>
			{#each columns as { column, label }}
				<div class="column-header">
					<button
						type="button"
						class="column-sort"
						class:has-direction={columnDirection(column) !== null ||
							(column === 'name' && order.base === 'newest')}
						aria-pressed={columnDirection(column) !== null ||
							(column === 'name' && order.base === 'newest')}
						aria-label={`Sort by ${label.toLowerCase()} ${columnDirection(column) === 'asc' ? 'descending' : 'ascending'}`}
						onclick={() => (order = nextInventoryOrder(order, column))}
						>{column === 'name' && order.base === 'newest' ? 'Newest' : label}<span
							class="sort-direction"
							aria-hidden="true">{columnDirection(column) === 'asc' ? '↑' : '↓'}</span
						></button
					>
					{#if column === 'name'}
						<ActionMenu
							label="Card ordering"
							iconOnly
							class="card-order-menu"
							items={[
								{
									label: 'Newest first',
									onSelect: () => (order = nextInventoryOrder(order, 'newest'))
								}
							]}
						>
							{#snippet trigger()}{@render menuDots()}{/snippet}
						</ActionMenu>
					{:else if column === 'set' || column === 'finish' || column === 'condition'}
						<Select
							iconOnly
							class="inventory-filter"
							label={`Filter by ${column}`}
							value={column === 'set'
								? selectedSet
								: column === 'finish'
									? selectedFinish
									: selectedCondition}
							options={column === 'set'
								? setOptions
								: column === 'finish'
									? finishOptions
									: conditionOptions}
							onchange={(value) => setColumnFilter(column, value)}
						/>
					{/if}
				</div>
			{/each}
			<span></span>
		</div>
		{#if listCards.length === 0}<div class="empty-state">
				<p>No cards match these filters.</p>
				<button class="btn btn-secondary" onclick={clearFilters}>Clear filters</button>
			</div>
		{:else}
			<ul class="inventory-list" aria-label="Inventory entries">
				{#each listCards as card (card.id)}
					<li class="inventory-row" class:saving={pendingId === card.id}>
						<button
							class="card-identity"
							onclick={() => (inspectedId = card.id)}
							aria-label={`Inspect ${card.name}, ${card.setCode.toUpperCase()}, ${card.finish}, ${card.condition}`}
							aria-describedby={isNewInventoryEntry(card.createdAt, asOf)
								? `inventory-new-${card.id}`
								: undefined}
							><img src={card.imageUri} alt="" width="40" height="56" loading="lazy" /><span
								><span class="card-name"
									><strong>{card.name}</strong>{#if isNewInventoryEntry(card.createdAt, asOf)}<span
											class="new-entry"
											id={`inventory-new-${card.id}`}
											title={`Added ${addedDate.format(card.createdAt)} UTC. New for 7 days.`}
											>New<span class="sr-only"
												>, entry added {addedDate.format(card.createdAt)} UTC, marked new for 7 days</span
											></span
										>{/if}</span
								><span class="mobile-metadata"
									>{@render metadata('set', card.setCode)}{@render metadata(
										'finish',
										card.finish
									)}{@render metadata('condition', card.condition)}</span
								>{#if card.notes}<span class="entry-notes">{card.notes}</span>{/if}</span
							></button
						>
						<span class="row-metadata">{@render metadata('set', card.setCode)}</span><span
							class="row-metadata">{@render metadata('finish', card.finish)}</span
						><span class="row-metadata">{@render metadata('condition', card.condition)}</span>
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
						<ActionMenu
							label={`Actions for ${card.name}, ${card.setCode.toUpperCase()}, ${card.finish}, ${card.condition}`}
							iconOnly
							class="entry-menu"
							bind:triggerRef={
								() => rowMenuRefs[card.id] ?? null, (ref) => (rowMenuRefs[card.id] = ref)
							}
							onCloseAutoFocus={(event) => focusRemoval(event, card.id)}
							items={[
								{
									label: 'Remove',
									destructive: true,
									disabled: pendingId !== null,
									onSelect: () => (removeId = card.id)
								}
							]}
						>
							{#snippet trigger()}{@render menuDots()}{/snippet}
						</ActionMenu>
						{#if removeId === card.id}<div class="remove-confirmation">
								<p>
									Remove {card.quantity > 1 ? 'all ' : ''}{card.quantity}
									{card.quantity === 1 ? 'copy' : 'copies'} of {card.name}?
								</p>
								<div>
									<button
										bind:this={removeCancel}
										class="btn btn-ghost btn-sm"
										disabled={pendingId !== null}
										onclick={() => cancelRemoval(card.id)}>Cancel</button
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

{#snippet menuDots()}
	<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"
		><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle
			cx="12"
			cy="19"
			r="1.7"
		/></svg
	>
{/snippet}

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

{#snippet metadata(kind: 'set' | 'finish' | 'condition', value: string)}
	<span
		class="metadata-frame"
		data-finish={kind === 'finish' ? value : undefined}
		data-condition={kind === 'condition' ? value : undefined}
		style={kind === 'set' ? `--metadata-color: ${inventorySetColor(value)}` : undefined}
		>{kind === 'set'
			? value.toUpperCase()
			: kind === 'finish'
				? value === 'foil'
					? 'Foil'
					: 'Nonfoil'
				: value}</span
	>
{/snippet}

<style>
	.inventory-result-count {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.inventory-result-count span {
		margin-inline: 0.4rem;
	}
	.active-filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.active-filter {
		color: var(--color-text-secondary);
		cursor: pointer;
		min-height: 44px;
	}
	.active-filter span {
		margin-left: 0.25rem;
	}
	.column-header {
		display: flex;
		align-items: center;
		gap: 0.125rem;
		min-width: 0;
	}
	.column-sort {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		min-height: 44px;
		cursor: pointer;
		color: var(--color-text-secondary);
		white-space: nowrap;
	}
	.column-header:first-child .column-sort {
		min-width: 8ch;
		justify-content: space-between;
	}
	.column-sort:hover,
	.column-sort[aria-pressed='true'] {
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.sort-direction {
		font-size: 0.875rem;
		width: 1ch;
		flex-shrink: 0;
		visibility: hidden;
	}
	.has-direction .sort-direction {
		visibility: visible;
	}
	.column-header :global(.inventory-filter),
	.column-header :global(.card-order-menu) {
		width: 44px;
		height: 44px;
		min-height: 44px;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		flex-shrink: 0;
	}
	.card-name {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.375rem;
	}
	.new-entry {
		border: 1px solid color-mix(in srgb, var(--color-info) 65%, transparent);
		border-radius: 0.25rem;
		padding: 0.125rem 0.375rem;
		color: var(--color-text-secondary);
		font-size: 0.625rem;
		line-height: 1.3;
	}
	.metadata-frame {
		--metadata-color: var(--color-text-muted);
		display: inline-flex;
		align-items: center;
		border: 1px solid color-mix(in srgb, var(--metadata-color) 65%, transparent);
		border-radius: 0.25rem;
		padding: 0.125rem 0.375rem;
		color: var(--color-text-secondary);
		font-size: 0.75rem;
		line-height: 1.3;
		white-space: nowrap;
	}
	[data-finish='foil'],
	[data-condition='HP'] {
		--metadata-color: var(--color-violet);
	}
	[data-condition='NM'] {
		--metadata-color: var(--color-success);
	}
	[data-condition='LP'] {
		--metadata-color: var(--color-info);
	}
	[data-condition='MP'] {
		--metadata-color: var(--color-warning);
	}
	[data-condition='DMG'] {
		--metadata-color: var(--color-error);
	}
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
		grid-template-columns: minmax(180px, 1fr) auto;
		align-items: center;
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
		min-height: 3rem;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		column-gap: 0.75rem;
		row-gap: 0.25rem;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		padding: 0.125rem 0;
	}
	.clear-filters {
		min-height: 44px;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
		color: var(--color-text-secondary);
	}
	.save-status {
		min-height: 1.25rem;
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
		grid-template-columns: minmax(0, 1fr) 115px 140px 160px 115px 44px;
		gap: 1rem;
		align-items: center;
	}
	.inventory-columns {
		padding: 0 0.625rem 0.625rem;
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}
	.inventory-columns > .column-header:nth-child(5) {
		justify-content: center;
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
	:global(.entry-menu) {
		width: 44px;
		height: 44px;
		color: var(--color-text-muted);
		justify-self: center;
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
	@media (max-width: 1100px) {
		.inventory-row {
			grid-template-columns: minmax(0, 1fr) 108px 55px;
			gap: 0.5rem;
		}
		.inventory-columns {
			display: flex;
			flex-wrap: wrap;
			gap: 0.25rem 0.5rem;
			padding-inline: 0;
		}
		.inventory-columns > span {
			display: none;
		}
		.row-metadata {
			display: none;
		}
		.mobile-metadata {
			display: flex;
			flex-wrap: wrap;
			gap: 0.25rem;
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
			grid-template-columns: minmax(0, 1fr);
			gap: 0.5rem;
		}
		.inventory-result-count {
			justify-self: end;
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
		:global(.entry-menu) {
			grid-column: 2;
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
	}
	@media (max-width: 360px) {
		.inventory-heading {
			flex-wrap: wrap;
		}
		.inventory-actions {
			flex-direction: row;
		}
	}
</style>
