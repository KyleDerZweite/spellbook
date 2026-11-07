<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { deckSections } from '#lib/decks/sections.ts';
	import PlusIcon from '#lib/components/ui/PlusIcon.svelte';
	import DeckOverview from '#lib/components/decks/DeckOverview.svelte';
	import DeckStatistics from '#lib/components/decks/DeckStatistics.svelte';
	import SavedStateStatus from '#lib/saved-state/SavedStateStatus.svelte';
	import { workspaceSavedState } from '#lib/saved-state/workspace.svelte.ts';
	import { readSavedJSON } from '#lib/saved-state/read.ts';
	import type { ResourceSubscription } from '#lib/saved-state/workspace.ts';
	import { refreshSelectedDeck, SelectedDeckReadError } from '#lib/decks/selected-refresh.ts';
	import { SelectedDeckOptionalReads } from '#lib/decks/selected-optional-reads.ts';
	import CardDetail from '#lib/components/cards/CardDetail.svelte';
	import { storedCardDocument } from '#lib/mtg/stored-card.ts';
	import type { CardDocument } from '#lib/search/types.ts';
	import { untrack, onDestroy, onMount } from 'svelte';
	import {
		DeckSaveLifecycle,
		type DeckEditor,
		type DeckSubmission
	} from '#lib/decks/save-lifecycle.ts';
	import Button from '#lib/components/ui/button/Button.svelte';
	import WorkspaceHeader from '#lib/components/layout/WorkspaceHeader.svelte';
	import DeckTokens from '#lib/components/decks/DeckTokens.svelte';
	import DeckEntries from '#lib/components/decks/DeckEntries.svelte';
	import DeckLibrary from '#lib/components/decks/DeckLibrary.svelte';
	import DeckDiscovery from '#lib/components/decks/DeckDiscovery.svelte';
	import ConfirmationDialog from '#lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page as routePage } from '$app/state';
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
	const roles = $derived([
		{ value: 'commander', label: 'Commander' },
		{ value: 'main', label: language.t('ui.Main.deck') },
		{ value: 'sideboard', label: language.t('ui.Sideboard') },
		{ value: 'companion', label: language.t('ui.Companion') }
	]);
	let { data, form }: PageProps = $props();
	let savedDecks = $state(
		untrack(() => ({
			...data,
			deckLibrary: { ...data.deckLibrary, items: [] }
		}))
	);
	let deckSubscription: ResourceSubscription | undefined = $state();
	let deletedTarget = $state(false);
	$effect(() => {
		data;
		untrack(() => deckSubscription?.invalidate());
	});
	onMount(() => {
		deckSubscription = workspaceSavedState.subscribe({
			topics: ['decks', 'inventory', 'values'],
			clear: () => {
				savedDecks = {
					...savedDecks,
					decks: [],
					relatedTokens: {
						status: 'unavailable',
						items: [],
						unresolved: [],
						unavailableEntryIds: []
					},
					deckCards: [],
					availability: {},
					valueEstimates: null,
					valuationError: null,
					ownedPrintings: [],
					ownedByCanonical: {},
					deckDocuments: {},
					deckTotals: {},
					deckCovers: {}
				};
				nameDraft = '';
				descriptionDraft = '';
				descriptionBase = '';
				formatDraft = '';
				importText = '';
				createName = '';
				createDescription = '';
				inspected = null;
				removed = null;
				results = [];
				searchOwned = {};
				inspectorOwned = [];
				pendingRequests.clear();
				optionalReads.clear();
				saveLifecycle.destroy();
			},
			refresh: async (lease) => {
				const routeData = data;
				try {
					return await refreshSelectedDeck({
						lease,
						read: readSavedJSON,
						context: () => optionalReads.context(),
						state: () => ({
							confirmedDecks: [...savedDecks.decks, ...data.decks],
							details:
								editOpen || data.flow === 'edit'
									? {
											name: nameDraft,
											nameBase,
											format: formatDraft,
											formatBase,
											description: descriptionDraft,
											descriptionBase,
											descriptionRevision: descriptionBaseRevision
										}
									: null,
							inspector: inspectedEntryId
								? {
										entryId: inspectedEntryId,
										opening: inspectorOpening,
										quantity: inspectorQuantity,
										quantityBase: inspectorQuantityBase,
										role: inspectorRole,
										roleBase: inspectorRoleBase
									}
								: null
						}),
						publish: (value) => {
							if (value.details?.name !== undefined) nameDraft = value.details.name;
							if (value.details?.nameBase !== undefined) nameBase = value.details.nameBase;
							if (value.details?.format !== undefined) formatDraft = value.details.format;
							if (value.details?.formatBase !== undefined) formatBase = value.details.formatBase;
							if (value.details?.description !== undefined)
								descriptionDraft = value.details.description;
							if (value.details?.descriptionBase !== undefined)
								descriptionBase = value.details.descriptionBase;
							if (value.details?.descriptionRevision !== undefined)
								descriptionBaseRevision = value.details.descriptionRevision;
							if (value.inspector?.quantity !== undefined)
								inspectorQuantity = value.inspector.quantity;
							if (value.inspector?.quantityBase !== undefined)
								inspectorQuantityBase = value.inspector.quantityBase;
							if (value.inspector?.role !== undefined) inspectorRole = value.inspector.role;
							if (value.inspector?.roleBase !== undefined)
								inspectorRoleBase = value.inspector.roleBase;
							savedDecks = {
								...savedDecks,
								...value.snapshot,
								...value.optionalLegality
							};
							if (value.ownership && value.ownershipContext)
								optionalReads.acceptOwnership(value.ownership, value.ownershipContext);
							if (value.search && value.searchContext)
								optionalReads.acceptSearch(value.search, value.searchContext);
							deletedTarget = false;
						}
					});
				} catch (cause) {
					if (
						lease.current() &&
						data === routeData &&
						cause instanceof SelectedDeckReadError &&
						cause.deckUnavailable
					) {
						deletedTarget = true;
						savedDecks = { ...savedDecks, valueEstimates: null, valuationError: null };
					}
					throw cause;
				}
			}
		});
		optionalReads.watchSearchActivity(window.matchMedia('(max-width: 1000px)'));
		return () => deckSubscription?.dispose();
	});
	$effect(() => {
		data.selectedDeckId;
		data.flow;
		if (deckSubscription) untrack(() => deckSubscription?.invalidate());
	});
	const saveLifecycle = untrack(
		() => new DeckSaveLifecycle(data.user?.accountId ?? '', data.selectedDeckId, data.flow)
	);
	function nativeEditor(flow: string): DeckEditor | undefined {
		return flow === 'create'
			? 'create'
			: flow === 'edit'
				? 'details'
				: flow === 'import'
					? 'import'
					: flow === 'delete'
						? 'delete'
						: undefined;
	}
	const initialNativeEditor = untrack(() => nativeEditor(data.flow));
	if (initialNativeEditor) saveLifecycle.open(initialNativeEditor);
	function openEditor(editor: Exclude<DeckEditor, 'inspector'>) {
		saveLifecycle.open(editor);
		if (editor === 'create') createOpen = true;
		if (editor === 'details') editOpen = true;
		if (editor === 'import') importOpen = true;
		if (editor === 'delete') deleteOpen = true;
	}
	let createOpen = $state(false);
	let createTrigger = $state<HTMLElement | null>(null);
	let searchTrigger = $state<HTMLElement | null>(null);
	let createName = $state(untrack(() => form?.createDraft?.name ?? ''));
	let createFormat = $state(untrack(() => form?.createDraft?.format ?? 'Commander'));
	let createDescription = $state(untrack(() => form?.createDraft?.description ?? ''));
	let nameDraft = $state(
		untrack(
			() =>
				form?.detailsDraft?.name ??
				savedDecks.decks.find((d) => d.id === data.selectedDeckId)?.name ??
				''
		)
	);
	let formatDraft = $state(
		untrack(
			() =>
				form?.detailsDraft?.format ??
				savedDecks.decks.find((d) => d.id === data.selectedDeckId)?.format ??
				''
		)
	);
	let editOpen = $state(false);
	let descriptionDraft = $state(
		untrack(
			() =>
				form?.detailsDraft?.description ??
				savedDecks.decks.find((d) => d.id === data.selectedDeckId)?.description ??
				''
		)
	);
	let descriptionBaseRevision = $state(
		untrack(
			() =>
				form?.detailsDraft?.descriptionRevision ??
				savedDecks.decks.find((d) => d.id === data.selectedDeckId)?.descriptionRevision ??
				''
		)
	);
	let editingDeckId = $state('');
	let nameBase = $state(
		untrack(
			() =>
				form?.detailsDraft?.nameBase ??
				savedDecks.decks.find((d) => d.id === data.selectedDeckId)?.name ??
				''
		)
	);
	let formatBase = $state(
		untrack(
			() =>
				form?.detailsDraft?.formatBase ??
				savedDecks.decks.find((d) => d.id === data.selectedDeckId)?.format ??
				''
		)
	);
	let descriptionBase = $state(
		untrack(
			() =>
				form?.detailsDraft?.descriptionBase ??
				savedDecks.decks.find((d) => d.id === data.selectedDeckId)?.description ??
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
	let view = $state<'list' | 'stacks'>('stacks');
	let mounted = $state(false);
	let missingOnly = $state(false);
	let searchOpen = $state(false);
	const displayedView = $derived(mounted ? view : 'list');
	onMount(() => {
		mounted = true;
	});
	let inspected = $state<CardDocument | null>(null);
	let inspectedEntryId = $state<string | null>(null);
	let inspectorQuantity = $state(1);
	let inspectorRole = $state('main');
	let inspectorQuantityBase = $state(1);
	let inspectorRoleBase = $state('main');
	let query = $state(untrack(() => data.query));
	let results = $state<CardDocument[]>(untrack(() => data.catalogCards));
	let searchOwned = $state<Record<string, number>>({});
	let inspectorOwned = $state<typeof savedDecks.ownedPrintings>([]);
	let ownershipLoading = $state(false);
	let ownershipError = $state('');
	let inspectorOpening = 0;
	let searching = $state(false);
	let searchError = $state('');
	const optionalReads = new SelectedDeckOptionalReads({
		route: () => ({
			accountId: data.user?.accountId ?? '',
			deckId: data.selectedDeckId,
			flow: data.flow,
			scope: data
		}),
		active: (accountId) => workspaceSavedState.isActive(accountId),
		inspector: () =>
			inspected ? { canonicalCardId: inspected.oracle_id, opening: inspectorOpening } : null,
		search: () => ({ query, open: searchOpen }),
		initialSearch: untrack(() => (!data.oracleId && !data.catalogError ? data.query : undefined)),
		publication: () => deckSubscription?.publication() ?? (() => false),
		read: readSavedJSON,
		ownership: (value) => {
			inspectorOwned = value;
		},
		results: (value) => {
			results = value.hits;
			searchOwned = value.ownedByCanonical;
		},
		ownershipStatus: (loading, error) => {
			ownershipLoading = loading;
			ownershipError = error;
		},
		searchStatus: (loading, error) => {
			searching = loading;
			searchError = error;
		}
	});
	function setSearchQuery(value: string) {
		if (query === value) return;
		query = value;
		optionalReads.searchChanged('query');
	}
	function setSearchOpen(value: boolean) {
		if (searchOpen === value) return;
		searchOpen = value;
		optionalReads.searchChanged();
	}
	function closeInspector() {
		inspectorOpening++;
		inspected = null;
		optionalReads.closeInspector();
	}
	let saveStatus = $state('');
	let saveError = $state('');
	let removed = $state<(typeof savedDecks.deckCards)[number] | null>(null);
	const inspectedEntry = $derived(
		savedDecks.deckCards.find((card) => card.id === inspectedEntryId)
	);
	const inspectorGone = $derived(!!inspectedEntryId && !inspectedEntry);

	async function inspect(card: CardDocument, entry?: (typeof savedDecks.deckCards)[number]) {
		inspectorOpening++;
		saveLifecycle.open('inspector', entry?.id ?? card.id);
		inspected = card;
		inspectedEntryId = entry?.id ?? null;
		inspectorQuantity = entry?.quantity ?? addQuantity;
		inspectorRole = entry?.role ?? addRole;
		inspectorQuantityBase = inspectorQuantity;
		inspectorRoleBase = inspectorRole;
		inspectorOwned = [];
		await optionalReads.readOwnership();
	}
	async function findCards(event: SubmitEvent) {
		event.preventDefault();
		await optionalReads.submitSearch();
	}

	const selectedDeck = $derived(savedDecks.decks.find((deck) => deck.id === data.selectedDeckId));
	const detailsDraft = $derived(
		form?.detailsDraft?.deckId === selectedDeck?.id ? form?.detailsDraft : undefined
	);
	const deckCards = $derived(
		savedDecks.deckCards.filter((card) => card.deckId === data.selectedDeckId)
	);
	const availability = $derived(savedDecks.availability);
	const total = $derived(deckCards.reduce((sum, card) => sum + card.quantity, 0));
	const missing = $derived(
		Object.values(availability).reduce((sum, entry) => sum + entry.missing, 0)
	);
	const ownedByCanonical = $derived(
		new Map(Object.entries({ ...savedDecks.ownedByCanonical, ...searchOwned }))
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

	const sections = $derived(
		deckSections(deckCards, visibleCards, savedDecks.deckDocuments, language.locale)
	);
	const catalogCards = $derived(
		results.filter((card) => !ownedOnly || (ownedByCanonical.get(card.oracle_id) ?? 0) > 0)
	);
	const preview = $derived(form?.preview as ImportPreview | undefined);
	const importableCount = $derived(
		preview?.resolved
			.filter(({ line }) => line.role !== 'maybeboard')
			.reduce((sum, { line }) => sum + line.quantity, 0) ?? 0
	);

	function directoryParams() {
		const params = new URLSearchParams();
		for (const key of ['dirQ', 'dirFormat', 'dirSort', 'dirPage'])
			for (const value of routePage.url.searchParams.getAll(key)) params.append(key, value);
		return params;
	}
	function action(name: string): string {
		const params = directoryParams();
		if (data.selectedDeckId) params.set('deck', data.selectedDeckId);
		if (data.query) params.set('q', data.query);
		if (data.oracleId) params.set('printing', data.oracleId);
		if (data.flow) params.set('flow', data.flow);
		return `?/${name}&${params}`;
	}
	function allDecksHref() {
		const url = new URL(routePage.url.href);
		for (const key of ['deck', 'flow', 'q', 'printing']) url.searchParams.delete(key);
		return url.pathname + url.search;
	}
	function flowHref(flow = '') {
		const p = directoryParams();
		if (data.selectedDeckId) p.set('deck', data.selectedDeckId);
		if (data.query) p.set('q', data.query);
		if (flow) p.set('flow', flow);
		return `/mtg/decks?${p}`;
	}
	function openCreate(event: MouseEvent) {
		event.preventDefault();
		createTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
		openEditor('create');
	}
	let saveAccount = untrack(() => data.user?.accountId ?? '');
	$effect(() => {
		const accountId = data.user?.accountId ?? '';
		if (saveAccount !== accountId) {
			pendingRequests.clear();
			importRequestId = '';
			saveAccount = accountId;
		}
		if (saveLifecycle.setScope(data.user?.accountId ?? '', data.selectedDeckId, data.flow)) {
			optionalReads.clear();
			savedDecks = { ...savedDecks, valueEstimates: null, valuationError: null };
			busy = false;
			saveError = '';
			saveStatus = '';
			createOpen = false;
			editOpen = false;
			importOpen = false;
			deleteOpen = false;
			inspected = null;
			const editor = nativeEditor(data.flow);
			if (editor) saveLifecycle.open(editor);
		}
	});
	$effect(() => {
		if (!createOpen && data.flow !== 'create') saveLifecycle.close('create');
		if (!editOpen && data.flow !== 'edit') saveLifecycle.close('details');
		if (!importOpen && data.flow !== 'import') saveLifecycle.close('import');
		if (!deleteOpen && data.flow !== 'delete') saveLifecycle.close('delete');
		if (!inspected) {
			saveLifecycle.close('inspector');
		}
	});
	onDestroy(() => {
		saveLifecycle.destroy();
		optionalReads.dispose();
	});
	function reportUnconfirmedSave() {
		saveError = language.t('ui.Could.not.confirm.the.save.Your.changes.are.still.here.Try.again');
		saveStatus = language.t('ui.Could.not.confirm.the.save.Try.again');
	}

	function isCurrentSave(submission: DeckSubmission): boolean {
		return (
			workspaceSavedState.isActive(data.user?.accountId) &&
			saveLifecycle.isCurrent(submission) &&
			data.user?.accountId === submission.scope.accountId &&
			data.selectedDeckId === submission.scope.deckId &&
			data.flow === submission.scope.flow
		);
	}

	const save: SubmitFunction = ({ formData, formElement, action: target, cancel }) => {
		if (
			busy ||
			deletedTarget ||
			(inspectedEntryId && !inspectedEntry && target.searchParams.has('/changePrinting'))
		) {
			cancel();
			return;
		}
		const write = deckSubscription?.beginWrite(['decks']);
		const operation =
			[...target.searchParams.keys()].find((key) => key.startsWith('/'))?.slice(1) ?? '';
		const submission = saveLifecycle.capture(
			operation,
			String(formData.get('entryId') || formData.get('catalogCardId') || ''),
			formElement === inspectorForm
		);
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
		const submittedImportText = importText;
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
				if (!(write?.current() ?? true) || !isCurrentSave(submission)) return;
				if (result.type === 'error') {
					reportUnconfirmedSave();
					return;
				}
				const savedDetails = result.type === 'success' ? result.data?.savedDetails : undefined;
				if (
					!(await saveLifecycle.refresh(submission, () =>
						result.type === 'redirect'
							? update({ reset: false })
							: update({ reset: false, refreshAll: false, navigate: false })
					)) ||
					!isCurrentSave(submission)
				)
					return;
				if (
					(result.type === 'success' || result.type === 'failure') &&
					target.searchParams.has('/previewImport') &&
					importText === submittedImportText
				) {
					const previewText = result.data?.importDraft?.text;
					if (typeof previewText === 'string' && previewText) {
						importText = previewText;
						const file = formElement.querySelector<HTMLInputElement>('input[type=file]');
						if (file) file.value = '';
					}
				}
				if (result.type === 'success' || result.type === 'redirect') {
					saveStatus = language.t('ui.Saved');
					for (const [payload, id] of pendingRequests)
						if (id === savedRequestId) pendingRequests.delete(payload);
					if (removedCard) {
						removed = removedCard;
						if (saveLifecycle.canClose(submission, 'inspector')) inspected = null;
					}
					if (
						saveLifecycle.canClose(submission, 'inspector') &&
						submittedInspector &&
						inspectedEntryId === submittedInspector.id &&
						inspectorQuantity === submittedInspector.quantity &&
						inspectorRole === submittedInspector.role &&
						inspectorForm &&
						new FormData(inspectorForm).get('catalogCardId') === submittedInspector.printing
					)
						inspected = null;
					const inspectorBase =
						result.type === 'success'
							? saveLifecycle.savedInspector(
									submission,
									savedRequestId,
									result.data?.acknowledgement
								)
							: undefined;
					if (inspectorBase && submittedInspector && inspectedEntryId === submittedInspector.id) {
						inspectorQuantityBase = inspectorBase.quantity;
						inspectorRoleBase = inspectorBase.role;
						if (inspectorQuantity === submittedInspector.quantity)
							inspectorQuantity = inspectorBase.quantity;
						if (inspectorRole === submittedInspector.role) inspectorRole = inspectorBase.role;
					}
					if (target.searchParams.has('/addCard') && formData.get('undo')) removed = null;
					if (saveLifecycle.canClose(submission, 'create')) createOpen = false;
					const unchangedDetails =
						submittedDetails &&
						nameDraft === submittedDetails.name &&
						formatDraft === submittedDetails.format &&
						descriptionDraft === submittedDetails.description;
					const savedBase = saveLifecycle.savedDetails(submission, savedDetails);
					if (savedBase && submittedDetails) {
						nameBase = savedBase.name;
						formatBase = savedBase.format;
						descriptionBase = savedBase.description;
						descriptionBaseRevision = savedBase.descriptionRevision;
						if (nameDraft === submittedDetails.name) nameDraft = savedBase.name;
						if (formatDraft === submittedDetails.format) formatDraft = savedBase.format;
						if (descriptionDraft === submittedDetails.description)
							descriptionDraft = savedBase.description;
					}
					if (savedBase && saveLifecycle.canClose(submission, 'details') && unchangedDetails)
						editOpen = false;
					if (saveLifecycle.canClose(submission, 'delete')) deleteOpen = false;
					if (
						saveLifecycle.canClose(submission, 'import') &&
						importText.trim() === importRequestText
					) {
						importOpen = false;
						importText = '';
						importRequestId = '';
					}
				}
			} catch {
				if (isCurrentSave(submission)) reportUnconfirmedSave();
			} finally {
				write?.complete();
				if (!(write?.current() ?? true) || !isCurrentSave(submission)) return;
				if (result.type === 'failure') saveStatus = language.t('ui.Could.not.save.Try.again');
				busy = false;
			}
		};
	};
</script>

{#snippet addIcon()}<PlusIcon />{/snippet}

{#if deletedTarget}<p role="alert">
		{language.t(
			'ui.This.Deck.was.removed.elsewhere.Your.draft.is.retained.it.cannot.be.saved.to.the.removed.Deck'
		)}
	</p>{/if}
<SavedStateStatus resource={deckSubscription} />
{#snippet retryError()}
	{#if saveError}<p class="notice" role="alert">{language.message(saveError)}</p>{/if}
{/snippet}

<svelte:head
	><title
		>{selectedDeck
			? language.t('message.p0.Decks', { p0: String(selectedDeck.name) })
			: language.t('ui.Decks')} | Spellbook</title
	></svelte:head
>

<div class="builder workspace-container">
	<WorkspaceHeader title={selectedDeck?.name ?? language.t('ui.Decks')}>
		{#snippet metadata()}
			{#if selectedDeck}<a href={allDecksHref()}>{language.t('ui.All.decks')}</a>
				<p class="deck-format">{selectedDeck.format}</p>{/if}
		{/snippet}
		{#snippet actions()}
			<div class="deck-picker">
				{#if selectedDeck}
					<ActionMenu
						label={language.t('ui.Deck.actions')}
						iconOnly
						bind:triggerRef={actionsTrigger}
						items={[
							{
								label: language.t('ui.New.deck'),
								icon: addIcon,
								onSelect: () => openEditor('create')
							},
							{ label: language.t('ui.Edit.details'), onSelect: () => openEditor('details') },
							{ label: language.t('ui.Import.decklist'), onSelect: () => openEditor('import') },
							{
								label: language.t('ui.Export.Arena'),
								href: `/mtg/decks/${selectedDeck.id}/export`,
								download: true
							},
							{
								label: language.t('ui.Export.simple.text'),
								href: `/mtg/decks/${selectedDeck.id}/export?format=simple`,
								download: true
							},
							{
								label: language.t('ui.Export.CSV'),
								href: `/mtg/decks/${selectedDeck.id}/export?format=csv`,
								download: true
							},
							{
								label: language.t('ui.Export.Spellbook.JSON'),
								href: `/mtg/decks/${selectedDeck.id}/export?format=json`,
								download: true
							},
							{ label: language.t('ui.Print.deck'), href: `/mtg/decks/${selectedDeck.id}/print` },
							{
								label: language.t('ui.Delete.deck'),
								destructive: true,
								onSelect: () => openEditor('delete')
							}
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
				{#if !selectedDeck}<Button href="/mtg/decks/import" variant="secondary"
						>{language.t('ui.Import.deck')}</Button
					><Button href={flowHref('create')} onclick={openCreate} disabled={busy || deletedTarget}
						><PlusIcon />{language.t('ui.New.deck')}</Button
					>{/if}
			</div>
		{/snippet}
	</WorkspaceHeader>
	<DeckDialog
		title={language.t('ui.Create.a.deck')}
		description={language.t('ui.Name.the.deck.and.choose.its.format')}
		native={data.flow === 'create'}
		pending={busy}
		cancelHref={flowHref()}
		returnFocus={selectedDeck ? actionsTrigger : createTrigger}
		bind:open={createOpen}
	>
		<form method="POST" action={action('createDeck')} use:enhance={save} class="form-stack">
			<input type="hidden" name="requestId" value={data.requestId} />
			<label class="label" for="new-name">{language.t('ui.Deck.name')}</label><input
				id="new-name"
				name="name"
				class="input"
				required
				maxlength="200"
				placeholder={language.t('ui.My.next.deck')}
				bind:value={createName}
			/>
			<label class="label" for="new-format">{language.t('ui.Format')}</label><Select
				native={data.flow === 'create'}
				id="new-format"
				name="format"
				label={language.t('ui.Deck.format')}
				bind:value={createFormat}
				options={formats}
			/>
			<label class="label" for="new-description">{language.t('ui.Description')}</label><textarea
				id="new-description"
				name="description"
				class="input"
				rows="3"
				maxlength="4000"
				bind:value={createDescription}></textarea>
			{@render retryError()}
			{#if !saveError && form?.message}<p role="status" class="muted">
					{language.message(form.message)}
				</p>{/if}
			<Button type="submit" variant="default" disabled={busy || deletedTarget}
				><PlusIcon />{language.t('ui.Create.deck')}</Button
			>
		</form>
	</DeckDialog>
	{@render retryError()}
	{#if !saveError && form?.message && !form?.success}<p class="notice" role="alert">
			{language.message(form.message)}
		</p>{/if}
	{#if selectedDeck && detailsDraft && !editOpen}
		<section data-deck-draft-recovery aria-labelledby="draft-recovery-title" class="form-stack">
			<h2 id="draft-recovery-title">{language.t('ui.Recover.your.unsaved.deck.details')}</h2>
			<p>{language.t('ui.Your.draft.is.below.Review.it.before.saving.again')}</p>
			{#if form?.conflict}<p>
					{language.t('ui.Latest.saved.Description')}
					{form.conflict.description}
				</p>{/if}
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
				<label for="recovery-name">{language.t('ui.Deck.name')}</label><input
					id="recovery-name"
					class="input"
					name="name"
					value={detailsDraft.name}
					required
					maxlength="200"
				/>
				<label for="recovery-format">{language.t('ui.Format')}</label><select
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
				<label for="recovery-description">{language.t('ui.Description')}</label><textarea
					id="recovery-description"
					class="input"
					name="description"
					rows="4"
					maxlength="4000">{detailsDraft.description}</textarea
				>
				{@render retryError()}
				<Button type="submit" variant="default" disabled={busy || deletedTarget}
					>{language.t('ui.Save.draft')}</Button
				>
				{#if form?.conflict}<Button
						type="submit"
						variant="secondary"
						name="rebaseDescription"
						value={form.conflict.descriptionRevision}
						disabled={busy || deletedTarget}
						>{language.t('ui.Use.latest.revision.and.save.my.draft')}</Button
					>{/if}
			</form>
		</section>
	{/if}
	{#if selectedDeck}
		<section class="deck-overview" aria-label={language.t('ui.Deck.overview')}>
			<DeckOverview
				cards={deckCards}
				documents={savedDecks.deckDocuments}
				{availability}
				estimates={savedDecks.valueEstimates}
				valuationError={savedDecks.valuationError?.message}
				onInspect={inspect}
			/>
			{#if selectedDeck.description}<details class="deck-notes">
					<summary>{language.t('ui.Deck.notes')}</summary>
					<p class="muted">{selectedDeck.description}</p>
				</details>{/if}
			<div class="deck-actions">
				<DeckDialog
					title={language.t('ui.Deck.details')}
					native={data.flow === 'edit'}
					pending={busy}
					cancelHref={flowHref()}
					description={language.t('ui.Update.the.name.format.or.notes.for.this.deck')}
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
								for="edit-name">{language.t('ui.Deck.name')}</label
							><input
								id="edit-name"
								class="input"
								name="name"
								bind:value={nameDraft}
								required
								maxlength="200"
							/>
							<label class="label" for="edit-format">{language.t('ui.Format')}</label><Select
								native={data.flow === 'edit'}
								id="edit-format"
								name="format"
								label={language.t('ui.Deck.format')}
								bind:value={formatDraft}
								options={formats}
							/>
							<label class="label" for="edit-description">{language.t('ui.Description')}</label
							><textarea
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
										}}>{language.t('ui.Use.latest.revision.and.keep.my.draft')}</Button
									>
								</div>{/if}
							{@render retryError()}
							{#if !saveError && form?.message}<p role="status" class="muted">
									{language.message(form.message)}
								</p>{/if}<Button type="submit" variant="default" disabled={busy || deletedTarget}
								>{language.t('ui.Save.details')}</Button
							>
						</form>{/key}
				</DeckDialog>
				<DeckDialog
					title={language.t('ui.Import.decklist')}
					native={data.flow === 'import'}
					pending={busy}
					cancelHref={flowHref()}
					variant="import"
					description={language.t(
						'ui.Paste.or.upload.Arena.text.simple.text.Spellbook.CSV.or.JSON.v1.Imports.add.quantities.to.this.Deck.and.retain.its.details'
					)}
					returnFocus={actionsTrigger}
					bind:open={importOpen}
				>
					<form
						method="POST"
						action={action('previewImport')}
						enctype="multipart/form-data"
						use:enhance={save}
						class="form-stack"
					>
						<input type="hidden" name="requestId" value={importRequestId || data.requestId} />
						<input type="hidden" name="deckId" value={selectedDeck.id} /><label
							class="label"
							for="import-text">{language.t('ui.Decklist')}</label
						><textarea
							id="import-text"
							name="text"
							class="input decklist-input"
							rows="9"
							maxlength="100000"
							bind:value={importText}
							placeholder={"Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Sol Ring\n10 Forest"}
						></textarea>
						<label class="label" for="import-file">{language.t('ui.Or.upload.a.UTF.8.file')}</label>
						<input
							id="import-file"
							type="file"
							name="file"
							accept=".txt,.csv,.json,text/plain,text/csv,application/json"
						/>
						<p>
							{language.t(
								'ui.Maximum.100.000.characters.400.000.file.bytes.and.1.000.card.records.Simple.text.loses.printing.choices.and.roles'
							)}
						</p>
						<a href="/mtg/decks/import">{language.t('ui.Import.as.a.complete.new.Deck')}</a>
						<Button type="submit" variant="secondary" disabled={busy || deletedTarget}
							>{busy ? 'Working...' : language.t('ui.Preview.import')}</Button
						>
					</form>
					{@render retryError()}
					{#if !saveError && form?.message}<p role="status" class="notice">
							{language.message(form.message)}
						</p>{/if}
					{#if preview && form?.importText === importText.trim()}
						<div class="import-preview" aria-live="polite">
							<p>
								{language.t('sentence.p0.cards.matched.for.import', {
									p0: String(importableCount)
								})}
							</p>
							{#if preview.unresolved.length || preview.ambiguous.length}<p class="warning">
									{language.t(
										'ui.Resolve.every.record.before.importing.Edit.the.list.and.preview.again'
									)}
								</p>{/if}
							<ul>
								{#each preview.unresolved as item}<li>
										<code>{item.line.raw}</code>: {item.reason}
									</li>{/each}{#each preview.ambiguous as item}<li>
										<code>{item.line.raw}</code>{language.t(
											'ui.Multiple.matches.Add.a.set.code.and.collector.number'
										)}
									</li>{/each}
							</ul>
							{#if preview.resolved.some(({ line }) => line.role === 'maybeboard')}<p
									class="warning"
								>
									{language.t(
										'ui.Maybeboard.is.unsupported.Move.these.cards.into.a.supported.Deck.section.before.importing'
									)}
								</p>{/if}
							<details>
								<summary>{language.t('ui.Matched.cards')}</summary>
								<ul>
									{#each preview.resolved.filter(({ line }) => line.role !== 'maybeboard') as item}<li
										>
											{item.line.quantity}
											{item.card.name} · {language.t(`role.${item.line.role}`)}
										</li>{/each}
								</ul>
							</details>
							{#if preview.warnings.length}<details>
									<summary>{language.t('ui.Format.warnings.for.imported.cards')}</summary>
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
								/><Button
									type="submit"
									variant="default"
									disabled={busy ||
										!importableCount ||
										preview.unresolved.length > 0 ||
										preview.ambiguous.length > 0}
									><PlusIcon />{language.t(`deck.import.add.${language.plural(importableCount)}`, {
										count: language.number(importableCount)
									})}</Button
								>
							</form>
						</div>
					{/if}
				</DeckDialog>
				{#if data.flow === 'delete'}<section
						class="native-deck-form form-stack"
						aria-labelledby="native-delete-title"
					>
						<h2 id="native-delete-title">{language.t('ui.Delete.deck')}</h2>
						<p>
							{language.t('ui.Delete')}
							{selectedDeck.name}
							{language.t('ui.and.its.card.list.Your.inventory.stays.unchanged')}
						</p>
						<Button href={flowHref()} variant="secondary" disabled={busy || deletedTarget}
							>{language.t('ui.Cancel')}</Button
						>
						<form method="POST" action={action('deleteDeck')} use:enhance={save}>
							<input type="hidden" name="deckId" value={selectedDeck.id} /><Button
								type="submit"
								variant="destructive"
								disabled={busy || deletedTarget}>{language.t('ui.Delete.this.deck')}</Button
							>
						</form>
					</section>{:else}<ConfirmationDialog
						open={deleteOpen}
						title={language.t('ui.Delete.deck')}
						description={language.t(
							'message.Delete.p0.and.its.card.list.Your.inventory.stays.unchanged',
							{ p0: String(selectedDeck.name) }
						)}
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
								disabled={busy || deletedTarget}>{language.t('ui.Delete.this.deck')}</Button
							>
						</form></ConfirmationDialog
					>{/if}
			</div>
		</section>
		<noscript
			><nav aria-label={language.t('ui.Deck.tasks')}>
				<a class="inline-flex items-center gap-2" href={flowHref('create')}
					><PlusIcon />{language.t('ui.New.deck')}</a
				>
				· <a href={flowHref('edit')}>{language.t('ui.Edit.details')}</a> ·
				<a href={flowHref('import')}>{language.t('ui.Import.decklist')}</a>
				·
				<a href={`/mtg/decks/${selectedDeck.id}/export?format=json`}
					>{language.t('ui.Export.Spellbook.JSON')}</a
				>
				·
				<a href={`/mtg/decks/${selectedDeck.id}/export?format=csv`}>{language.t('ui.Export.CSV')}</a
				>
				· <a href={`/mtg/decks/${selectedDeck.id}/export`}>{language.t('ui.Export.Arena')}</a> ·
				<a href={`/mtg/decks/${selectedDeck.id}/export?format=simple`}
					>{language.t('ui.Export.simple.text')}</a
				>
				· <a href={`/mtg/decks/${selectedDeck.id}/print`}>{language.t('ui.Print.deck')}</a> ·
				<a href={flowHref('delete')}>{language.t('ui.Delete.deck')}</a>
				· <a href={flowHref('search')}>{language.t('ui.Find.cards')}</a>
			</nav></noscript
		>
		<div class="deck-summary">
			<span class="deck-size"
				><i class="ms ms-deck" aria-hidden="true"></i>{total.toLocaleString(language.locale)}
				{language.t('ui.cards')}</span
			>
			<Button
				variant={missingOnly ? 'secondary' : 'ghost'}
				aria-pressed={missingOnly}
				onclick={() => (missingOnly = !missingOnly)}>{missing} {language.t('ui.missing')}</Button
			>
			<a href="#format-checks"
				>{savedDecks.legalityError
					? language.t('ui.Format.checks.unavailable')
					: language.t('message.p0.format.warnings', { p0: String(savedDecks.warnings.length) })}</a
			>
			<span class="save-status" role="status">{saveStatus}</span>
			<Button
				class="mobile-search"
				variant="secondary"
				href={flowHref('search')}
				onclick={(event) => {
					event.preventDefault();
					searchTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
					setSearchOpen(true);
				}}><PlusIcon />{language.t('ui.Add.cards')}</Button
			>
		</div>
		{#if removed && removed.deckId === selectedDeck.id}
			<form method="POST" action={action('addCard')} use:enhance={save} class="undo-row">
				<input type="hidden" name="requestId" value={data.requestId} />
				<span>{language.t('ui.Removed')} {removed.name}.</span>
				<input type="hidden" name="deckId" value={selectedDeck.id} />
				<input type="hidden" name="catalogCardId" value={removed.catalogCardId} />
				<input type="hidden" name="quantity" value={removed.quantity} />
				<input type="hidden" name="role" value={removed.role} /><input
					type="hidden"
					name="undo"
					value="1"
				/>
				<Button type="submit" variant="ghost" disabled={busy || deletedTarget}
					>{language.t('ui.Undo')}</Button
				>
			</form>
		{/if}
		<div class="workspace">
			<section class="deck-list" aria-label={language.t('ui.Deck.cards')} aria-busy={busy}>
				<div class="list-controls">
					<div class="view-controls" aria-label={language.t('ui.Deck.view')}>
						<Button
							variant={displayedView === 'list' ? 'secondary' : 'ghost'}
							aria-pressed={displayedView === 'list'}
							onclick={() => (view = 'list')}>{language.t('ui.List')}</Button
						>
						<Button
							variant={displayedView === 'stacks' ? 'secondary' : 'ghost'}
							aria-pressed={displayedView === 'stacks'}
							disabled={!mounted}
							onclick={() => (view = 'stacks')}>{language.t('ui.Stacks')}</Button
						>
					</div>
					<input
						class="input"
						type="search"
						aria-label={language.t('ui.Filter.deck.cards')}
						placeholder={language.t('ui.Find.in.this.deck')}
						bind:value={listQuery}
					/><Select
						label={language.t('ui.Sort.deck.cards')}
						bind:value={sortBy}
						options={[
							{ value: 'name', label: language.t('ui.Name') },
							{ value: 'quantity', label: language.t('ui.Quantity') }
						]}
					/>
				</div>
				{#if deckCards.length === 0}<div class="empty-state">
						<p>
							{language.t('ui.Search.the.catalog.to.add.a.card.or.import.an.existing.decklist')}
						</p>
					</div>{/if}
				{#each sections as section (section.value)}
					<section aria-label={section.label} class="deck-section">
						<h2>
							{#if section.value === 'commander'}<i class="ms ms-commander" aria-hidden="true"></i>
							{/if}{section.label} <small>{section.count}</small>
						</h2>
						<DeckEntries
							groups={section.groups}
							view={section.value === 'sideboard' || section.value === 'companion'
								? 'list'
								: displayedView}
							showGroupHeadings={section.value === 'main'}
							documents={savedDecks.deckDocuments}
							{availability}
							{busy}
							updateAction={action('updateCard')}
							requestId={data.requestId}
							submit={save}
							onInspect={inspect}
						/>
					</section>{/each}
				<DeckTokens tokens={savedDecks.relatedTokens} entries={deckCards} />

				{#if !visibleCards.length && deckCards.length}<p class="empty-state">
						{language.t('ui.No.deck.cards.match.this.filter')}
					</p>{/if}
				<details
					id="format-checks"
					class="legality"
					open={savedDecks.warnings.length > 0 || !!savedDecks.legalityError}
				>
					<summary
						>{language.t('ui.Format.checks')}
						{savedDecks.warnings.length ? `(${savedDecks.warnings.length})` : ''}</summary
					>
					<p class="muted">
						{language.t('ui.Advisory.checks.only.Review.current.format.rules.before.an.event')}
					</p>
					{#if savedDecks.legalityError}<p class="warning">
							{savedDecks.legalityError}
						</p>{:else if savedDecks.warnings.length}<ul>
							{#each savedDecks.warnings as warning}<li>{warning.message}</li>{/each}
						</ul>{:else}<p>{language.t('ui.No.warnings.from.the.available.checks')}</p>{/if}
				</details>
			</section>
			<aside class="deck-sidebar" aria-label={language.t('ui.Deck.tools.and.analysis')}>
				{#if data.flow !== 'search'}<section
						class="catalog desktop-search"
						aria-label={language.t('ui.Find.cards')}
					>
						<h2 class="catalog-title">{language.t('ui.Add.cards')}</h2>
						{@render discovery()}
					</section>{/if}
				<DeckStatistics cards={deckCards} documents={savedDecks.deckDocuments} />
			</aside>
		</div>
	{:else}<DeckLibrary page={data.deckLibrary} accountId={data.user?.accountId ?? ''} />{/if}
</div>

{#snippet discovery()}<DeckDiscovery
		deckId={selectedDeck?.id}
		bind:query={() => query, setSearchQuery}
		bind:ownedOnly
		bind:addRole
		bind:addQuantity
		cards={catalogCards}
		owned={ownedByCanonical}
		{roles}
		{busy}
		{searching}
		searchError={language.message(searchError)}
		requestId={data.requestId}
		addAction={action('addCard')}
		submit={save}
		onSearch={findCards}
		onInspect={inspect}
		native={data.flow === 'search'}
		printingHref={(id) => `${flowHref('search')}&printing=${encodeURIComponent(id)}`}
	/>{/snippet}

<DeckDialog
	title={language.t('ui.Find.cards')}
	description={language.t('ui.Search.the.catalog.for.this.deck')}
	native={data.flow === 'search'}
	cancelHref={flowHref()}
	pending={busy}
	variant="import"
	bind:open={() => searchOpen, setSearchOpen}
	returnFocus={searchTrigger}>{@render discovery()}</DeckDialog
>

{#if inspected}
	<CardDetail callerPending={busy} card={inspected} onClose={closeInspector}>
		{#snippet actions(printing)}
			{@const owned = inspectorOwned.filter((card) => card.canonicalCardId === printing.oracle_id)}
			<div class="inspector-form">
				<p class="muted">
					{#if ownershipLoading}{language.t(
							'ui.Loading.owned.quantities'
						)}{:else if ownershipError}{ownershipError}{:else}
						{owned
							.filter((card) => card.catalogCardId === printing.id)
							.reduce((sum, card) => sum + card.quantity, 0)}
						{language.t('ui.exact')}
						{owned
							.filter((card) => card.catalogCardId !== printing.id)
							.reduce((sum, card) => sum + card.quantity, 0)}
						{language.t('ui.other.printings.owned')}{/if}
				</p>
				{#if inspectorGone}<p role="alert">
						{language.t(
							'ui.This.saved.Deck.entry.was.removed.Your.draft.is.kept.but.cannot.be.submitted'
						)}
					</p>{/if}
				{#if inspectedEntry}<p class="muted">
						{language.t('sentence.This.deck.p0.missing.Inventory.is.not.reserved', {
							p0: String(availability[inspectedEntry.id]?.missing ?? 0)
						})}
					</p>{/if}
				<form
					method="POST"
					action={action(inspectedEntryId ? 'changePrinting' : 'addCard')}
					bind:this={inspectorForm}
					use:enhance={save}
					class="form-stack"
				>
					<input type="hidden" name="requestId" value={data.requestId} />
					<input type="hidden" name="deckId" value={selectedDeck?.id} /><input
						type="hidden"
						name="entryId"
						value={inspectedEntryId ?? ''}
					/><input type="hidden" name="catalogCardId" value={printing.id} />
					<label class="label" for="inspect-quantity">{language.t('ui.Quantity')}</label><input
						class="input"
						id="inspect-quantity"
						name="quantity"
						type="number"
						min="1"
						max="10000"
						required
						bind:value={inspectorQuantity}
					/>
					<label class="label" for="inspect-role">{language.t('ui.Section')}</label><Select
						id="inspect-role"
						name="role"
						label={language.t('ui.Section')}
						bind:value={inspectorRole}
						options={roles}
					/>
					{@render retryError()}
					<p role="status" class="muted">
						{busy ? 'Saving…' : saveError ? '' : (form?.message ?? '')}
					</p>
					<Button type="submit" variant="default" disabled={busy || deletedTarget || inspectorGone}
						>{#if !inspectedEntryId}<PlusIcon />{/if}{inspectedEntryId
							? language.t('ui.Save.card')
							: language.t('ui.Add.to.deck')}</Button
					>
				</form>
				{#if inspectedEntry}<form method="POST" action={action('removeCard')} use:enhance={save}>
						<input type="hidden" name="requestId" value={data.requestId} />
						<input type="hidden" name="entryId" value={inspectedEntry.id} /><Button
							type="submit"
							variant="destructive"
							disabled={busy || deletedTarget}>{language.t('ui.Remove.card')}</Button
						>
					</form>
				{/if}
			</div>
		{/snippet}
	</CardDetail>
{/if}

<style>
	.deck-section {
		margin: 1.5rem 0;
	}
	.deck-section > h2 {
		font: 400 1.25rem var(--font-display);
		margin-bottom: 0.75rem;
	}
	.deck-section small {
		color: var(--color-text-secondary);
		font: 0.75rem var(--font-body);
	}
	.deck-picker {
		display: flex;
		justify-content: flex-end;
	}
	.deck-format {
		color: var(--color-text-secondary);
		font-size: 0.75rem;
		margin-top: 0.25rem;
	}
	.deck-overview,
	.deck-actions {
		display: contents;
	}
	.deck-notes {
		font-size: 0.75rem;
		margin: 0 0 1rem;
	}
	.deck-notes p {
		max-width: 60rem;
		margin-top: 0.5rem;
	}
	.muted {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}
	.deck-summary {
		position: sticky;
		top: var(--app-header-height);
		z-index: 10;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		min-height: 3.5rem;
		padding: 0.5rem 0;
		background: var(--color-background);
		border-bottom: 1px solid var(--color-border);
		margin-bottom: 1.5rem;
		font-size: 0.75rem;
	}
	.deck-size {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-variant-numeric: tabular-nums;
	}
	.deck-summary > a {
		display: inline-flex;
		align-items: center;
		min-height: 2.75rem;
		color: var(--color-text-secondary);
	}
	.save-status {
		margin-left: auto;
		color: var(--color-text-secondary);
	}
	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 20rem;
		gap: 2rem;
		align-items: start;
	}
	.deck-list {
		min-width: 0;
	}
	.deck-sidebar {
		display: grid;
		gap: 24px;
		min-width: 0;
	}
	.catalog {
		min-width: 0;
		padding: 1rem;
		background: var(--color-surface);
		border-radius: 0.75rem;
	}
	.catalog-title {
		font: 400 1.25rem var(--font-display);
		margin-bottom: 1rem;
	}
	.view-controls {
		display: flex;
		gap: 0.25rem;
	}
	.list-controls {
		display: grid;
		grid-template-columns: auto minmax(6rem, 1fr) 7rem 9rem;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 1rem;
	}
	.list-controls input {
		min-width: 0;
	}
	.legality {
		padding: 1.5rem 0;
		font-size: 0.75rem;
		scroll-margin-top: calc(var(--app-header-height) + 6rem);
	}
	summary {
		cursor: pointer;
	}
	.legality ul,
	.import-preview ul {
		padding-left: 1.25rem;
		line-height: 1.8;
	}
	.empty-state {
		padding: 3rem 1rem;
		text-align: center;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}
	.form-stack {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.notice,
	.undo-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		font-size: 0.75rem;
		padding: 0.75rem 0;
	}
	.decklist-input {
		font-family: var(--font-mono);
	}
	.import-preview {
		margin-top: 1rem;
		font-size: 0.75rem;
	}
	.inspector-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.deck-summary :global(.mobile-search) {
		display: none;
	}
	@media (max-width: 1200px) {
		.workspace {
			grid-template-columns: minmax(0, 1fr) 18rem;
			gap: 1.5rem;
		}
		.list-controls {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
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
			gap: 0.5rem;
		}
		.save-status:empty {
			display: none;
		}
		.list-controls {
			grid-template-columns: auto minmax(0, 1fr) 7rem 9rem;
		}
	}
	@media (max-width: 760px) {
		.list-controls {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.list-controls input {
			min-width: 0;
		}
		.view-controls {
			align-items: center;
		}
	}
	@media (max-width: 420px) {
		.list-controls input {
			grid-column: 1 / -1;
			grid-row: 1;
		}
		.view-controls {
			grid-column: 1 / -1;
		}
		.deck-summary {
			position: static;
		}
	}
</style>
