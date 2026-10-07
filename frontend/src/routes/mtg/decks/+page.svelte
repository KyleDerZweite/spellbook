<script lang="ts">
	import CardDetail from '#lib/components/cards/CardDetail.svelte';
	import { storedCardDocument } from '#lib/mtg/stored-card.ts';
	import type { CardDocument } from '#lib/search/types.ts';
	import { Dialog } from 'bits-ui';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { SubmitFunction } from '$app/forms';
	import type { PageProps } from './$types';
	import DeckDialog from '#lib/components/decks/DeckDialog.svelte';
	import Select from '#lib/components/ui/select/Select.svelte';
	import ActionMenu from '#lib/components/ui/menu/ActionMenu.svelte';
	import ManaCost from '#lib/components/cards/ManaCost.svelte';
	import type { ImportPreview } from '#lib/types/import-preview.ts';

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
		{ value: 'commander', label: 'Commander' },
		{ value: 'main', label: 'Main deck' },
		{ value: 'sideboard', label: 'Sideboard' },
		{ value: 'companion', label: 'Companion' }
	];
	let { data, form }: PageProps = $props();
	let createOpen = $state(false);
	let editOpen = $state(false);
	let descriptionDraft = $state('');
	let descriptionBaseRevision = $state('');
	let editingDeckId = $state('');
	let nameBase = $state('');
	let formatBase = $state('');
	let descriptionBase = $state('');
	$effect(() => {
		if (editOpen && selectedDeck && editingDeckId !== selectedDeck.id) {
			editingDeckId = selectedDeck.id;
			descriptionDraft = detailsDraft?.description ?? selectedDeck.description;
			descriptionBase = detailsDraft?.descriptionBase ?? selectedDeck.description;
			nameBase = detailsDraft?.nameBase ?? selectedDeck.name;
			formatBase = detailsDraft?.formatBase ?? selectedDeck.format;
			descriptionBaseRevision =
				detailsDraft?.descriptionRevision ?? selectedDeck.descriptionRevision;
		}
		if (!editOpen) editingDeckId = '';
	});
	let importOpen = $state(false);
	let deleteOpen = $state(false);
	let actionsTrigger = $state<HTMLButtonElement | null>(null);
	let busy = $state(false);
	let importText = $state('');
	let importRequestId = $state('');
	const pendingRequests = new Map<string, string>();
	let addRole = $state('main');
	let addQuantity = $state(1);
	let listQuery = $state('');
	let ownedOnly = $state(false);
	let sortBy = $state('name');
	let view = $state<'list' | 'stacks'>('list');
	let groupBy = $state('type');
	let missingOnly = $state(false);
	let searchOpen = $state(false);
	let inspected = $state<CardDocument | null>(null);
	let inspectedEntryId = $state<string | null>(null);
	let inspectorQuantity = $state(1);
	let inspectorRole = $state('main');
	let query = $state('');
	let results = $state<CardDocument[]>([]);
	let searchOwned = $state<Record<string, number>>({});
	let inspectorOwned = $state<typeof data.ownedPrintings>([]);
	let ownershipLoading = $state(false);
	let ownershipError = $state('');
	let ownershipController: AbortController | undefined;
	let searching = $state(false);
	let searchError = $state('');
	let searchController: AbortController | undefined;
	let saveStatus = $state('');
	let saveError = $state('');
	let removed = $state<(typeof data.deckCards)[number] | null>(null);
	const inspectedEntry = $derived(data.deckCards.find((card) => card.id === inspectedEntryId));
	let initializedSearch = $state(false);
	$effect(() => {
		if (!initializedSearch) {
			query = data.query;
			results = data.catalogCards;
			initializedSearch = true;
		}
	});
	async function inspect(card: CardDocument, entry?: (typeof data.deckCards)[number]) {
		inspected = card;
		inspectedEntryId = entry?.id ?? null;
		inspectorQuantity = entry?.quantity ?? addQuantity;
		inspectorRole = entry?.role ?? addRole;
		ownershipController?.abort();
		const controller = new AbortController();
		ownershipController = controller;
		inspectorOwned = [];
		ownershipLoading = true;
		ownershipError = '';
		try {
			const response = await fetch(
				`/api/mobile/v1/mtg/decks/ownership?canonicalCardId=${encodeURIComponent(card.oracle_id)}`,
				{ signal: controller.signal }
			);
			if (!response.ok) throw new Error('Owned quantities are unavailable.');
			const owned = await response.json();
			if (!controller.signal.aborted) inspectorOwned = owned;
		} catch (cause) {
			if (!controller.signal.aborted)
				ownershipError =
					cause instanceof Error ? cause.message : 'Owned quantities are unavailable.';
		} finally {
			if (!controller.signal.aborted) ownershipLoading = false;
		}
	}
	async function findCards(event: SubmitEvent) {
		event.preventDefault();
		searchController?.abort();
		const controller = new AbortController();
		searchController = controller;
		searching = true;
		searchError = '';
		try {
			const response = await fetch(
				`/api/mobile/v1/mtg/decks/search?q=${encodeURIComponent(query)}`,
				{ signal: controller.signal }
			);
			if (!response.ok) throw new Error('Search failed.');
			const result = await response.json();
			if (!controller.signal.aborted) searchOwned = result.ownedByCanonical;
			if (!controller.signal.aborted) results = result.hits;
		} catch (cause) {
			if (!controller.signal.aborted)
				searchError = cause instanceof Error ? cause.message : 'Search failed.';
		} finally {
			if (!controller.signal.aborted) searching = false;
		}
	}

	const selectedDeck = $derived(data.decks.find((deck) => deck.id === data.selectedDeckId));
	const detailsDraft = $derived(
		form?.detailsDraft?.deckId === selectedDeck?.id ? form?.detailsDraft : undefined
	);
	const deckCards = $derived(data.deckCards.filter((card) => card.deckId === data.selectedDeckId));
	const availability = $derived(data.availability);
	const total = $derived(deckCards.reduce((sum, card) => sum + card.quantity, 0));
	const missing = $derived(
		Object.values(availability).reduce((sum, entry) => sum + entry.missing, 0)
	);
	const ownedByCanonical = $derived(
		new Map(Object.entries({ ...data.ownedByCanonical, ...searchOwned }))
	);
	const visibleCards = $derived(
		deckCards
			.filter(
				(card) =>
					card.name.toLowerCase().includes(listQuery.toLowerCase()) &&
					(!missingOnly || availability[card.id]?.missing > 0)
			)
			.toSorted((a, b) =>
				sortBy === 'quantity'
					? b.quantity - a.quantity || a.name.localeCompare(b.name)
					: a.name.localeCompare(b.name)
			)
	);
	const groups = $derived.by(() => {
		const grouped = new Map<string, typeof visibleCards>();
		for (const card of visibleCards) {
			const types = data.deckDocuments[card.catalogCardId]?.card_types ?? [];
			const type = [
				'Land',
				'Creature',
				'Planeswalker',
				'Battle',
				'Artifact',
				'Enchantment',
				'Instant',
				'Sorcery'
			].find((value) => types.includes(value));
			const label =
				card.role === 'main' && groupBy === 'type' && type
					? type
					: (roles.find((role) => role.value === card.role)?.label ?? card.role);
			grouped.set(label, [...(grouped.get(label) ?? []), card]);
		}
		return [...grouped].sort(([a], [b]) =>
			a === 'Commander' ? -1 : b === 'Commander' ? 1 : a.localeCompare(b)
		);
	});

	const catalogCards = $derived(
		results.filter((card) => !ownedOnly || (ownedByCanonical.get(card.oracle_id) ?? 0) > 0)
	);
	const preview = $derived(form?.preview as ImportPreview | undefined);
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
	function reportUnconfirmedSave() {
		saveError = 'Could not confirm the save. Your changes are still here. Try again.';
		saveStatus = 'Could not confirm the save. Try again.';
	}

	const save: SubmitFunction = ({ formData, action: target, cancel }) => {
		if (busy) {
			cancel();
			return;
		}
		busy = true;
		saveError = '';
		saveStatus = 'Saving…';
		const removedCard = target.searchParams.has('/removeCard')
			? deckCards.find((card) => card.id === formData.get('entryId'))
			: undefined;
		if (target.searchParams.has('/commitImport')) {
			if (!importRequestId) importRequestId = crypto.randomUUID();
			formData.set('requestId', importRequestId);
		} else {
			const payload =
				target.pathname +
				target.search +
				JSON.stringify([...formData.entries()].filter(([name]) => name !== 'requestId'));
			let requestId = pendingRequests.get(payload);
			if (!requestId) {
				requestId = crypto.randomUUID();
				pendingRequests.set(payload, requestId);
			}
			formData.set('requestId', requestId);
		}
		const savedRequestId = String(formData.get('requestId') || '');

		return async ({ result, update }) => {
			try {
				if (result.type === 'error') {
					reportUnconfirmedSave();
					return;
				}
				await update({ reset: false });
				if (result.type === 'success' || result.type === 'redirect') {
					saveStatus = 'Saved';
					for (const [payload, id] of pendingRequests)
						if (id === savedRequestId) pendingRequests.delete(payload);
					if (removedCard) {
						removed = removedCard;
						inspected = null;
					}
					if (target.searchParams.has('/changePrinting')) inspected = null;
					if (target.searchParams.has('/addCard') && formData.get('undo')) removed = null;
					createOpen = false;
					editOpen = false;
					deleteOpen = false;
					if (target.searchParams.has('/commitImport')) {
						importOpen = false;
						importText = '';
						importRequestId = '';
					}
				}
			} catch {
				reportUnconfirmedSave();
			} finally {
				if (result.type === 'failure') saveStatus = 'Could not save. Try again.';
				busy = false;
			}
		};
	};
