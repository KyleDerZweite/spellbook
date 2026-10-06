<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { tick } from 'svelte';
	import type { PageProps } from './$types';
	import CardDetail from '#lib/components/cards/CardDetail.svelte';
	import Select from '#lib/components/ui/select/Select.svelte';
	import ActionMenu from '#lib/components/ui/menu/ActionMenu.svelte';
	import FilterPopover from '#lib/components/ui/popover/FilterPopover.svelte';
	import ConfirmationDialog from '#lib/components/ui/dialog/ConfirmationDialog.svelte';
	import ScrollArea from '#lib/components/ui/scroll-area/ScrollArea.svelte';
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
	let selectedSets = $state<string[]>([]);
	let filterOpen = $state(false);
	let setQuery = $state('');
	let filterField = $state<'set' | 'finish' | 'condition'>('set');
	let filterReturnTarget = $state<HTMLElement | null>(null);
	let setSearchInput = $state<HTMLInputElement | null>(null);
	let finishTrigger = $state<HTMLButtonElement | null>(null);
	let conditionTrigger = $state<HTMLButtonElement | null>(null);
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
	let removalReturnTarget = $state<HTMLElement | null>(null);
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
		{ value: 'all', label: 'All' },
		...inventoryConditions.map((value) => ({ value, label: value }))
	];
	const finishOptions = [
		{ value: 'all', label: 'All' },
		{ value: 'nonfoil', label: 'Nonfoil' },
		{ value: 'foil', label: 'Foil' }
	];
	let inventoryCards = $derived(data.cards);
	let inspected = $derived(inventoryCards.find((card) => card.id === inspectedId));
	let removing = $derived(inventoryCards.find((card) => card.id === removeId));
	const normalizeSet = (code: string) => code.toLowerCase();
	const setName = (code: string) => data.setNames[normalizeSet(code)] ?? code.toUpperCase();
	let setOptions = $derived(
		[...new Set([...inventoryCards.map((card) => normalizeSet(card.setCode)), ...selectedSets])]
			.map((value) => ({ value, label: setName(value) }))
			.sort((a, b) => a.label.localeCompare(b.label) || a.value.localeCompare(b.value))
	);
	let visibleSets = $derived(
		setOptions.filter((option) =>
			`${option.label} ${option.value}`.toLowerCase().includes(setQuery.trim().toLowerCase())
		)
	);
	let singleSet = $derived(selectedSets.length === 1 ? selectedSets[0] : null);
	let hasFilters = $derived(
		query.trim() !== '' ||
			selectedSets.length > 0 ||
			selectedFinish !== 'all' ||
			selectedCondition !== 'all'
	);
	let hasColumnFilters = $derived(
		selectedSets.length > 0 || selectedFinish !== 'all' || selectedCondition !== 'all'
	);
	let listCards = $derived(
		orderInventory(
			filterInventory(inventoryCards, {
				query,
				sets: selectedSets,
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
	function openRemoval(id: string) {
		mutationError = '';
		removalReturnTarget = rowMenuRefs[id] ?? searchInput;
		removeId = id;
	}
	function cancelRemoval() {
		removeId = null;
		mutationError = '';
	}
	function returnFromRemoval(event: Event) {
		event.preventDefault();
		if (removalReturnTarget?.isConnected) removalReturnTarget.focus({ preventScroll: true });
	}
	function editFilter(field: 'set' | 'finish' | 'condition', event: MouseEvent) {
		filterField = field;
		filterReturnTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
		filterOpen = true;
	}
	function focusFilter(event: Event) {
		event.preventDefault();
		void tick().then(() => {
			if (!filterOpen) return;
			const target =
				filterField === 'finish'
					? finishTrigger
					: filterField === 'condition'
						? conditionTrigger
						: setSearchInput;
			target?.focus();
		});
	}
	function closeFilter(event: Event) {
		if (filterOpen) {
			event.preventDefault();
			return;
		}
		if (filterReturnTarget?.isConnected) {
			event.preventDefault();
			filterReturnTarget.focus({ preventScroll: true });
		}
		filterReturnTarget = null;
		filterField = 'set';
		setQuery = '';
	}
	function toggleSet(code: string) {
		selectedSets = selectedSets.includes(code)
			? selectedSets.filter((value) => value !== code)
			: [...selectedSets, code];
	}
	function columnDirection(column: InventoryColumn) {
		return order.base === column
			? order.direction
			: order.variant?.column === column
				? order.variant.direction
				: null;
	}
	let matchingQuantity = $derived(listCards.reduce((total, card) => total + card.quantity, 0));
	let ownedInSet = $derived(
		new Set(
			inventoryCards
				.filter((card) => normalizeSet(card.setCode) === singleSet)
				.map((card) => card.canonicalCardId)
		).size
	);

	$effect(() => {
		const setCode = singleSet;
		const game = activeGameState.current;
		setCatalogTotal = null;
		setProgressLoading = setCode !== null;
		if (setCode === null) return;
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
		selectedSets = [];
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
					if (removing) {
						await tick();
						removalReturnTarget = rowMenuRefs[neighbor?.id ?? ''] ?? searchInput ?? emptyAction;
						removeId = null;
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
	{#if !removeId && (mutationError || form?.message)}<p class="mutation-error" role="alert">
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
			<FilterPopover
				bind:open={filterOpen}
				active={hasColumnFilters}
				onOpenAutoFocus={focusFilter}
				onCloseAutoFocus={closeFilter}
			>
				<div class="filter-fields">
					<div class="set-filter-heading">
						<label class="label" for="inventory-set-search">Sets</label><button
							type="button"
							class="filter-reset"
							disabled={selectedSets.length === 0}
							onclick={() => (selectedSets = [])}>Clear</button
						>
					</div>
					<input
						bind:this={setSearchInput}
						bind:value={setQuery}
						id="inventory-set-search"
						type="search"
						class="input"
						placeholder="Find a set by name or code"
					/>
					<ScrollArea class="set-options" viewportLabel="Choose sets">
						{#each visibleSets as option (option.value)}
							<label class="set-option"
								><input
									type="checkbox"
									checked={selectedSets.includes(option.value)}
									onchange={() => toggleSet(option.value)}
								/><span>{option.label}</span><small>{option.value.toUpperCase()}</small></label
							>
						{:else}<p class="no-sets">No sets match this search.</p>{/each}
					</ScrollArea>
					<div class="variant-filters">
						<div>
							<label class="label" for="inventory-finish-filter">Finish</label><Select
								id="inventory-finish-filter"
								label="Filter by finish"
								bind:triggerRef={finishTrigger}
								bind:value={selectedFinish}
								options={finishOptions}
							/>
						</div>
						<div>
							<label class="label" for="inventory-condition-filter">Condition</label><Select
								id="inventory-condition-filter"
								label="Filter by condition"
								bind:triggerRef={conditionTrigger}
								bind:value={selectedCondition}
								options={conditionOptions}
							/>
						</div>
					</div>
				</div>
			</FilterPopover>
			<ActionMenu
				label="Sort inventory"
				class="inventory-sort-menu btn-ghost"
				items={[
					{
						label: 'Card name: A to Z',
						onSelect: () => (order = nextInventoryOrder(order, 'name', 'asc'))
					},
					{
						label: 'Card name: Z to A',
						onSelect: () => (order = nextInventoryOrder(order, 'name', 'desc'))
					},
					{
						label: 'Set: A to Z',
						onSelect: () => (order = nextInventoryOrder(order, 'set', 'asc'))
					},
					{
						label: 'Set: Z to A',
						onSelect: () => (order = nextInventoryOrder(order, 'set', 'desc'))
					},
					{ label: 'Newest first', onSelect: () => (order = nextInventoryOrder(order, 'newest')) },
					{
						label:
							columnDirection('finish') === 'asc' ? 'Finish: foil first' : 'Finish: nonfoil first',
						onSelect: () => (order = nextInventoryOrder(order, 'finish'))
					},
					{
						label:
							columnDirection('condition') === 'asc'
								? 'Condition: worst first'
								: 'Condition: best first',
						onSelect: () => (order = nextInventoryOrder(order, 'condition'))
					},
					{
						label:
							columnDirection('quantity') === 'asc'
								? 'Quantity: most first'
								: 'Quantity: fewest first',
						onSelect: () => (order = nextInventoryOrder(order, 'quantity'))
					}
				]}
			>
				{#snippet trigger()}<svg
						aria-hidden="true"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.6"
						stroke-linecap="round"><path d="M8 4v16m-4-4 4 4 4-4M16 20V4m-4 4 4-4 4 4" /></svg
					>Sort{/snippet}
			</ActionMenu>
			<p class="inventory-result-count">
				{listCards.length}
				{listCards.length === 1 ? 'entry' : 'entries'} <span>·</span>
				{matchingQuantity} cards
			</p>
		</div>
		{#if hasFilters}
			<div class="active-filters">
				{#each selectedSets as code (code)}
					<div class="filter-chip">
						<button
							type="button"
							class="filter-chip-edit"
							onclick={(event) => editFilter('set', event)}
							aria-label={`Edit set filter ${setName(code)}`}>Set: {setName(code)}</button
						><button
							type="button"
							class="filter-chip-remove"
							aria-label={`Clear set filter ${setName(code)}`}
							onclick={() => (selectedSets = selectedSets.filter((value) => value !== code))}
							>×</button
						>
					</div>
				{/each}
				{#if selectedFinish !== 'all'}<div class="filter-chip">
						<button
							type="button"
							class="filter-chip-edit"
							onclick={(event) => editFilter('finish', event)}
							>Finish: {selectedFinish === 'foil' ? 'Foil' : 'Nonfoil'}</button
						><button
							type="button"
							class="filter-chip-remove"
							aria-label={`Clear finish filter ${selectedFinish}`}
							onclick={() => (selectedFinish = 'all')}>×</button
						>
					</div>{/if}
				{#if selectedCondition !== 'all'}<div class="filter-chip">
						<button
							type="button"
							class="filter-chip-edit"
							onclick={(event) => editFilter('condition', event)}
							>Condition: {selectedCondition}</button
						><button
							type="button"
							class="filter-chip-remove"
							aria-label={`Clear condition filter ${selectedCondition}`}
							onclick={() => (selectedCondition = 'all')}>×</button
						>
					</div>{/if}
				<button type="button" class="clear-filters" onclick={clearFilters}>Clear filters</button>
			</div>
		{/if}
		<span class="sr-only" role="status">{status}</span>
		{#if singleSet}
			<div class="set-progress">
				<p>
					{setName(singleSet)} <span>·</span>
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
						aria-label={`${setName(singleSet)} set completion`}
					></progress>{/if}
			</div>
		{/if}
		<p class="sr-only" id="inventory-order" role="status">{sortDescription}</p>
		<div
			class="inventory-columns"
			role="group"
			aria-label="Inventory column sorting"
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
							onCloseAutoFocus={(event) => {
								if (removeId === card.id) event.preventDefault();
							}}
							items={[
								{
									label: 'Remove',
									destructive: true,
									disabled: pendingId !== null,
									onSelect: () => openRemoval(card.id)
								}
							]}
						>
							{#snippet trigger()}{@render menuDots()}{/snippet}
						</ActionMenu>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

<ConfirmationDialog
	open={removeId !== null}
	title="Remove this entry?"
	description={removing
		? `This removes ${removing.quantity > 1 ? 'all ' : ''}${removing.quantity} ${removing.quantity === 1 ? 'copy' : 'copies'} of ${removing.name} (${removing.setCode.toUpperCase()}, ${removing.finish === 'foil' ? 'Foil' : 'Nonfoil'}, ${removing.condition}) from your inventory. It cannot be undone.`
		: ''}
	pending={pendingId !== null}
	error={mutationError}
	onCancel={cancelRemoval}
	onCloseAutoFocus={returnFromRemoval}
>
	<form method="POST" action="?/remove" use:enhance={saveEntry}>
		<input type="hidden" name="entryId" value={removeId ?? ''} />
		<button class="btn btn-destructive" type="submit" disabled={pendingId !== null || !removing}
			>{pendingId === removeId ? 'Removing…' : 'Remove'}</button
		>
	</form>
</ConfirmationDialog>

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
		gap: 0.375rem;
		margin-top: 0.375rem;
		font-size: 0.75rem;
	}
	.filter-chip {
		display: inline-flex;
		align-items: center;
		min-width: 0;
		max-width: 100%;
		border-radius: 0.375rem;
		background: var(--color-muted);
		color: var(--color-text-secondary);
	}
	.filter-chip-edit {
		min-height: 36px;
		min-width: 0;
		padding-left: 0.625rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		cursor: pointer;
		text-align: left;
	}
	.filter-chip-edit:hover {
		color: var(--color-text-primary);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.filter-chip-remove {
		width: 36px;
		min-height: 36px;
		flex-shrink: 0;
		cursor: pointer;
		border-radius: 0.375rem;
		color: var(--color-text-muted);
		font-size: 1rem;
	}
	.filter-chip-remove:hover {
		background: var(--color-surface);
		color: var(--color-text-primary);
	}
	.filter-fields {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.set-filter-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.filter-fields .label {
		margin: 0;
		font-size: 0.75rem;
	}
	.filter-reset {
		min-height: 32px;
		color: var(--color-text-secondary);
		cursor: pointer;
		font-size: 0.75rem;
	}
	.filter-reset:disabled {
		opacity: 0.4;
		cursor: default;
	}
	:global(.set-options) {
		height: 16rem;
		margin-bottom: 0.5rem;
	}
	.set-option {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		min-height: 44px;
		padding: 0.375rem 0.5rem;
		border-radius: 0.375rem;
		cursor: pointer;
		font-size: 0.75rem;
		line-height: 1.5;
	}
	.set-option:hover,
	.set-option:focus-within {
		background: var(--color-muted);
	}
	.set-option input {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
		accent-color: var(--color-primary);
	}
	.set-option > span {
		min-width: 0;
		flex: 1;
		overflow-wrap: anywhere;
	}
	.set-option small {
		color: var(--color-text-muted);
		flex-shrink: 0;
		font-size: 0.6875rem;
	}
	.no-sets {
		padding: 1rem 0.5rem;
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}
	.variant-filters {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.625rem;
	}
	.variant-filters > div {
		min-width: 0;
	}
	.variant-filters .label {
		display: block;
		margin-bottom: 0.375rem;
	}
	:global(.inventory-sort-menu) {
		padding-inline: 0.625rem;
		font-size: 0.75rem;
		border: 0;
		background: transparent;
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
	.card-name {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.375rem;
	}
	.new-entry {
		border: 1px solid transparent;
		background: color-mix(in srgb, var(--color-info) 15%, transparent);
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
		border: 1px solid color-mix(in srgb, var(--metadata-color) 12%, transparent);
		background: color-mix(in srgb, var(--metadata-color) 16%, transparent);
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
		grid-template-columns: minmax(180px, 1fr) auto auto auto;
		margin-bottom: 0.25rem;
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
	.clear-filters {
		min-height: 44px;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
		color: var(--color-text-secondary);
	}
	.set-progress {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-block: 0.75rem;
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
		padding: 0 0.625rem;
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
			grid-template-columns: auto auto minmax(0, 1fr);
			gap: 0.25rem;
		}
		.inventory-search {
			grid-column: 1 / -1;
		}
		.filter-chip-edit,
		.filter-chip-remove {
			min-height: 44px;
		}
		.filter-chip-remove {
			width: 44px;
		}
		.inventory-result-count {
			justify-self: end;
			white-space: normal;
			text-align: right;
			font-size: 0.6875rem;
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
