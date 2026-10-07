<script lang="ts">
	import CardDetail from '#lib/components/cards/CardDetail.svelte';
	import { storedCardDocument } from '#lib/mtg/stored-card.ts';
	import type { CardDocument } from '#lib/search/types.ts';
	import { untrack, onDestroy } from 'svelte';
	import Button from '#lib/components/ui/button/Button.svelte';
	import WorkspaceHeader from '#lib/components/layout/WorkspaceHeader.svelte';
	import DeckEntries from '#lib/components/decks/DeckEntries.svelte';
	import DeckLibrary from '#lib/components/decks/DeckLibrary.svelte';
	import DeckDiscovery from '#lib/components/decks/DeckDiscovery.svelte';
	import ConfirmationDialog from '#lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { SubmitFunction } from '$app/forms';
	import type { PageProps } from './$types';
	import DeckDialog from '#lib/components/decks/DeckDialog.svelte';
	import Select from '#lib/components/ui/select/Select.svelte';
	import ActionMenu from '#lib/components/ui/menu/ActionMenu.svelte';

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
	let createTrigger = $state<HTMLElement | null>(null);
	let searchTrigger = $state<HTMLElement | null>(null);
	let createName = $state(untrack(() => form?.createDraft?.name ?? ''));
	let createFormat = $state(untrack(() => form?.createDraft?.format ?? 'Commander'));
	let createDescription = $state(untrack(() => form?.createDraft?.description ?? ''));
	let nameDraft = $state(
		untrack(
			() =>
				form?.detailsDraft?.name ?? data.decks.find((d) => d.id === data.selectedDeckId)?.name ?? ''
		)
	);
	let formatDraft = $state(
		untrack(
			() =>
				form?.detailsDraft?.format ??
				data.decks.find((d) => d.id === data.selectedDeckId)?.format ??
				''
		)
	);
	let editOpen = $state(false);
	let descriptionDraft = $state(
		untrack(
			() =>
				form?.detailsDraft?.description ??
				data.decks.find((d) => d.id === data.selectedDeckId)?.description ??
				''
		)
	);
	let descriptionBaseRevision = $state(
		untrack(
			() =>
				form?.detailsDraft?.descriptionRevision ??
				data.decks.find((d) => d.id === data.selectedDeckId)?.descriptionRevision ??
				''
		)
	);
	let editingDeckId = $state('');
	let nameBase = $state(
		untrack(
			() =>
				form?.detailsDraft?.nameBase ??
				data.decks.find((d) => d.id === data.selectedDeckId)?.name ??
				''
		)
	);
	let formatBase = $state(
		untrack(
			() =>
				form?.detailsDraft?.formatBase ??
				data.decks.find((d) => d.id === data.selectedDeckId)?.format ??
				''
		)
	);
	let descriptionBase = $state(
		untrack(
			() =>
				form?.detailsDraft?.descriptionBase ??
				data.decks.find((d) => d.id === data.selectedDeckId)?.description ??
				''
		)
	);
	$effect(() => {
		if (editOpen && selectedDeck && editingDeckId !== selectedDeck.id) {
			editingDeckId = selectedDeck.id;
			nameDraft = detailsDraft?.name ?? selectedDeck.name;
			formatDraft = detailsDraft?.format ?? selectedDeck.format;
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
	let importText = $state(untrack(() => form?.importDraft?.text ?? form?.importText ?? ''));
	let importRequestId = $state(untrack(() => form?.importDraft?.requestId ?? ''));
	let importRequestText = $state(untrack(() => importText.trim()));
	let inspectorForm: HTMLFormElement | undefined = $state();
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
	let query = $state(untrack(() => data.query));
	let results = $state<CardDocument[]>(untrack(() => data.catalogCards));
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
		if (data.flow) params.set('flow', data.flow);
		return `?/${name}&${params}`;
	}
	function flowHref(flow = '') {
		const p = new URLSearchParams();
		if (data.selectedDeckId) p.set('deck', data.selectedDeckId);
		if (data.query) p.set('q', data.query);
		if (flow) p.set('flow', flow);
		return `/mtg/decks?${p}`;
	}
	function openCreate(event: MouseEvent) {
		event.preventDefault();
		createTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
		createOpen = true;
	}
	onDestroy(() => {
		searchController?.abort();
		ownershipController?.abort();
	});
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
			const text = String(formData.get('text') ?? '').trim();
			if (!importRequestId || importRequestText !== text) importRequestId = crypto.randomUUID();
			importRequestText = text;
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
		const submittedDetails = target.searchParams.has('/updateDeck')
			? {
					name: String(formData.get('name')),
					format: String(formData.get('format')),
					description: String(formData.get('description'))
				}
			: null;
		const submittedInspector = target.searchParams.has('/changePrinting')
			? {
					id: String(formData.get('entryId')),
					quantity: Number(formData.get('quantity')),
					role: String(formData.get('role')),
					printing: String(formData.get('catalogCardId'))
				}
			: null;

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
					if (
						submittedInspector &&
						inspectedEntryId === submittedInspector.id &&
						inspectorQuantity === submittedInspector.quantity &&
						inspectorRole === submittedInspector.role &&
						inspectorForm &&
						new FormData(inspectorForm).get('catalogCardId') === submittedInspector.printing
					)
						inspected = null;
					if (target.searchParams.has('/addCard') && formData.get('undo')) removed = null;
					createOpen = false;
					if (
						!submittedDetails ||
						(nameDraft === submittedDetails.name &&
							formatDraft === submittedDetails.format &&
							descriptionDraft === submittedDetails.description)
					)
						editOpen = false;
					deleteOpen = false;
					if (target.searchParams.has('/commitImport') && importText.trim() === importRequestText) {
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
	<WorkspaceHeader title={selectedDeck?.name ?? 'Decks'}>
		{#snippet metadata()}
			{#if selectedDeck}<a href="/mtg/decks">All decks</a>
				<p class="deck-format">{selectedDeck.format}</p>{/if}
		{/snippet}
		{#snippet actions()}
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
							{
								label: 'Export Arena',
								href: `/mtg/decks/${selectedDeck.id}/export`,
								download: true
							},
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
				{#if !selectedDeck}<Button href={flowHref('create')} onclick={openCreate} disabled={busy}
						>New deck</Button
					>{/if}
			</div>
		{/snippet}
	</WorkspaceHeader>
	<DeckDialog
		title="Create a deck"
		description="Name the deck and choose its format."
		native={data.flow === 'create'}
		pending={busy}
		cancelHref={flowHref()}
		returnFocus={selectedDeck ? actionsTrigger : createTrigger}
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
				bind:value={createName}
			/>
			<label class="label" for="new-format">Format</label><Select
				native={data.flow === 'create'}
				id="new-format"
				name="format"
				label="Deck format"
				bind:value={createFormat}
				options={formats}
			/>
			<label class="label" for="new-description">Description</label><textarea
				id="new-description"
				name="description"
				class="input"
				rows="3"
				maxlength="4000"
				bind:value={createDescription}></textarea>
			{@render retryError()}
			{#if !saveError && form?.message}<p role="status" class="muted">{form.message}</p>{/if}
			<Button type="submit" variant="default" disabled={busy}>Create deck</Button>
		</form>
	</DeckDialog>
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
				<Button type="submit" variant="default" disabled={busy}>Save draft</Button>
				{#if form?.conflict}<Button
						type="submit"
						variant="secondary"
						name="rebaseDescription"
						value={form.conflict.descriptionRevision}
						disabled={busy}>Use latest revision and save my draft</Button
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
					native={data.flow === 'edit'}
					pending={busy}
					cancelHref={flowHref()}
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
								bind:value={nameDraft}
								required
								maxlength="200"
							/>
							<label class="label" for="edit-format">Format</label><Select
								native={data.flow === 'edit'}
								id="edit-format"
								name="format"
								label="Deck format"
								bind:value={formatDraft}
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
									<Button
										type={data.flow === 'edit' ? 'submit' : 'button'}
										name={data.flow === 'edit' ? 'rebaseDescription' : undefined}
										value={data.flow === 'edit' ? form.conflict.descriptionRevision : undefined}
										variant="secondary"
										onclick={() => {
											descriptionBaseRevision = form!.conflict!.descriptionRevision;
										}}>Use latest revision and keep my draft</Button
									>
								</div>{/if}
							{@render retryError()}
							{#if !saveError && form?.message}<p role="status" class="muted">
									{form.message}
								</p>{/if}<Button type="submit" variant="default" disabled={busy}
								>Save details</Button
							>
						</form>{/key}
				</DeckDialog>
				<DeckDialog
					title="Import decklist"
					native={data.flow === 'import'}
					pending={busy}
					cancelHref={flowHref()}
					variant="import"
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
						<input type="hidden" name="requestId" value={importRequestId || data.requestId} />
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
						></textarea><Button type="submit" variant="secondary" disabled={busy}
							>{busy ? 'Working...' : 'Preview import'}</Button
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
								<input type="hidden" name="requestId" value={importRequestId || data.requestId} />
								<input type="hidden" name="deckId" value={selectedDeck.id} /><input
									type="hidden"
									name="text"
									value={importText}
								/><Button type="submit" variant="default" disabled={busy || !importableCount}
									>Add {importableCount} matched cards</Button
								>
							</form>
						</div>
					{/if}
				</DeckDialog>
				{#if data.flow === 'delete'}<section
						class="native-deck-form form-stack"
						aria-labelledby="native-delete-title"
					>
						<h2 id="native-delete-title">Delete deck</h2>
						<p>Delete {selectedDeck.name} and its card list? Your inventory stays unchanged.</p>
						<Button href={flowHref()} variant="secondary" disabled={busy}>Cancel</Button>
						<form method="POST" action={action('deleteDeck')} use:enhance={save}>
							<input type="hidden" name="deckId" value={selectedDeck.id} /><Button
								type="submit"
								variant="destructive"
								disabled={busy}>Delete this deck</Button
							>
						</form>
					</section>{:else}<ConfirmationDialog
						open={deleteOpen}
						title="Delete deck"
						description={`Delete ${selectedDeck.name} and its card list? Your inventory stays unchanged.`}
						pending={busy}
						error={saveError || (form?.success ? '' : (form?.message ?? ''))}
						onCancel={() => (deleteOpen = false)}
						onCloseAutoFocus={(event) => {
							event.preventDefault();
							actionsTrigger?.focus({ preventScroll: true });
						}}
						><form method="POST" action={action('deleteDeck')} use:enhance={save}>
							<input type="hidden" name="deckId" value={selectedDeck.id} /><Button
								type="submit"
								variant="destructive"
								disabled={busy}>Delete this deck</Button
							>
						</form></ConfirmationDialog
					>{/if}
			</div>
		</section>
		<noscript
			><nav aria-label="Deck tasks">
				<a href={flowHref('create')}>New deck</a> · <a href={flowHref('edit')}>Edit details</a> ·
				<a href={flowHref('import')}>Import decklist</a>
				· <a href={flowHref('delete')}>Delete deck</a> · <a href={flowHref('search')}>Find cards</a>
			</nav></noscript
		>
		<div class="deck-summary">
			<span>{total} cards</span>
			<Button
				variant="secondary"
				aria-pressed={missingOnly}
				onclick={() => (missingOnly = !missingOnly)}>{missing} missing</Button
			>
			<a href="#format-checks"
				>{data.legalityError
					? 'Format checks unavailable'
					: `${data.warnings.length} format warnings`}</a
			>
			<span class="save-status" role="status">{saveStatus}</span>
			<Button
				class="mobile-search"
				variant="secondary"
				href={flowHref('search')}
				onclick={(event) => {
					event.preventDefault();
					searchTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
					searchOpen = true;
				}}>Find cards</Button
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
				<Button type="submit" variant="ghost" disabled={busy}>Undo</Button>
			</form>
		{/if}
		<div class="workspace">
			<section class="panel deck-list" aria-label="Deck cards" aria-busy={busy}>
				<div class="list-controls">
					<div class="view-controls" aria-label="Deck view">
						<Button
							variant={view === 'list' ? 'secondary' : 'ghost'}
							aria-pressed={view === 'list'}
							onclick={() => (view = 'list')}>List</Button
						>
						<Button
							variant={view === 'stacks' ? 'secondary' : 'ghost'}
							aria-pressed={view === 'stacks'}
							onclick={() => (view = 'stacks')}>Stacks</Button
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
				<DeckEntries
					{groups}
					{view}
					documents={data.deckDocuments}
					{availability}
					{busy}
					updateAction={action('updateCard')}
					requestId={data.requestId}
					submit={save}
					onInspect={inspect}
				/>

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
			{#if data.flow !== 'search'}<aside class="catalog desktop-search" aria-label="Find cards">
					{@render discovery()}
				</aside>{/if}
		</div>
	{:else}<DeckLibrary decks={data.decks} covers={data.deckCovers} totals={data.deckTotals} />{/if}
</div>

{#snippet discovery()}<DeckDiscovery
		deckId={selectedDeck?.id}
		bind:query
		bind:ownedOnly
		bind:addRole
		bind:addQuantity
		cards={catalogCards}
		owned={ownedByCanonical}
		{roles}
		{busy}
		{searching}
		{searchError}
		requestId={data.requestId}
		addAction={action('addCard')}
		submit={save}
		onSearch={findCards}
		onInspect={inspect}
		native={data.flow === 'search'}
		printingHref={(id) => `${flowHref('search')}&printing=${encodeURIComponent(id)}`}
	/>{/snippet}

<DeckDialog
	title="Find cards"
	description="Search the catalog for this deck."
	native={data.flow === 'search'}
	cancelHref={flowHref()}
	pending={busy}
	variant="import"
	bind:open={searchOpen}
	returnFocus={searchTrigger}>{@render discovery()}</DeckDialog
>

{#if inspected}
	<CardDetail callerPending={busy} card={inspected} onClose={() => (inspected = null)}>
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
					bind:this={inspectorForm}
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
					<Button type="submit" variant="default" disabled={busy}
						>{inspectedEntry ? 'Save card' : 'Add to deck'}</Button
					>
				</form>
				{#if inspectedEntry}
					<form method="POST" action={action('removeCard')} use:enhance={save}>
						<input type="hidden" name="requestId" value={data.requestId} />
						<input type="hidden" name="entryId" value={inspectedEntry.id} /><Button
							type="submit"
							variant="destructive"
							disabled={busy}>Remove card</Button
						>
					</form>
				{/if}
			</div>
		{/snippet}
	</CardDetail>
{/if}

<style>
	.deck-picker,
	.deck-actions,
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
	.deck-summary > a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--color-text-secondary);
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
	.view-controls {
		display: flex;
		gap: 1.5rem;
		padding: 0;
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
	.inspector-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.deck-summary :global(.mobile-search) {
		display: none;
	}
	@media (max-width: 1000px) {
		.workspace {
			grid-template-columns: 1fr;
		}
		.desktop-search {
			display: none;
		}
		.deck-summary :global(.mobile-search) {
			display: inline-flex;
			margin-left: auto;
		}
		.deck-summary {
			gap: 0.75rem;
		}
		.deck-picker {
			flex-shrink: 0;
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
	}
	@media (max-width: 640px) {
		.list-controls {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.view-controls {
			gap: 0.75rem;
			align-items: center;
		}
		.list-controls input {
			grid-column: 1/-1;
			order: -1;
		}
	}
	@media (max-width: 420px) {
	}
</style>