</script>

{#snippet retryError()}
	{#if saveError}<p class="notice" role="alert">{saveError}</p>{/if}
{/snippet}

<svelte:head
	><title>{selectedDeck ? `${selectedDeck.name} | Decks` : 'Decks'} | Spellbook</title></svelte:head
>

<div class="builder workspace-container">
	<header class="builder-heading">
		<div>
			<div class="page-title deck-page-title">
				{#if selectedDeck}<a href="/mtg/decks" class="btn btn-ghost btn-icon" aria-label="All decks"
						><svg
							aria-hidden="true"
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.7"><path d="m14 6-6 6 6 6" /></svg
						></a
					>{/if}
				<div>
					<h1>{selectedDeck?.name ?? 'Decks'}</h1>
					{#if selectedDeck}<p class="deck-format">{selectedDeck.format}</p>{/if}
				</div>
			</div>
		</div>
		<div class="deck-picker">
			{#if selectedDeck}
				<ActionMenu
					label="Deck actions"
					iconOnly
					bind:triggerRef={actionsTrigger}
					items={[
						{ label: 'New deck', onSelect: () => (createOpen = true) },
						{ label: 'Edit details', onSelect: () => (editOpen = true) },
						{ label: 'Import decklist', onSelect: () => (importOpen = true) },
						{ label: 'Export Arena', href: `/mtg/decks/${selectedDeck.id}/export`, download: true },
						{ label: 'Delete deck', destructive: true, onSelect: () => (deleteOpen = true) }
					]}
					onCloseAutoFocus={(event) => {
						if (createOpen || editOpen || importOpen || deleteOpen) event.preventDefault();
					}}
				>
					{#snippet trigger()}<svg
							aria-hidden="true"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="currentColor"
							><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle
								cx="19"
								cy="12"
								r="1.8"
							/></svg
						>{/snippet}
				</ActionMenu>
			{/if}
			<DeckDialog
				title="Create a deck"
				description="Name the deck and choose its format."
				trigger={selectedDeck ? undefined : 'New deck'}
				returnFocus={selectedDeck ? actionsTrigger : undefined}
				bind:open={createOpen}
			>
				<form method="POST" action={action('createDeck')} use:enhance={save} class="form-stack">
					<input type="hidden" name="requestId" value={data.requestId} />
					<label class="label" for="new-name">Deck name</label><input
						id="new-name"
						name="name"
						class="input"
						required
						maxlength="200"
						placeholder="My next deck"
					/>
					<label class="label" for="new-format">Format</label><Select
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
					{@render retryError()}
					{#if !saveError && form?.message}<p role="status" class="muted">{form.message}</p>{/if}
					<button class="btn btn-primary" disabled={busy}>Create deck</button>
				</form>
			</DeckDialog>
		</div>
	</header>
	{@render retryError()}
	{#if !saveError && form?.message && !form?.success}<p class="notice" role="alert">
			{form.message}
		</p>{/if}
	{#if selectedDeck && detailsDraft && !editOpen}
		<section data-deck-draft-recovery aria-labelledby="draft-recovery-title" class="form-stack">
			<h2 id="draft-recovery-title">Recover your unsaved deck details</h2>
			<p>Your draft is below. Review it before saving again.</p>
			{#if form?.conflict}<p>Latest saved Description: {form.conflict.description}</p>{/if}
			<form method="POST" action={action('updateDeck')} use:enhance={save} class="form-stack">
				<input type="hidden" name="deckId" value={detailsDraft.deckId} />
				<input type="hidden" name="descriptionRevision" value={detailsDraft.descriptionRevision} />
				{#if detailsDraft.nameBase !== undefined}<input
						type="hidden"
						name="nameBase"
						value={detailsDraft.nameBase}
					/>{/if}
				{#if detailsDraft.formatBase !== undefined}<input
						type="hidden"
						name="formatBase"
						value={detailsDraft.formatBase}
					/>{/if}
				{#if detailsDraft.descriptionBase !== undefined}<input
						type="hidden"
						name="descriptionBase"
						value={detailsDraft.descriptionBase}
					/>{/if}
				<label for="recovery-name">Deck name</label><input
					id="recovery-name"
					class="input"
					name="name"
					value={detailsDraft.name}
					required
					maxlength="200"
				/>
				<label for="recovery-format">Format</label><select
					id="recovery-format"
					class="input"
					name="format"
				>
					{#if !formats.some((format) => format.value === detailsDraft.format)}<option
							selected
							value={detailsDraft.format}>{detailsDraft.format}</option
						>{/if}
					{#each formats as format}<option
							value={format.value}
							selected={format.value === detailsDraft.format}>{format.label}</option
						>{/each}
				</select>
				<label for="recovery-description">Description</label><textarea
					id="recovery-description"
					class="input"
					name="description"
					rows="4"
					maxlength="4000">{detailsDraft.description}</textarea
				>
				{@render retryError()}
				<button class="btn btn-primary" disabled={busy}>Save draft</button>
				{#if form?.conflict}<button
						type="submit"
						class="btn btn-secondary"
						name="rebaseDescription"
						value={form.conflict.descriptionRevision}
						disabled={busy}>Use latest revision and save my draft</button
					>{/if}
			</form>
		</section>
	{/if}
	{#if selectedDeck}
		<section class="deck-overview" aria-label="Deck overview">
			{#if selectedDeck.description}<p class="deck-description muted">
					{selectedDeck.description}
				</p>{/if}
			<div class="deck-actions">
				<DeckDialog
					title="Deck details"
					description="Update the name, format, or notes for this deck."
					returnFocus={actionsTrigger}
					bind:open={editOpen}
				>
					{#key selectedDeck.id}<form
							method="POST"
							action={action('updateDeck')}
							use:enhance={save}
							class="form-stack"
						>
							<input type="hidden" name="requestId" value={data.requestId} />
							<input type="hidden" name="deckId" value={selectedDeck.id} />
							<input type="hidden" name="descriptionRevision" value={descriptionBaseRevision} />
							<input type="hidden" name="nameBase" value={nameBase} /><input
								type="hidden"
								name="formatBase"
								value={formatBase}
							/><input type="hidden" name="descriptionBase" value={descriptionBase} /><label
								class="label"
								for="edit-name">Deck name</label
							><input
								id="edit-name"
								class="input"
								name="name"
								value={detailsDraft?.name ?? selectedDeck.name}
								required
								maxlength="200"
							/>
							<label class="label" for="edit-format">Format</label><Select
								id="edit-format"
								name="format"
								label="Deck format"
								value={detailsDraft?.format ?? selectedDeck.format}
								options={formats}
							/>
							<label class="label" for="edit-description">Description</label><textarea
								id="edit-description"
								class="input"
								name="description"
								rows="3"
								maxlength="4000"
								bind:value={descriptionDraft}></textarea>
							{#if form?.conflict}<div role="alert">
									<p>{form.conflict.description}</p>
									<button
										type="button"
										class="btn btn-secondary"
										onclick={() => {
											descriptionBaseRevision = form!.conflict!.descriptionRevision;
										}}>Use latest revision and keep my draft</button
									>
								</div>{/if}
							{@render retryError()}
							{#if !saveError && form?.message}<p role="status" class="muted">
									{form.message}
								</p>{/if}<button class="btn btn-primary" disabled={busy}>Save details</button>
						</form>{/key}
				</DeckDialog>
				<DeckDialog
					title="Import decklist"
					description="Paste an Arena decklist. Preview the matches before adding cards to this deck."
					returnFocus={actionsTrigger}
					bind:open={importOpen}
				>
					<form
						method="POST"
						action={action('previewImport')}
						use:enhance={save}
						class="form-stack"
					>
						<input type="hidden" name="requestId" value={data.requestId} />
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
					{@render retryError()}
					{#if !saveError && form?.message}<p role="status" class="notice">{form.message}</p>{/if}
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
								<input type="hidden" name="requestId" value={data.requestId} />
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
				<DeckDialog
					title="Delete deck"
					description={`Delete ${selectedDeck.name} and its card list? Your inventory will stay unchanged.`}
					returnFocus={actionsTrigger}
					bind:open={deleteOpen}
					destructive
					><form method="POST" action={action('deleteDeck')} use:enhance={save}>
						<input type="hidden" name="requestId" value={data.requestId} />
						<input
							type="hidden"
							name="deckId"
							value={selectedDeck.id}
						/>{@render retryError()}<button class="btn btn-secondary destructive" disabled={busy}
							>Delete this deck</button
						>
					</form></DeckDialog
				>
			</div>
		</section>
		<div class="deck-summary">
			<span>{total} cards</span>
			<button aria-pressed={missingOnly} onclick={() => (missingOnly = !missingOnly)}
				>{missing} missing</button
			>
			<a href="#format-checks"
				>{data.legalityError
					? 'Format checks unavailable'
					: `${data.warnings.length} format warnings`}</a
			>
			<span class="save-status" role="status">{saveStatus}</span>
			<button class="mobile-search btn btn-secondary" onclick={() => (searchOpen = true)}
				>Find cards</button
			>
		</div>
		{#if removed && removed.deckId === selectedDeck.id}
			<form method="POST" action={action('addCard')} use:enhance={save} class="undo-row">
				<input type="hidden" name="requestId" value={data.requestId} />
				<span>Removed {removed.name}.</span>
				<input type="hidden" name="deckId" value={selectedDeck.id} />
				<input type="hidden" name="catalogCardId" value={removed.catalogCardId} />
				<input type="hidden" name="quantity" value={removed.quantity} />
				<input type="hidden" name="role" value={removed.role} /><input
					type="hidden"
					name="undo"
					value="1"
				/>
				<button class="btn btn-ghost" disabled={busy}>Undo</button>
			</form>
		{/if}
		<div class="workspace">
			<section class="panel deck-list" aria-label="Deck cards" aria-busy={busy}>
				<div class="list-controls">
					<div class="view-controls" aria-label="Deck view">
						<button aria-pressed={view === 'list'} onclick={() => (view = 'list')}>List</button>
						<button aria-pressed={view === 'stacks'} onclick={() => (view = 'stacks')}
							>Stacks</button
						>
					</div>
					<input
						class="input"
						type="search"
						aria-label="Filter deck cards"
						placeholder="Find in this deck"
						bind:value={listQuery}
					/><Select
						label="Sort deck cards"
						bind:value={sortBy}
						options={[
							{ value: 'name', label: 'Name' },
							{ value: 'quantity', label: 'Quantity' }
						]}
					/><Select
						label="Group deck cards"
						bind:value={groupBy}
						options={[
							{ value: 'type', label: 'By type' },
							{ value: 'role', label: 'By section' }
						]}
					/>
				</div>
				{#if deckCards.length === 0}<div class="empty-state">
						<p>Search the catalog to add a card, or import an existing decklist.</p>
					</div>{/if}
				<div class:stacks={view === 'stacks'}>
					{#each groups as [group, cards]}
						{#if cards.length}
							<div class="card-group">
								<div
									class="role-heading"
									class:commander-role={cards.every((card) => card.role === 'commander')}
								>
									<span>{group}</span><span
										>{cards.reduce((sum, card) => sum + card.quantity, 0)}</span
									>
								</div>
								{#each cards as card (card.id)}
									{@const owned = availability[card.id]}
									<div
										class="deck-row"
										class:stack-card={view === 'stacks'}
										class:commander-entry={card.role === 'commander'}
									>
										{#if view === 'stacks'}
											<button
												class="stack-art"
												onclick={() =>
													inspect(
														data.deckDocuments[card.catalogCardId] ?? storedCardDocument(card),
														card
													)}
												aria-label={`Inspect ${card.name}`}
											>
												{#if card.imageUri}<img
														src={card.imageUri}
														alt={card.name}
														loading="lazy"
													/>{:else}<span>{card.name}</span>{/if}
											</button>
										{/if}
										<div class="quantity-controls">
											{#each [-1, 1] as delta}
												{#if delta === 1}<span>{card.quantity}</span>{/if}
												<form method="POST" action={action('updateCard')} use:enhance={save}>
													<input type="hidden" name="requestId" value={data.requestId} />
													<input type="hidden" name="delta" value={delta} />
													<input type="hidden" name="entryId" value={card.id} /><input
														type="hidden"
														name="quantity"
														value={card.quantity + delta}
													/><input type="hidden" name="role" value={card.role} />
													<button
														disabled={busy ||
															(delta === -1 && card.quantity === 1) ||
															(delta === 1 && card.quantity >= 10000)}
														aria-label={`${delta === 1 ? 'Increase' : 'Decrease'} ${card.name} quantity`}
														>{delta === 1 ? '+' : '−'}</button
													>
												</form>
											{/each}
										</div>
										<button
											class="card-name"
											onclick={() =>
												inspect(
													data.deckDocuments[card.catalogCardId] ?? storedCardDocument(card),
													card
												)}
											>{card.name}{#if data.deckDocuments[card.catalogCardId]?.mana_cost}<span
													class="row-mana"
													><ManaCost
														cost={data.deckDocuments[card.catalogCardId].mana_cost}
													/></span
												>{/if}</button
										>
										<button
											class="ownership"
											class:warning={owned?.missing > 0}
											onclick={() =>
												inspect(
													data.deckDocuments[card.catalogCardId] ?? storedCardDocument(card),
													card
												)}
											aria-label={`Inspect ownership of ${card.name}`}
										>
											{owned?.missing
												? `${owned.missing} missing`
												: owned?.alternate
													? 'Alternate'
													: 'Owned'}
										</button>
									</div>
								{/each}
							</div>
						{/if}
					{/each}
				</div>
				{#if !visibleCards.length && deckCards.length}<p class="empty-state">
						No deck cards match this filter.
					</p>{/if}
				<details
					id="format-checks"
					class="legality"
					open={data.warnings.length > 0 || !!data.legalityError}
				>
					<summary>Format checks {data.warnings.length ? `(${data.warnings.length})` : ''}</summary>
					<p class="muted">Advisory checks only. Review current format rules before an event.</p>
					{#if data.legalityError}<p class="warning">
							{data.legalityError}
						</p>{:else if data.warnings.length}<ul>
							{#each data.warnings as warning}<li>{warning.message}</li>{/each}
						</ul>{:else}<p>No warnings from the available checks.</p>{/if}
				</details>
			</section>
			<aside class="catalog desktop-search" aria-label="Find cards">{@render discovery()}</aside>
		</div>
	{:else if data.decks.length}
		<div class="deck-library">
			{#each data.decks as deck}
				{@const cover = data.deckCovers[deck.id]}
				<a class="library-card" href={`/mtg/decks?deck=${deck.id}`}>
					{#if cover?.imageUri}<img src={cover.imageUri} alt="" />{:else}<div
							class="library-placeholder"
							aria-hidden="true"
						>
							<svg
								aria-hidden="true"
								width="40"
								height="40"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.4"
								><rect x="7" y="3" width="13" height="18" rx="2" /><path
									d="m4 6-2 1 3 15 11-2"
								/></svg
							>
						</div>{/if}
					<strong>{deck.name}</strong><span
						>{deck.format} · {data.deckTotals[deck.id] || 0} cards</span
					>
					<small>Edited {new Date(deck.updatedAt).toLocaleDateString('en-GB')}</small>
				</a>
			{/each}
		</div>
	{:else}<section class="panel empty-state welcome">
			<p>No decks yet.</p>

			<button class="btn btn-primary" onclick={() => (createOpen = true)}
				>Create your first deck</button
			>
		</section>{/if}
</div>

{#snippet discovery()}
	<form class="search-form" onsubmit={findCards}>
		<input
			class="input"
			type="search"
			bind:value={query}
			aria-label="Search cards"
			placeholder="Search cards"
			minlength="2"
			maxlength="200"
			required
		/>
		<button class="btn btn-primary" disabled={searching}>Search</button>
	</form>
	<div class="catalog-options">
		<label><input type="checkbox" bind:checked={ownedOnly} /> Owned only</label>
		<span>{searching ? 'Searching…' : `${catalogCards.length} shown`}</span>
	</div>
	<div class="add-options">
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
	</div>
	<div class="catalog-results" aria-busy={searching}>
		{#if searchError}<p class="notice" role="alert">{searchError}</p>{/if}
		{#each catalogCards as card (card.id)}
			<div class="catalog-row">
				<button
					class="catalog-art"
					onclick={() => inspect(card)}
					aria-label={`Inspect ${card.name}`}
					><img
						src={card.image_uri_small || card.image_uri}
						alt={card.name}
						loading="lazy"
					/></button
				>
				<div class="catalog-card-info">
					<button class="card-name" onclick={() => inspect(card)}>{card.name}</button>
					<ManaCost cost={card.mana_cost} />
					<p class="muted">
						{card.set_code.toUpperCase()} #{card.collector_number} · {ownedByCanonical.get(
							card.oracle_id
						) ?? 0} owned
					</p>
					<form method="POST" action={action('addCard')} use:enhance={save}>
						<input type="hidden" name="requestId" value={data.requestId} />
						<input type="hidden" name="deckId" value={selectedDeck?.id} /><input
							type="hidden"
							name="catalogCardId"
							value={card.id}
						/>
						<input type="hidden" name="role" value={addRole} /><input
							type="hidden"
							name="quantity"
							value={addQuantity}
						/>
						<button
							class="btn btn-secondary"
							disabled={busy ||
								!Number.isInteger(addQuantity) ||
								addQuantity < 1 ||
								addQuantity > 10000}
							aria-label={`Add ${card.name}`}>Add</button
						>
						<button type="button" class="btn btn-ghost" onclick={() => inspect(card)}
							>Printings</button
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
{/snippet}

<Dialog.Root bind:open={searchOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/60" />
		<Dialog.Content
			class="search-sheet fixed inset-0 z-40 overflow-y-auto bg-crypt p-4 text-text-primary"
		>
			<div class="sheet-heading">
				<Dialog.Title>Find cards</Dialog.Title><Dialog.Close class="btn btn-ghost"
					>Back to deck</Dialog.Close
				>
			</div>
			{@render discovery()}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

{#if inspected}
	<CardDetail card={inspected} onClose={() => (inspected = null)}>
		{#snippet actions(printing)}
			{@const owned = inspectorOwned.filter((card) => card.canonicalCardId === printing.oracle_id)}
			<div class="inspector-form">
				<p class="muted">
					{#if ownershipLoading}Loading owned quantities…{:else if ownershipError}{ownershipError}{:else}
						{owned
							.filter((card) => card.catalogCardId === printing.id)
							.reduce((sum, card) => sum + card.quantity, 0)} exact · {owned
							.filter((card) => card.catalogCardId !== printing.id)
							.reduce((sum, card) => sum + card.quantity, 0)} other printings owned{/if}
				</p>
				{#if inspectedEntry}<p class="muted">
						This deck: {availability[inspectedEntry.id]?.missing ?? 0} missing. Inventory is not reserved.
					</p>{/if}
				<form
					method="POST"
					action={action(inspectedEntry ? 'changePrinting' : 'addCard')}
					use:enhance={save}
					class="form-stack"
				>
					<input type="hidden" name="requestId" value={data.requestId} />
					<input type="hidden" name="deckId" value={selectedDeck?.id} /><input
						type="hidden"
						name="entryId"
						value={inspectedEntry?.id}
					/><input type="hidden" name="catalogCardId" value={printing.id} />
					<label class="label" for="inspect-quantity">Quantity</label><input
						class="input"
						id="inspect-quantity"
						name="quantity"
						type="number"
						min="1"
						max="10000"
						required
						bind:value={inspectorQuantity}
					/>
					<label class="label" for="inspect-role">Section</label><Select
						id="inspect-role"
						name="role"
						label="Section"
						bind:value={inspectorRole}
						options={roles}
					/>
					{@render retryError()}
					<p role="status" class="muted">
						{busy ? 'Saving…' : saveError ? '' : (form?.message ?? '')}
					</p>
					<button class="btn btn-primary" disabled={busy}
						>{inspectedEntry ? 'Save card' : 'Add to deck'}</button
					>
				</form>
				{#if inspectedEntry}
					<form method="POST" action={action('removeCard')} use:enhance={save}>
						<input type="hidden" name="requestId" value={data.requestId} />
						<input type="hidden" name="entryId" value={inspectedEntry.id} /><button
							class="btn btn-ghost destructive"
							disabled={busy}>Remove card</button
						>
					</form>
				{/if}
			</div>
		{/snippet}
	</CardDetail>
{/if}

<style>
	.builder-heading,
	.deck-picker,
	.deck-actions,
	.catalog-options,
	.sheet-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.builder-heading {
		margin-bottom: 0.75rem;
	}
	.deck-page-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.deck-page-title :global(.btn-icon) {
		margin-left: -0.5rem;
		flex-shrink: 0;
	}
	.deck-picker {
		justify-content: flex-end;
		flex-wrap: nowrap;
	}
	.deck-picker :global([data-select-trigger]) {
		max-width: 15rem;
	}
	.deck-format {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		margin-top: 0.125rem;
	}
	.deck-description {
		margin-bottom: 0.5rem;
	}
	.deck-overview {
		display: contents;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		padding: 0 0 1rem;
		background: transparent;
		border: 0;
		box-shadow: none;
	}
	.muted {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
	}
	.deck-actions {
		display: contents;
		gap: 0.4rem;
	}
	.deck-summary {
		position: sticky;
		top: var(--app-header-height);
		z-index: 10;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 1rem;
		min-height: 2.75rem;
		background: var(--color-background);
		font-size: 0.8rem;
	}
	.deck-summary button,
	.deck-summary a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--color-text-secondary);
	}
	.deck-summary button[aria-pressed='true'] {
		color: var(--color-text-primary);
		text-decoration: underline;
		text-underline-offset: 6px;
	}
	.save-status {
		margin-left: auto;
		color: var(--color-text-secondary);
	}
	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 360px;
		gap: 2rem;
		align-items: start;
	}
	.deck-list {
		min-width: 0;
		background: transparent;
		border: 0;
		box-shadow: none;
	}
	.catalog {
		position: sticky;
		top: calc(var(--app-header-height) + 2.75rem);
		min-width: 0;
		padding-top: 1rem;
	}
	.catalog-results {
		max-height: calc(100dvh - 310px);
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.view-controls {
		display: flex;
		gap: 1.5rem;
		padding: 0;
	}
	.view-controls button {
		padding: 0.4rem 0;
		color: var(--color-text-secondary);
		border-bottom: 2px solid transparent;
	}
	.view-controls button[aria-pressed='true'] {
		border-color: var(--color-text-primary);
		color: var(--color-text-primary);
	}
	.list-controls {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) 8rem 8rem;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	.list-controls input {
		flex: 1;
		min-width: 0;
	}
	.role-heading {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.625rem 0 0.375rem;
		color: var(--role-accent, var(--color-text-secondary));
		font-size: 0.75rem;
	}
	.deck-row {
		display: grid;
		grid-template-columns: 90px minmax(0, 1fr) auto;
		gap: 0.7rem;
		align-items: center;
		min-height: 44px;
	}
	.deck-row:hover {
		background: var(--color-stone);
	}
	.commander-entry {
		border-left: 2px solid var(--color-role-commander);
	}
	.row-mana {
		display: inline-flex;
		margin-left: 0.5rem;
		vertical-align: middle;
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
	.quantity-controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-variant-numeric: tabular-nums;
		font-size: 0.8rem;
	}
	.quantity-controls button {
		width: 30px;
		min-height: 40px;
		color: var(--color-text-secondary);
	}
	button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.ownership {
		font-size: 0.7rem;
		color: var(--color-text-secondary);
		padding: 0.4rem;
	}
	.warning {
		color: var(--color-warning);
	}
	.stacks {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 1.5rem;
	}
	.stack-card {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		padding: 0;
		background: var(--color-crypt);
		border-radius: 0.6rem;
		overflow: hidden;
		box-shadow: 0 -2px 8px #0003;
	}
	.stack-card + .stack-card {
		margin-top: -300px;
	}
	.stack-card:focus-within,
	.stack-card:hover {
		z-index: 1;
	}
	.stack-art {
		height: 280px;
		flex: 0 0 100%;
		width: 100%;
		display: block;
	}
	.stack-art img {
		width: 100%;
		height: 280px;
		object-fit: contain;
	}
	.stack-card .card-name {
		flex: 1;
		padding: 0.4rem;
	}
	.stack-card .quantity-controls {
		width: 80px;
	}
	.stack-card .ownership {
		width: 100%;
		text-align: right;
	}
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
	.catalog-card-info :global(.btn) {
		font-size: 0.75rem;
		min-height: 32px;
		padding: 0.3rem 0.65rem;
	}
	.catalog-card-info :global(.card-name) {
		margin-bottom: 0.4rem;
	}
	.legality {
		padding: 1.5rem 0;
		font-size: 0.8rem;
		scroll-margin-top: 5rem;
	}
	summary {
		cursor: pointer;
	}
	.legality ul,
	.import-preview ul {
		padding-left: 1.2rem;
		line-height: 1.8;
	}
	.empty-state {
		padding: 3rem 1rem;
		text-align: center;
		color: var(--color-text-secondary);
		font-size: 0.85rem;
	}
	.form-stack {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}
	.notice,
	.undo-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		font-size: 0.8rem;
		padding: 0.6rem 0;
	}
	.decklist-input {
		font-family: var(--font-mono);
	}
	.import-preview {
		margin-top: 1rem;
		font-size: 0.8rem;
	}
	.deck-library {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(0, 180px));
		gap: 1.5rem;
	}
	.library-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		color: var(--color-text-primary);
		text-decoration: none;
	}
	.library-card img,
	.library-placeholder {
		width: 100%;
		aspect-ratio: 488 / 680;
		object-fit: contain;
		border-radius: 0.6rem;
		background: var(--color-stone);
	}
	.library-placeholder {
		display: grid;
		place-items: center;
		font-size: 3rem;
		color: var(--color-text-muted);
	}
	.library-card span,
	.library-card small {
		color: var(--color-text-secondary);
		font-size: 0.8rem;
	}
	.library-card:hover strong {
		text-decoration: underline;
	}
	.inspector-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.deck-summary .mobile-search {
		display: none;
	}
	:global(.destructive) {
		color: var(--color-error);
	}
	@media (max-width: 1000px) {
		.workspace {
			grid-template-columns: 1fr;
		}
		.desktop-search {
			display: none;
		}
		.deck-summary .mobile-search {
			display: inline-flex;
			margin-left: auto;
		}
		.deck-summary {
			gap: 0.75rem;
		}
		.deck-picker {
			flex-shrink: 0;
		}
		.builder-heading {
			flex-wrap: nowrap;
			align-items: flex-start;
			gap: 0.5rem;
		}
		.builder-heading > div:first-child {
			min-width: 0;
		}
		.deck-picker :global(.btn) {
			font-size: 0.75rem;
			padding-inline: 0.625rem;
		}
		.deck-summary {
			font-size: 0.75rem;
			gap: 0.5rem;
		}
		.save-status:empty {
			display: none;
		}
		.deck-picker :global([data-select-trigger]) {
			max-width: none;
		}
		.catalog-results {
			max-height: none;
		}
	}
	@media (max-width: 640px) {
		.list-controls {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.list-controls :global(> button) {
			font-size: 0.75rem;
			padding-inline: 0.5rem;
			gap: 0.25rem;
		}
		.view-controls {
			gap: 0.75rem;
			align-items: center;
		}
		.view-controls button {
			min-height: 44px;
			font-size: 0.75rem;
		}
		.list-controls input {
			grid-column: 1/-1;
			order: -1;
		}
	}
	@media (max-width: 420px) {
		.deck-library {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.deck-row {
			grid-template-columns: 76px minmax(0, 1fr);
			gap: 0.4rem;
		}
		.ownership {
			grid-column: 2;
			text-align: left;
			padding: 0 0 0.5rem;
		}
		.stacks {
			grid-template-columns: 1fr;
		}
		.stack-art {
			height: 360px;
		}
		.stack-art img {
			height: 360px;
		}
		.stack-card + .stack-card {
			margin-top: -330px;
		}
	}
</style>
