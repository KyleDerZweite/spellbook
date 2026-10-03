<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { PageProps } from './$types';
	import DeckDialog from '$lib/components/decks/DeckDialog.svelte';
	import DeckSelect from '$lib/components/decks/DeckSelect.svelte';
	import ManaCost from '$lib/components/cards/ManaCost.svelte';
	import { allocateDeckAvailability } from '$lib/mtg/deck-availability';
	import type { previewMtgImport } from '$lib/server/mtg/import';

	const formats = [
		'Commander',
		'Standard',
		'Modern',
		'Pioneer',
		'Legacy',
		'Vintage',
		'Pauper',
		'Brawl',
		'Casual'
	].map((value) => ({ value, label: value }));
	const roles = [
		{ value: 'main', label: 'Main deck' },
		{ value: 'sideboard', label: 'Sideboard' },
		{ value: 'commander', label: 'Commander' },
		{ value: 'companion', label: 'Companion' }
	];
	let { data, form }: PageProps = $props();
	let createOpen = $state(false);
	let editOpen = $state(false);
	let importOpen = $state(false);
	let deleteOpen = $state(false);
	let busy = $state(false);
	let importText = $state('');
	let importRequestId = $state('');
	let addRole = $state('main');
	let addQuantity = $state(1);
	let listQuery = $state('');
	let ownedOnly = $state(false);
	let sortBy = $state('name');
	const selectedDeck = $derived(data.decks.find((deck) => deck.id === data.selectedDeckId));
	const deckCards = $derived(data.deckCards.filter((card) => card.deckId === data.selectedDeckId));
	const availability = $derived(allocateDeckAvailability(deckCards, data.inventoryCards));
	const total = $derived(deckCards.reduce((sum, card) => sum + card.quantity, 0));
	const missing = $derived(
		Object.values(availability).reduce((sum, entry) => sum + entry.missing, 0)
	);
	const ownedByCanonical = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const card of data.inventoryCards)
			counts.set(card.canonicalCardId, (counts.get(card.canonicalCardId) ?? 0) + card.quantity);
		return counts;
	});
	const visibleCards = $derived(
		deckCards
			.filter((card) => card.name.toLowerCase().includes(listQuery.toLowerCase()))
			.toSorted((a, b) =>
				sortBy === 'quantity'
					? b.quantity - a.quantity || a.name.localeCompare(b.name)
					: a.name.localeCompare(b.name)
			)
	);
	const catalogCards = $derived(
		data.catalogCards.filter(
			(card) => !ownedOnly || (ownedByCanonical.get(card.oracle_id) ?? 0) > 0
		)
	);
	const preview = $derived(
		form?.preview as Awaited<ReturnType<typeof previewMtgImport>> | undefined
	);
	const importableCount = $derived(
		preview?.resolved
			.filter(({ line }) => line.role !== 'maybeboard')
			.reduce((sum, { line }) => sum + line.quantity, 0) ?? 0
	);

	function action(name: string): string {
		const params = new URLSearchParams();
		if (data.selectedDeckId) params.set('deck', data.selectedDeckId);
		if (data.query) params.set('q', data.query);
		if (data.oracleId) params.set('printing', data.oracleId);
		return `?/${name}&${params}`;
	}
	const save: SubmitFunction = ({ formData, action: target, cancel }) => {
		if (busy) {
			cancel();
			return;
		}
		busy = true;
		if (target.searchParams.has('/commitImport')) {
			if (!importRequestId) importRequestId = crypto.randomUUID();
			formData.set('requestId', importRequestId);
		} else formData.set('requestId', crypto.randomUUID());
		return async ({ result, update }) => {
			try {
				await update({ reset: false });
				if (result.type === 'success' || result.type === 'redirect') {
					createOpen = false;
					editOpen = false;
					deleteOpen = false;
					if (target.searchParams.has('/commitImport')) {
						importOpen = false;
						importText = '';
						importRequestId = '';
					}
				}
			} finally {
				busy = false;
			}
		};
	};
</script>

<svelte:head
	><title>{selectedDeck ? `${selectedDeck.name} | Deck builder` : 'Deck builder'} | Spellbook</title
	></svelte:head
>

<div class="builder">
	<header class="builder-heading">
		<div>
			<h1>{selectedDeck?.name ?? 'Deck builder'}</h1>
		</div>
		<div class="deck-picker">
			{#if data.decks.length}<DeckSelect
					label="Select deck"
					value={data.selectedDeckId ?? ''}
					options={data.decks.map((deck) => ({ value: deck.id, label: deck.name }))}
					onchange={(value) => goto(`/decks?deck=${encodeURIComponent(value)}`)}
				/>{/if}
			<DeckDialog
				title="Create a deck"
				description="Name the deck and choose its format."
				trigger="New deck"
				bind:open={createOpen}
			>
				<form method="POST" action={action('createDeck')} use:enhance={save} class="form-stack">
					<label class="label" for="new-name">Deck name</label><input
						id="new-name"
						name="name"
						class="input"
						required
						maxlength="200"
						placeholder="My next deck"
					/>
					<label class="label" for="new-format">Format</label><DeckSelect
						id="new-format"
						name="format"
						label="Deck format"
						value="Commander"
						options={formats}
					/>
					<label class="label" for="new-description">Description</label><textarea
						id="new-description"
						name="description"
						class="input"
						rows="3"
						maxlength="4000"></textarea>
					{#if form?.message}<p role="status" class="muted">{form.message}</p>{/if}
					<button class="btn btn-primary" disabled={busy}>Create deck</button>
				</form>
			</DeckDialog>
		</div>
	</header>
	{#if form?.message}<p class="notice" role="status">{form.message}</p>{/if}
	{#if selectedDeck}
		<section class="panel deck-overview" aria-label="Deck overview">
			<div class="deck-title">
				<span class="format-badge">{selectedDeck.format}</span>

				{#if selectedDeck.description}<p class="muted">{selectedDeck.description}</p>{/if}
			</div>
			<div class="deck-actions">
				<DeckDialog
					title="Deck details"
					description="Update the name, format, or notes for this deck."
					trigger="Edit details"
					bind:open={editOpen}
				>
					{#key selectedDeck.id}<form
							method="POST"
							action={action('updateDeck')}
							use:enhance={save}
							class="form-stack"
						>
							<input type="hidden" name="deckId" value={selectedDeck.id} />
							<label class="label" for="edit-name">Deck name</label><input
								id="edit-name"
								class="input"
								name="name"
								value={selectedDeck.name}
								required
								maxlength="200"
							/>
							<label class="label" for="edit-format">Format</label><DeckSelect
								id="edit-format"
								name="format"
								label="Deck format"
								value={selectedDeck.format}
								options={formats}
							/>
							<label class="label" for="edit-description">Description</label><textarea
								id="edit-description"
								class="input"
								name="description"
								rows="3"
								maxlength="4000">{selectedDeck.description}</textarea
							>
							{#if form?.message}<p role="status" class="muted">{form.message}</p>{/if}<button
								class="btn btn-primary"
								disabled={busy}>Save details</button
							>
						</form>{/key}
				</DeckDialog>
				<DeckDialog
					title="Import decklist"
					description="Paste an Arena decklist. Preview the matches before adding cards to this deck."
					trigger="Import"
					bind:open={importOpen}
				>
					<form
						method="POST"
						action={action('previewImport')}
						use:enhance={save}
						class="form-stack"
					>
						<input type="hidden" name="deckId" value={selectedDeck.id} /><label
							class="label"
							for="import-text">Decklist</label
						><textarea
							id="import-text"
							name="text"
							class="input decklist-input"
							rows="9"
							maxlength="100000"
							required
							bind:value={importText}
							placeholder={"Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Sol Ring\n10 Forest"}
						></textarea><button class="btn btn-secondary" disabled={busy}
							>{busy ? 'Working...' : 'Preview import'}</button
						>
					</form>
					{#if form?.message}<p role="status" class="notice">{form.message}</p>{/if}
					{#if preview && form?.importText === importText.trim()}
						<div class="import-preview" aria-live="polite">
							<p>{importableCount} cards matched for import.</p>
							{#if preview.unresolved.length || preview.ambiguous.length}<p class="warning">
									These lines will be skipped. Edit the list and preview again to resolve them.
								</p>{/if}
							<ul>
								{#each preview.unresolved as item}<li>
										<code>{item.line.raw}</code>: {item.reason}
									</li>{/each}{#each preview.ambiguous as item}<li>
										<code>{item.line.raw}</code>: Multiple matches. Add a set code and collector
										number.
									</li>{/each}
							</ul>
							{#if preview.resolved.some(({ line }) => line.role === 'maybeboard')}<p
									class="warning"
								>
									Maybeboard cards will be skipped.
								</p>{/if}
							<details>
								<summary>Matched cards</summary>
								<ul>
									{#each preview.resolved.filter(({ line }) => line.role !== 'maybeboard') as item}<li
										>
											{item.line.quantity}
											{item.card.name} · {item.line.role}
										</li>{/each}
								</ul>
							</details>
							{#if preview.warnings.length}<details>
									<summary>Format warnings for imported cards</summary>
									<ul>
										{#each preview.warnings as warning}<li>{warning.message}</li>{/each}
									</ul>
								</details>{/if}
							<form method="POST" action={action('commitImport')} use:enhance={save}>
								<input type="hidden" name="deckId" value={selectedDeck.id} /><input
									type="hidden"
									name="text"
									value={importText}
								/><button class="btn btn-primary" disabled={busy || !importableCount}
									>Add {importableCount} matched cards</button
								>
							</form>
						</div>
					{/if}
				</DeckDialog>
				<a class="btn btn-secondary" href={`/decks/${selectedDeck.id}/export`} download
					>Export Arena</a
				>
				<DeckDialog
					title="Delete deck"
					description={`Delete ${selectedDeck.name} and its card list? Your inventory will stay unchanged.`}
					trigger="Delete"
					bind:open={deleteOpen}
					destructive
					><form method="POST" action={action('deleteDeck')} use:enhance={save}>
						<input type="hidden" name="deckId" value={selectedDeck.id} /><button
							class="btn btn-secondary destructive"
							disabled={busy}>Delete this deck</button
						>
					</form></DeckDialog
				>
			</div>
			<dl class="deck-stats">
				<div>
					<dt>Total cards</dt>
					<dd>{total}</dd>
				</div>
				<div>
					<dt>Owned for this deck</dt>
					<dd>{total - missing}</dd>
				</div>
				<div>
					<dt>Missing copies</dt>
					<dd class:warning={missing > 0}>{missing}</dd>
				</div>
				<div>
					<dt>Unique cards</dt>
					<dd>{new Set(deckCards.map((card) => card.canonicalCardId)).size}</dd>
				</div>
			</dl>
		</section>
		<div class="workspace">
			<section class="panel deck-list" aria-labelledby="deck-list-heading" aria-busy={busy}>
				<h2 id="deck-list-heading" class="sr-only">Deck list</h2>
				<div class="list-controls">
					<input
						class="input"
						type="search"
						aria-label="Filter deck cards"
						placeholder="Find in this deck"
						bind:value={listQuery}
					/><DeckSelect
						label="Sort deck cards"
						bind:value={sortBy}
						options={[
							{ value: 'name', label: 'Name' },
							{ value: 'quantity', label: 'Quantity' }
						]}
					/>
				</div>
				{#if deckCards.length === 0}<div class="empty-state">
						<p>Search the catalog to add a card, or import an existing decklist.</p>
					</div>{/if}
				{#each roles as role}
					{@const cards = visibleCards.filter((card) => card.role === role.value)}
					{#if cards.length}
						<div class="role-heading">
							<span>{role.label}</span>
							<span
								>{deckCards
									.filter((card) => card.role === role.value)
									.reduce((sum, card) => sum + card.quantity, 0)}</span
							>
						</div>
						{#each cards as card (card.id + ':' + card.quantity + ':' + card.role)}
							{@const owned = availability[card.id]}
							<div class="deck-row">
								{#if card.imageUri}<img
										class="card-thumb"
										src={card.imageUri}
										alt={card.name}
										loading="lazy"
									/>{:else}<div class="card-thumb card-placeholder" aria-hidden="true"></div>{/if}
								<div class="card-name">
									<a
										href={`/decks?deck=${selectedDeck.id}&printing=${encodeURIComponent(card.canonicalCardId)}`}
										>{card.name}</a
									>
									<p class="muted">
										{card.setCode.toUpperCase()} · {owned?.exact ?? 0} exact · {owned?.alternate ??
											0} other printings{#if owned?.missing}<span class="warning">
												· {owned.missing} missing</span
											>{/if}
									</p>
								</div>
								<form
									method="POST"
									action={action('updateCard')}
									use:enhance={save}
									class="row-edit"
								>
									<input type="hidden" name="entryId" value={card.id} /><input
										class="input quantity"
										name="quantity"
										type="number"
										min="1"
										max="10000"
										step="1"
										required
										value={card.quantity}
										aria-label={`Quantity of ${card.name}`}
									/><select
										class="input role-select"
										name="role"
										value={card.role}
										aria-label={`Section for ${card.name}`}
										>{#each roles as option}<option value={option.value}>{option.label}</option
											>{/each}</select
									><button
										class="btn btn-secondary"
										disabled={busy}
										aria-label={`Save ${card.name}`}>Save</button
									>
								</form>
								<form method="POST" action={action('removeCard')} use:enhance={save}>
									<input type="hidden" name="entryId" value={card.id} /><button
										class="remove-card"
										disabled={busy}
										aria-label={`Remove ${card.name}`}
										title={`Remove ${card.name}`}>×</button
									>
								</form>
							</div>
						{/each}
					{/if}
				{/each}
				{#if listQuery && !visibleCards.length && deckCards.length}<p class="empty-state">
						No deck cards match this filter.
					</p>{/if}
				<details class="legality" open={data.warnings.length > 0 || !!data.legalityError}>
					<summary>Format checks {data.warnings.length ? `(${data.warnings.length})` : ''}</summary>
					<p class="muted">Advisory checks only. Review current format rules before an event.</p>
					{#if data.legalityError}<p class="warning">
							{data.legalityError}
						</p>{:else if data.warnings.length}<ul>
							{#each data.warnings as warning}<li>{warning.message}</li>{/each}
						</ul>{:else}<p>No warnings from the available checks.</p>{/if}
				</details>
			</section>
			<aside class="panel catalog" aria-labelledby="catalog-heading">
				<div class="panel-heading">
					<div>
						<h2 id="catalog-heading" class="sr-only">Find cards</h2>
					</div>
					<a href="/mtg/search" class="text-link">Full search</a>
				</div>
				<form method="GET" action="/decks" class="search-form">
					<input type="hidden" name="deck" value={selectedDeck.id} /><input
						class="input"
						name="q"
						type="search"
						value={data.query}
						placeholder="Card name or rules text"
						aria-label="Search the card catalog"
						maxlength="200"
					/><button class="btn btn-primary">Search</button>
				</form>
				<div class="catalog-options">
					<label class="checkbox-label"
						><input type="checkbox" bind:checked={ownedOnly} /> Owned results only</label
					><span class="muted">{catalogCards.length} shown</span>
				</div>
				<div class="add-options">
					<div>
						<label class="label" for="add-role">Add to</label><DeckSelect
							id="add-role"
							label="Add to section"
							bind:value={addRole}
							options={roles}
						/>
					</div>
					<div>
						<label class="label" for="add-quantity">Quantity</label><input
							id="add-quantity"
							class="input quantity"
							type="number"
							min="1"
							max="10000"
							step="1"
							bind:value={addQuantity}
						/>
					</div>
				</div>
				{#if data.oracleId}<div class="printing-heading">
						<p>Choose a printing</p>
						<a
							class="text-link"
							href={`/decks?deck=${selectedDeck.id}&q=${encodeURIComponent(data.query)}`}
							>Back to search</a
						>
					</div>{/if}
				{#if data.catalogError}<p class="notice" role="status">
						{data.catalogError}
					</p>{:else if !data.query && !data.oracleId}<div class="empty-state">
						<p>Search the full Magic catalog. You can add cards before you own them.</p>
					</div>{:else if !catalogCards.length}<p class="empty-state">
						No cards match. Try another search or turn off the owned filter.
					</p>{/if}
				<div class="catalog-results">
					{#each catalogCards as card (card.id)}<div class="catalog-row">
							{#if card.image_uri_small || card.image_uri}<img
									src={card.image_uri_small || card.image_uri}
									alt={card.name}
									class="catalog-image"
									loading="lazy"
								/>{/if}
							<div class="catalog-card-info">
								<p class="catalog-card-name">{card.name}</p>
								<ManaCost cost={card.mana_cost} />
								<p class="muted">{card.type_line}</p>
								<p class="muted">
									{card.set_code.toUpperCase()} #{card.collector_number} · {ownedByCanonical.get(
										card.oracle_id
									) ?? 0} owned
								</p>
								<div class="catalog-card-actions">
									<form method="POST" action={action('addCard')} use:enhance={save}>
										<input type="hidden" name="deckId" value={selectedDeck.id} /><input
											type="hidden"
											name="catalogCardId"
											value={card.id}
										/><input type="hidden" name="role" value={addRole} /><input
											type="hidden"
											name="quantity"
											value={addQuantity}
										/><button
											class="btn btn-primary"
											disabled={busy || !Number.isInteger(addQuantity) || addQuantity < 1}
											aria-label={`Add ${card.name}`}>Add</button
										>
									</form>
									{#if !data.oracleId}<a
											href={`/decks?deck=${selectedDeck.id}&q=${encodeURIComponent(data.query)}&printing=${encodeURIComponent(card.oracle_id)}`}
											class="text-link">Printings</a
										>{/if}
								</div>
							</div>
						</div>{/each}
				</div>
			</aside>
		</div>
	{:else}<section class="panel empty-state welcome">
			<p>No decks yet.</p>
			<button class="btn btn-primary" onclick={() => (createOpen = true)}
				>Create your first deck</button
			>
		</section>{/if}
</div>

<style>
	.builder {
		max-width: 1600px;
		margin: 0 auto;
		padding: 1.5rem;
	}
	.builder-heading,
	.panel-heading,
	.deck-actions,
	.catalog-options,
	.printing-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.builder-heading {
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
	}
	h1 {
		font-size: 1.4rem;
		font-weight: 650;
		margin: 0.2rem 0 0;
	}
	h2 {
		font-size: 1.1rem;
		font-weight: 650;
		margin: 0;
	}
	.deck-picker {
		display: flex;
		gap: 0.65rem;
		align-items: center;
		min-width: min(100%, 22rem);
	}
	.deck-picker :global([data-select-trigger]) {
		flex: 1;
		max-width: 20rem;
	}
	.deck-overview {
		padding: 1.25rem;
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 1.1rem;
		margin-bottom: 1.25rem;
	}
	.deck-title p {
		max-width: 50rem;
		white-space: pre-wrap;
	}
	.format-badge {
		border: 1px solid var(--color-mist);
		border-radius: 1rem;
		padding: 0.2rem 0.6rem;
		color: var(--color-gold-bright);
		font-size: 0.7rem;
	}
	.deck-actions {
		align-self: start;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.5rem;
	}
	.deck-stats {
		display: flex;
		flex-wrap: wrap;
		gap: 2rem;
		grid-column: 1/-1;
		margin: 0;
		padding-top: 1rem;
		border-top: 1px solid var(--color-mist);
	}
	.deck-stats dt {
		font-size: 0.73rem;
		color: var(--color-text-secondary);
		margin-bottom: 0.3rem;
	}
	.deck-stats dd {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(320px, 1fr);
		gap: 1.25rem;
		align-items: start;
	}
	.deck-list,
	.catalog {
		min-width: 0;
		overflow: hidden;
	}
	.panel-heading {
		padding: 1.15rem;
	}
	.muted {
		color: var(--color-text-secondary);
		font-size: 0.8rem;
		line-height: 1.6;
	}
	.warning {
		color: var(--color-warning);
	}
	.notice {
		border: 1px solid var(--color-mist);
		background: var(--color-stone);
		padding: 0.8rem 1rem;
		border-radius: 0.5rem;
		font-size: 0.85rem;
	}
	.list-controls {
		display: grid;
		grid-template-columns: 1fr 8rem;
		gap: 0.5rem;
		padding: 1rem;
	}
	.role-heading {
		display: flex;
		justify-content: space-between;
		padding: 0.65rem 1rem;
		background: var(--color-stone);
		border-block: 1px solid var(--color-mist);
	}
	.role-heading span {
		font-size: 0.75rem;
	}
	.deck-row {
		display: grid;
		grid-template-columns: 36px minmax(100px, 1fr) auto 24px;
		gap: 0.65rem;
		align-items: center;
		padding: 0.7rem 1rem;
		border-bottom: 1px solid color-mix(in srgb, var(--color-mist) 65%, transparent);
	}
	.card-thumb {
		width: 36px;
		height: 50px;
		border-radius: 3px;
		object-fit: cover;
	}
	.card-placeholder {
		background: var(--color-stone);
	}
	.card-name {
		min-width: 0;
	}
	.card-name a {
		color: var(--color-text-primary);
		font-size: 0.82rem;
		text-decoration: none;
		font-weight: 550;
	}
	.card-name a:hover {
		color: var(--color-gold-bright);
	}
	.card-name p {
		margin: 0.15rem 0 0;
		font-size: 0.67rem;
	}
	.row-edit {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.quantity {
		width: 4.25rem;
	}
	.role-select {
		width: 7.4rem;
	}
	.row-edit :global(.input),
	.row-edit :global(.btn) {
		font-size: 0.7rem;
		min-height: 2rem;
		padding: 0.35rem 0.45rem;
	}
	.remove-card {
		border: 0;
		color: var(--color-text-secondary);
		background: transparent;
		font-size: 1.2rem;
		cursor: pointer;
		padding: 0.2rem;
	}
	.remove-card:hover {
		color: var(--color-error);
	}
	.search-form {
		display: flex;
		gap: 0.5rem;
		padding: 0 1rem;
	}
	.search-form input {
		min-width: 0;
		flex: 1;
	}
	.catalog-options {
		padding: 0.8rem 1rem;
		font-size: 0.73rem;
	}
	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		color: var(--color-text-secondary);
	}
	.checkbox-label input {
		accent-color: var(--color-gold);
	}
	.add-options {
		display: flex;
		gap: 0.7rem;
		padding: 1rem;
	}
	.add-options > div:first-child {
		flex: 1;
	}
	.add-options :global(.label) {
		display: block;
		margin-bottom: 0.3rem;
	}
	.catalog-row {
		display: flex;
		gap: 0.9rem;
		padding: 1rem;
		border-top: 1px solid var(--color-mist);
	}
	.catalog-image {
		width: 80px;
		height: 112px;
		object-fit: cover;
		border-radius: 5px;
		align-self: start;
	}
	.catalog-card-info {
		flex: 1;
		min-width: 0;
	}
	.catalog-card-info .catalog-card-name {
		font-size: 0.85rem;
		font-weight: 600;
	}
	.catalog-card-info p {
		margin: 0.25rem 0;
		font-size: 0.7rem;
	}
	.catalog-card-actions {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 0.6rem;
	}
	.catalog-card-actions :global(.btn) {
		min-height: 1.9rem;
		padding: 0.3rem 0.9rem;
		font-size: 0.75rem;
	}
	.text-link {
		color: var(--color-gold-bright);
		text-decoration: none;
		font-size: 0.75rem;
	}
	.text-link:hover {
		text-decoration: underline;
	}
	.printing-heading {
		padding: 0.5rem 1rem;
		background: var(--color-stone);
		font-size: 0.8rem;
	}
	.legality {
		padding: 1rem;
		font-size: 0.8rem;
		border-top: 1px solid var(--color-mist);
	}
	summary {
		cursor: pointer;
		font-weight: 550;
	}
	.legality ul,
	.import-preview ul {
		padding-left: 1.2rem;
		line-height: 1.8;
	}
	.empty-state {
		padding: 3rem 1.5rem;
		text-align: center;
		color: var(--color-text-secondary);
		font-size: 0.85rem;
		line-height: 1.7;
	}
	.welcome {
		padding: 3rem 1.5rem;
	}
	.welcome p {
		max-width: 30rem;
		margin: 1rem auto;
	}
	.form-stack {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}
	.decklist-input {
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}
	.import-preview {
		margin-top: 1rem;
		font-size: 0.8rem;
	}
	.import-preview details {
		margin: 1rem 0;
	}
	:global(.destructive) {
		color: var(--color-error);
	}
	@media (max-width: 1200px) {
		.deck-row {
			grid-template-columns: 36px 1fr 24px;
		}
		.row-edit {
			grid-column: 2;
			grid-row: 2;
		}
		.deck-row > form:last-child {
			grid-column: 3;
			grid-row: 1;
		}
		.deck-overview {
			grid-template-columns: 1fr;
		}
		.deck-actions {
			justify-content: flex-start;
		}
	}
	@media (max-width: 850px) {
		.workspace {
			grid-template-columns: 1fr;
		}
		.catalog {
			order: -1;
		}
		.catalog-results {
			max-height: 30rem;
			overflow-y: auto;
		}
		.builder {
			padding: 1rem;
		}
		.deck-stats {
			gap: 1.25rem;
		}
		.deck-picker {
			width: 100%;
		}
	}
</style>
