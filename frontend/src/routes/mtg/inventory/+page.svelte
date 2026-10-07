<script lang="ts">
	import { InventoryTargetReads } from '#lib/inventory/targets.ts';
	import { goto } from '$app/navigation';
	import WorkspaceHeader from '#lib/components/layout/WorkspaceHeader.svelte';
	import Button from '#lib/components/ui/button/Button.svelte';
	import QuantityControl from '#lib/components/ui/QuantityControl.svelte';
	import VirtualInventoryList from '#lib/components/inventory/VirtualInventoryList.svelte';
	import { InventoryWindow, inventoryUrl } from '#lib/inventory/window.ts';
	import type {
		InventoryEntry,
		InventoryQuery,
		InventoryPage
	} from '@spellbook/contracts/inventory.ts';
	import type { InventoryCard } from '#lib/types/legacy.ts';
	import { page } from '$app/state';
	import {
		inventoryAction,
		effectiveInventoryUrl,
		submittedDraftMatches
	} from '#lib/mtg/inventory-action.ts';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { tick, onMount, untrack } from 'svelte';
	import type { PageProps } from './$types';
	import CardDetail from '#lib/components/cards/CardDetail.svelte';
	import GroupDirectory from '#lib/components/inventory/GroupDirectory.svelte';
	import GroupEditor from '#lib/components/inventory/GroupEditor.svelte';
	import EntryGroups from '#lib/components/inventory/EntryGroups.svelte';
	import { GroupMutation } from '#lib/mtg/groupMutation.svelte.ts';
	import type { InventoryGroup } from '#lib/types/legacy.ts';
	import Select from '#lib/components/ui/select/Select.svelte';
	import ActionMenu from '#lib/components/ui/menu/ActionMenu.svelte';
	import FilterPopover from '#lib/components/ui/popover/FilterPopover.svelte';
	import ConfirmationDialog from '#lib/components/ui/dialog/ConfirmationDialog.svelte';
	import ScrollArea from '#lib/components/ui/scroll-area/ScrollArea.svelte';
	import {
		describeInventoryOrder,
		inventoryConditions,
		inventorySetColor,
		isNewInventoryEntry,
		nextInventoryOrder,
		type InventoryColumn,
		type InventoryOrder
	} from '#lib/mtg/inventory-view.ts';
	import { storedCardDocument } from '#lib/mtg/stored-card.ts';
	import { getSearchSession } from '#lib/search/session.svelte.ts';
	import { isPrimaryClick } from '#lib/search/navigation.ts';
	import type { CardDocument } from '#lib/search/types.ts';

	let { data, form }: PageProps = $props();
	const search = getSearchSession();
	const initialQuery = untrack(() => data.window.query);
	let order = $state<InventoryOrder>({
		base: initialQuery.sort,
		direction: initialQuery.dir,
		variant: initialQuery.variant
			? { column: initialQuery.variant, direction: initialQuery.variantDir }
			: null
	});
	let query = $state(initialQuery.q);
	let selectedSets = $state<string[]>(initialQuery.sets);
	let filterOpen = $state(false);
	let setQuery = $state('');
	let filterField = $state<'set' | 'finish' | 'condition'>('set');
	let filterReturnTarget = $state<HTMLElement | null>(null);
	let setSearchInput = $state<HTMLInputElement | null>(null);
	let finishTrigger = $state<HTMLButtonElement | null>(null);
	let conditionTrigger = $state<HTMLButtonElement | null>(null);
	let selectedFinish = $state(initialQuery.finish as string);
	let selectedCondition = $state(initialQuery.condition as string);
	let inspection = $state<{
		entryId: string;
		mode: 'edit' | 'add';
		card: CardDocument;
		returnFocus: HTMLElement | null;
	} | null>(null);
	let removeId = $state<string | null>(null);
	let assigningEntryId = $state<string | null>(null);
	let removeLifetime = 0,
		assigningLifetime = 0;
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
	let hydrated = $state(false),
		windowVersion = $state(0),
		virtualList = $state<ReturnType<typeof VirtualInventoryList> | null>(null);
	let anchorRestoreActive = false,
		anchorController: AbortController | null = null;
	let revisionAnchor: { id: string | null; index: number; intra: number } | null = null;
	const window = new InventoryWindow(
		async (input, revision, signal) => {
			const response = await fetch(
				`/api/mobile/v1/mtg/inventory?${inventoryUrl(input, revision)}`,
				{ signal }
			);
			if (response.status === 401) {
				window.clear();
				void goto('/auth/login?returnTo=/mtg/inventory');
				throw new Error('Sign in again to load inventory.');
			}
			const result = await response.json();
			if (!response.ok && result.kind !== 'RevisionChanged')
				throw new Error(result.message ?? 'Could not load inventory. Try again.');
			return result;
		},
		() => windowVersion++,
		() => {
			if (!anchorRestoreActive) revisionAnchor = virtualList?.anchor() ?? null;
		}
	);
	const asLegacy = (entry: InventoryEntry): InventoryCard => ({
		...entry,
		createdAt: new Date(entry.createdAt),
		updatedAt: new Date(entry.updatedAt)
	});
	let currentWindow = $derived.by(() => {
		windowVersion;
		return window.current ?? data.window;
	});
	let loadedEntries = $derived.by(() => {
		windowVersion;
		return hydrated
			? window.loaded()
			: data.window.entries.map((entry, index) => ({
					entry,
					index: data.window.query.offset + index
				}));
	});
	let inventoryCards = $derived(loadedEntries.map((row) => asLegacy(row.entry)));
	let metrics = $derived.by(() => {
		windowVersion;
		return window.metrics();
	});
	let pins = $derived(
		[inspection?.entryId, removeId, assigningEntryId, pendingId].flatMap((id) => {
			const entry = loadedEntries.find((row) => row.entry.id === id);
			return entry ? [entry.index] : [];
		})
	);
	let windowAccount = '';
	onMount(() => {
		hydrated = true;
		windowAccount = page.data.user?.accountId ?? 'session';
		window.seed(windowAccount, data.window);
		return () => {
			hydrated = false;
			refreshController?.abort();
			anchorController?.abort();
			window.clear();
		};
	});
	$effect(() => {
		if (!hydrated) return;
		const initial = data.window;
		untrack(() => {
			// refreshAll from Search reloads the rendered URL, which can precede the active shallow view.
			if (
				effectiveInventoryUrl(page).search !== page.url.search &&
				window.current &&
				windowAccount === (page.data.user?.accountId ?? 'session')
			) {
				void refreshInventory();
				return;
			}
			query = initial.query.q;
			selectedSets = initial.query.sets;
			selectedFinish = initial.query.finish;
			selectedCondition = initial.query.condition;
			order = {
				base: initial.query.sort,
				direction: initial.query.dir,
				variant: initial.query.variant
					? { column: initial.query.variant, direction: initial.query.variantDir }
					: null
			};
			const samePage =
				window.current?.queryKey === initial.queryKey &&
				window.current?.query.offset === initial.query.offset;
			const anchor = samePage ? virtualList?.anchor() : null;
			windowAccount = page.data.user?.accountId ?? 'session';
			window.seed(windowAccount, initial);
			if (anchor?.id) void restoreAnchor(anchor.id, anchor.intra, anchor.index);
			else void restoreNativeOffset(initial.query.offset);
			void refreshTargets();
		});
	});
	function requestQuery(): InventoryQuery {
		return {
			...data.window.query,
			q: query,
			sets: selectedSets,
			finish: selectedFinish as InventoryQuery['finish'],
			condition: selectedCondition as InventoryQuery['condition'],
			sort: order.base,
			dir: order.direction,
			variant: order.variant?.column ?? null,
			variantDir: order.variant?.direction ?? 'asc',
			offset: 0,
			limit: 50
		};
	}
	function nativeUrl(input: InventoryQuery, pageNumber = 1) {
		const params = inventoryUrl(input);
		params.delete('offset');
		params.delete('limit');
		params.set('page', String(pageNumber));
		return `/mtg/inventory?${params}`;
	}
	$effect(() => {
		if (!hydrated) return;
		const input = requestQuery();
		const account = page.data.user?.accountId ?? 'session';
		const same = untrack(
			() =>
				JSON.stringify({ ...input, offset: 0 }) ===
				JSON.stringify({ ...currentWindow.query, offset: 0 })
		);
		if (same) return;
		const controller = new AbortController();
		const timer = setTimeout(() => {
			void (async () => {
				try {
					await window.open(account, input, controller.signal);
					if (controller.signal.aborted) return;
					await goto(nativeUrl(input), { replace: true, reset: false, shallow: true });
				} catch (cause) {
					if (!controller.signal.aborted)
						mutationError = cause instanceof Error ? cause.message : 'Could not apply filters.';
				}
			})();
		}, 200);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	async function restoreNativeOffset(offset: number) {
		const identity = window.identity;
		const account = page.data.user?.accountId;
		const isCurrent = () =>
			hydrated && window.identity === identity && page.data.user?.accountId === account;
		if (!isCurrent()) return;
		// The hydrated child is created in this flush; reading its binding before tick loses the native offset.
		await tick();
		if (!isCurrent()) return;
		await virtualList?.scrollToIndex(offset, 0, isCurrent);
	}

	let refreshController: AbortController | null = null;
	async function refreshInventory(expectedAccount = page.data.user?.accountId ?? 'session') {
		if (!hydrated || expectedAccount !== (page.data.user?.accountId ?? 'session')) return;
		refreshController?.abort();
		const controller = new AbortController();
		refreshController = controller;
		const account = expectedAccount;
		const anchor = virtualList?.anchor();
		anchorController?.abort();
		anchorController = null;
		anchorRestoreActive = true;
		try {
			const identity = await window.refresh(account, controller.signal);
			if (
				!identity ||
				controller.signal.aborted ||
				window.identity !== identity ||
				account !== (page.data.user?.accountId ?? 'session')
			)
				return;
			if (anchor?.id) await restoreAnchor(anchor.id, anchor.intra, anchor.index);
			else await restoreNativeOffset(window.current?.query.offset ?? 0);
			await refreshTargets();
		} finally {
			if (refreshController === controller) {
				refreshController = null;
				if (!anchorController) anchorRestoreActive = false;
			}
		}
	}

	async function restoreAnchor(id: string, intra = 0, fallbackIndex = 0) {
		anchorController?.abort();
		const controller = new AbortController();
		anchorController = controller;
		anchorRestoreActive = true;
		try {
			const location = await window.locateAndLoad(
				id,
				async (query, entryId, revision, signal) => {
					const response = await fetch(
						`/api/mobile/v1/mtg/inventory/${entryId}/location?${inventoryUrl(query, revision)}`,
						{ signal }
					);
					const result = await response.json();
					if (!response.ok && result.kind !== 'RevisionChanged')
						throw Error('Could not restore the inventory position.');
					return result;
				},
				controller.signal
			);
			if (!location || controller.signal.aborted || window.identity !== location.identity)
				return false;
			const index =
				location.index ??
				Math.min(fallbackIndex, Math.max(0, (window.current?.matching.entryCount ?? 0) - 1));
			await virtualList?.scrollToIndex(
				index,
				location.index === null ? 0 : intra,
				() => !controller.signal.aborted && window.identity === location.identity
			);
			return !controller.signal.aborted && window.identity === location.identity;
		} catch (cause) {
			if (!controller.signal.aborted)
				mutationError =
					cause instanceof Error ? cause.message : 'Could not restore the inventory position.';
			return false;
		} finally {
			if (anchorController === controller) {
				anchorRestoreActive = false;
				anchorController = null;
				revisionAnchor = null;
			}
		}
	}

	let observedRevision = '';
	$effect(() => {
		const revision = currentWindow.revision;
		if (!hydrated || revision === observedRevision) return;
		observedRevision = revision;
		untrack(() => {
			const anchor = anchorRestoreActive ? null : (revisionAnchor ?? virtualList?.anchor());
			revisionAnchor = null;
			if (anchor?.id) void restoreAnchor(anchor.id, anchor.intra, anchor.index);
			void refreshTargets();
		});
	});
	let targetEntries = $state<Record<string, InventoryCard>>({}),
		notesDraft = $state(''),
		notesBase = $state('0'),
		notesConflict = $state<{ notes: string; notesRevision: string } | null>(null),
		quantityDraft = $state(1),
		draftDirty = $state(false),
		targetGone = $state(false);
	const targetReads = new InventoryTargetReads<InventoryEntry>(
		() => ({
			account: page.data.user?.accountId,
			generation: window.identity,
			active: hydrated,
			targets: [
				...(inspection
					? [{ id: inspection.entryId, role: 'inspector', lifetime: inspection }]
					: []),
				...(removeId ? [{ id: removeId, role: 'remove', lifetime: removeLifetime }] : []),
				...(assigningEntryId
					? [{ id: assigningEntryId, role: 'groups', lifetime: assigningLifetime }]
					: [])
			]
		}),
		(id) => fetch(`/api/mobile/v1/mtg/inventory/${id}`),
		(id, entry) => {
			if (!entry) {
				if (id === inspection?.entryId) targetGone = true;
				delete targetEntries[id];
				return;
			}
			targetEntries[id] = asLegacy(entry);
			if (id === inspection?.entryId && !draftDirty) {
				notesDraft = entry.notes;
				notesBase = entry.notesRevision;
				quantityDraft = entry.quantity;
			}
		}
	);
	function refreshTargets() {
		return targetReads.refresh();
	}

	$effect(() => {
		if (!hydrated) return;
		const targetIds = new Set([inspection?.entryId, removeId, assigningEntryId, pendingId]);
		const retained = new Set([...inventoryCards.map((entry) => entry.id), ...targetIds]);
		untrack(() => {
			for (const id of Object.keys(rowMenuRefs)) if (!retained.has(id)) delete rowMenuRefs[id];
			for (const id of Object.keys(targetEntries)) if (!targetIds.has(id)) delete targetEntries[id];
		});
	});

	let groupDirectory = $derived(
		currentWindow.query.view === 'groups' && !currentWindow.query.group
	);
	let selectedGroup = $derived(
		currentWindow.groups.find((group) => group.id === currentWindow.query.group)
	);
	let groupLink = $state<HTMLAnchorElement | null>(null);
	let groupReturnTarget = $state<HTMLElement | null>(null);
	let editingGroup = $state<{ group: InventoryGroup | null } | null>(null);
	let deletingGroup = $state<InventoryGroup | null>(null);

	let assigningEntry = $derived(
		targetEntries[assigningEntryId ?? ''] ??
			inventoryCards.find((entry) => entry.id === assigningEntryId)
	);
	const groupDeletion = new GroupMutation(
		() => (deletingGroup = null),
		refreshInventory,
		() => page.data.user?.accountId ?? 'session'
	);
	function membershipsFor(entryId: string) {
		return (hydrated ? window.memberships() : currentWindow.memberships)
			.filter((membership) => membership.entryId === entryId)
			.map((membership) => membership.groupId);
	}
	function entryGroupNames(entryId: string) {
		const ids = new Set(membershipsFor(entryId));
		return currentWindow.groups
			.filter((group) => ids.has(group.id))
			.map((group) => group.name)
			.join(' · ');
	}
	function editGroup(group: InventoryGroup | null, trigger: HTMLElement | null) {
		groupReturnTarget = trigger;
		editingGroup = { group };
	}
	function removeGroup(group: InventoryGroup, trigger: HTMLElement | null) {
		groupReturnTarget = trigger;
		groupDeletion.error = '';
		deletingGroup = group;
	}
	function assignGroups(entryId: string) {
		groupReturnTarget = rowMenuRefs[entryId] ?? searchInput;
		targetEntries[entryId] = inventoryCards.find((e) => e.id === entryId)!;
		assigningLifetime++;
		assigningEntryId = entryId;
	}
	function returnFromGroup(event: Event) {
		event.preventDefault();
		if (groupReturnTarget?.isConnected) groupReturnTarget.focus({ preventScroll: true });
		else groupLink?.focus({ preventScroll: true });
	}

	let inspected = $derived(targetEntries[inspection?.entryId ?? '']);
	let removing = $derived(targetEntries[removeId ?? '']);
	const normalizeSet = (code: string) => code.toLowerCase();
	const setName = (code: string) =>
		currentWindow.sets.find((s) => s.code === normalizeSet(code))?.name ?? code.toUpperCase();
	let setOptions = $derived(
		[...new Set([...currentWindow.sets.map((set) => set.code), ...selectedSets])]
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
	let listCards = $derived(inventoryCards);
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
	function openSearch(event: MouseEvent) {
		if (!isPrimaryClick(event)) return;
		event.preventDefault();
		search.open(
			undefined,
			event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined
		);
	}
	function openInspection(id: string, mode: 'edit' | 'add', returnFocus: HTMLElement | null) {
		const card = inventoryCards.find((entry) => entry.id === id);
		if (!card) return;
		targetEntries[id] = card;
		notesDraft = card.notes;
		notesBase = card.notesRevision;
		notesConflict = null;
		quantityDraft = card.quantity;
		draftDirty = false;
		targetGone = false;
		inspection = { entryId: id, mode, card: storedCardDocument(card), returnFocus };
	}
	function openRemoval(id: string) {
		mutationError = '';
		removalReturnTarget = rowMenuRefs[id] ?? searchInput;
		targetEntries[id] = inventoryCards.find((e) => e.id === id)!;
		removeLifetime++;
		removeId = id;
	}
	function cancelRemoval() {
		removeId = null;
		mutationError = '';
	}
	async function returnFromRemoval(event: Event) {
		event.preventDefault();
		if (removalReturnTarget?.isConnected) removalReturnTarget.focus({ preventScroll: true });
		else searchInput?.focus({ preventScroll: true });
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
	let matchingQuantity = $derived(currentWindow.matching.copyCount);
	let ownedInSet = $derived(currentWindow.setProgress?.ownedCanonicalCount ?? 0);
	$effect(() => {
		setCatalogTotal = currentWindow.setProgress?.catalogCanonicalCount ?? null;
		setProgressLoading = false;
	});
	function clearFilters() {
		query = '';
		selectedSets = [];
		selectedFinish = 'all';
		selectedCondition = 'all';
	}
	const pendingRequests = new Map<string, string>();
	const saveEntry: SubmitFunction = ({ formData, action, cancel }) => {
		if (pendingId) {
			cancel();
			return;
		}
		const payload =
			(page.data.user?.accountId ?? 'session') +
			action.pathname +
			action.search +
			JSON.stringify([...formData.entries()].filter(([name]) => name !== 'requestId'));
		const requestId = pendingRequests.get(payload) ?? crypto.randomUUID();
		pendingRequests.set(payload, requestId);
		formData.set('requestId', requestId);
		const id = String(formData.get('entryId'));
		const card = inventoryCards.find((entry) => entry.id === id);
		const submitted = {
			id,
			notes: String(formData.get('notes') ?? ''),
			quantity: Number(formData.get('quantity'))
		};
		const submittedAccount = page.data.user?.accountId ?? 'session';
		const removing = action.searchParams.has('/remove');
		pendingId = id;
		status = 'Saving…';
		mutationError = '';
		return async ({ result, update }) => {
			try {
				if (result.type === 'success') {
					pendingRequests.delete(payload);
					const index = listCards.findIndex((entry) => entry.id === id);
					const neighbor = listCards[index + 1] ?? listCards[index - 1];
					const focus = document.activeElement;
					await update({ reset: false, refreshAll: false, navigate: false });
					if (focus instanceof HTMLElement && focus.isConnected)
						focus.focus({ preventScroll: true });
					if (!hydrated || submittedAccount !== (page.data.user?.accountId ?? 'session')) return;
					if (
						!removing &&
						submittedDraftMatches(submitted, {
							id: inspection?.entryId,
							notes: notesDraft,
							quantity: quantityDraft
						})
					)
						draftDirty = false;
					await refreshInventory(submittedAccount);
					if (removing) {
						if (neighbor) await restoreAnchor(neighbor.id);
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
					if (result.type === 'failure' && result.data?.latestNotes)
						notesConflict = result.data.latestNotes as { notes: string; notesRevision: string };
					mutationError =
						result.type === 'failure' && typeof result.data?.message === 'string'
							? result.data.message
							: 'Could not save this change. Try again.';
					status = '';
					if (removing) await refreshTargets();
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
	{#if form?.notesRecovery}
		<section aria-labelledby="notes-recovery-title" class="inspector-form">
			<h2 id="notes-recovery-title">Your unsaved Notes</h2>
			<p role="alert">{form.message}</p>
			{#if form.latestNotes}<p>Latest saved Notes: {form.latestNotes.notes || '(empty)'}</p>{/if}
			<form method="POST" action={inventoryAction('updateQuantity', effectiveInventoryUrl(page))}>
				<input type="hidden" name="entryId" value={form.notesRecovery.entryId} />
				<input type="hidden" name="requestId" value={form.notesRecovery.requestId} />
				<input type="hidden" name="notesRevision" value={form.notesRecovery.notesRevision} />
				<label for="recovered-quantity">Owned quantity</label><input
					id="recovered-quantity"
					name="quantity"
					type="number"
					min="1"
					step="1"
					value={form.notesRecovery.quantity}
				/>
				<label for="recovered-notes">Notes draft</label><textarea id="recovered-notes" name="notes"
					>{form.notesRecovery.notes}</textarea
				>
				{#if form.latestNotes}<button
						class="btn btn-primary"
						name="rebaseNotesRevision"
						value={form.latestNotes.notesRevision}>Save my draft against the latest revision</button
					>{:else}<button class="btn btn-primary">Retry Save</button>{/if}
			</form>
		</section>
	{/if}

	<WorkspaceHeader title="Inventory">
		{#snippet metadata()}<p class="inventory-totals">
				<strong>{currentWindow.totals.copyCount.toLocaleString()}</strong> cards <span>·</span>
				<strong>{currentWindow.totals.canonicalCardCount.toLocaleString()}</strong>
				card names <span>·</span> <strong>{currentWindow.totals.setCount}</strong> sets
			</p>{/snippet}
		{#snippet actions()}{#if groupDirectory}<Button
					onclick={(event) => editGroup(null, event.currentTarget)}>New group</Button
				>{:else if selectedGroup}<Button variant="secondary" href="/mtg/inventory"
					>Assign cards</Button
				>{:else}<Button variant="ghost" href="/mtg/scan">Scan</Button><Button
					href="/mtg/search"
					onclick={openSearch}>Add cards</Button
				>{/if}{/snippet}
	</WorkspaceHeader>
	<noscript
		><form method="GET" class="native-inventory-filters" aria-label="Inventory filters">
			<label>Search<input class="input" type="search" name="q" value={data.window.query.q} /></label
			><label
				>Sets<select class="input" name="set" multiple
					>{#each data.window.sets as set}<option
							value={set.code}
							selected={data.window.query.sets.includes(set.code)}>{set.name}</option
						>{/each}</select
				></label
			><label
				>Finish<select class="input" name="finish"
					>{#each finishOptions as option}<option
							value={option.value}
							selected={data.window.query.finish === option.value}>{option.label}</option
						>{/each}</select
				></label
			><label
				>Condition<select class="input" name="condition"
					>{#each conditionOptions as option}<option
							value={option.value}
							selected={data.window.query.condition === option.value}>{option.label}</option
						>{/each}</select
				></label
			><label
				>Sort<select class="input" name="sort"
					>{#each ['name', 'set', 'newest'] as value}<option
							{value}
							selected={data.window.query.sort === value}>{value}</option
						>{/each}</select
				></label
			><label
				>Direction<select class="input" name="dir"
					><option value="asc" selected={data.window.query.dir === 'asc'}>Ascending</option><option
						value="desc"
						selected={data.window.query.dir === 'desc'}>Descending</option
					></select
				></label
			><label
				>Variant<select class="input" name="variant"
					><option value="">None</option>{#each ['finish', 'condition', 'quantity'] as value}<option
							{value}
							selected={data.window.query.variant === value}>{value}</option
						>{/each}</select
				></label
			><label
				>Variant direction<select class="input" name="variantDir"
					><option value="asc" selected={data.window.query.variantDir === 'asc'}>Ascending</option
					><option value="desc" selected={data.window.query.variantDir === 'desc'}
						>Descending</option
					></select
				></label
			><input
				type="hidden"
				name="view"
				value={data.window.query.view}
			/>{#if data.window.query.group}<input
					type="hidden"
					name="group"
					value={data.window.query.group}
				/>{/if}<Button type="submit">Apply filters</Button>
		</form></noscript
	>
	<nav class="inventory-views" aria-label="Inventory views">
		<a
			href="/mtg/inventory"
			class:active={!(currentWindow.query.view === 'groups')}
			aria-current={!(currentWindow.query.view === 'groups') ? 'page' : undefined}>Cards</a
		><a
			bind:this={groupLink}
			href="/mtg/inventory?view=groups"
			class:active={currentWindow.query.view === 'groups'}
			aria-current={currentWindow.query.view === 'groups' ? 'page' : undefined}>Groups</a
		>
	</nav>
	{#if selectedGroup}<div class="selected-group">
			<a href="/mtg/inventory?view=groups">All groups</a><span aria-hidden="true">/</span><strong
				>{selectedGroup.name}</strong
			>
		</div>{/if}
	{#if !removeId && (mutationError || form?.message)}<p class="mutation-error" role="alert">
			{mutationError || form?.message}
		</p>{/if}
	{#if groupDirectory}
		<GroupDirectory
			groups={currentWindow.groupPage}
			dialogOpen={editingGroup !== null || deletingGroup !== null}
			onRename={editGroup}
			onRemove={removeGroup}
		/>
	{:else if currentWindow.totals.entryCount === 0}
		<div class="empty-state">
			<p>No cards yet.</p>
			<a bind:this={emptyAction} href="/mtg/search" onclick={openSearch} class="btn btn-secondary"
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
				{currentWindow.matching.entryCount}
				{currentWindow.matching.entryCount === 1 ? 'entry' : 'entries'} <span>·</span>
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
		{#if currentWindow.matching.entryCount === 0}<div class="empty-state">
				<p>
					{data.selectedGroupId && !hasFilters
						? 'No cards in this group yet. Assign cards from their row menu in Cards.'
						: 'No cards match these filters.'}
				</p>
				{#if hasFilters}<button class="btn btn-secondary" onclick={clearFilters}
						>Clear filters</button
					>{/if}
			</div>
		{:else}
			{#snippet entryRow(card: InventoryCard)}
				<div
					class="inventory-row"
					data-inventory-row={card.id}
					class:saving={pendingId === card.id}
				>
					<button
						class="card-identity"
						onclick={(event) => openInspection(card.id, 'edit', event.currentTarget)}
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
							>{#if entryGroupNames(card.id)}<span
									class="entry-groups"
									title={entryGroupNames(card.id)}>{entryGroupNames(card.id)}</span
								>{/if}{#if card.notes}<span class="entry-notes">{card.notes}</span>{/if}</span
						></button
					>
					<noscript
						><a href={`/mtg/inventory/${card.id}${effectiveInventoryUrl(page).search}`}>Details</a
						></noscript
					>
					<span class="row-metadata">{@render metadata('set', card.setCode)}</span><span
						class="row-metadata">{@render metadata('finish', card.finish)}</span
					><span class="row-metadata">{@render metadata('condition', card.condition)}</span>
					<QuantityControl
						quantity={card.quantity}
						label={card.name}
						action={inventoryAction('updateQuantity', effectiveInventoryUrl(page))}
						submit={saveEntry}
						disabled={pendingId !== null}
					>
						{#snippet fields(delta)}<input type="hidden" name="entryId" value={card.id} /><input
								type="hidden"
								name="delta"
								value={delta}
							/><input type="hidden" name="requestId" value={data.requestId} />{/snippet}
					</QuantityControl>
					<ActionMenu
						label={`Actions for ${card.name}, ${card.setCode.toUpperCase()}, ${card.finish}, ${card.condition}`}
						iconOnly
						class="entry-menu"
						bind:triggerRef={
							() => rowMenuRefs[card.id] ?? null, (ref) => (rowMenuRefs[card.id] = ref)
						}
						onCloseAutoFocus={(event) => {
							if (
								removeId === card.id ||
								inspection?.entryId === card.id ||
								assigningEntryId === card.id
							)
								event.preventDefault();
						}}
						items={[
							{
								label: 'Add another',
								disabled: pendingId !== null,
								onSelect: () => openInspection(card.id, 'add', rowMenuRefs[card.id] ?? searchInput)
							},
							{
								label: 'Groups',
								disabled: pendingId !== null,
								onSelect: () => assignGroups(card.id)
							},
							{
								label: 'Remove',
								destructive: true,
								disabled: pendingId !== null,
								onSelect: () => openRemoval(card.id)
							}
						]}
					/>
				</div>{/snippet}
			{#if hydrated}<VirtualInventoryList
					bind:this={virtualList}
					total={currentWindow.matching.entryCount}
					queryKey={currentWindow.queryKey}
					version={windowVersion}
					loadedIndexes={loadedEntries.map((row) => row.index)}
					pinnedIndexes={pins}
					getEntry={(index) => window.at(index)}
					onRange={(start, end) => window.plan(start, end)}
				>
					{#snippet row(entry: InventoryEntry)}{@render entryRow(asLegacy(entry))}{/snippet}
				</VirtualInventoryList>{:else}<ul class="inventory-list" aria-label="Inventory entries">
					{#each listCards as card (card.id)}<li>{@render entryRow(card)}</li>{/each}
				</ul>{/if}
		{/if}
	{/if}
	<nav class="inventory-pagination" aria-label="Inventory pages">
		{#if currentWindow.query.offset > 0}<Button
				variant="secondary"
				href={nativeUrl(
					currentWindow.query,
					Math.max(1, Math.floor(currentWindow.query.offset / 50))
				)}>Previous</Button
			>{/if}
		<span
			>Page {Math.floor(currentWindow.query.offset / 50) + 1} of {Math.max(
				1,
				Math.ceil(
					(groupDirectory ? currentWindow.groupCount : currentWindow.matching.entryCount) / 50
				)
			)}</span
		>
		{#if currentWindow.query.offset + 50 < (groupDirectory ? currentWindow.groupCount : currentWindow.matching.entryCount)}<Button
				variant="secondary"
				href={nativeUrl(currentWindow.query, Math.floor(currentWindow.query.offset / 50) + 2)}
				>Next</Button
			>{/if}
	</nav>
	<div
		hidden
		data-inventory-cache-pages={metrics.pages}
		data-inventory-cache-entries={metrics.entries}
		data-inventory-contexts={metrics.contexts}
		data-inventory-requests={metrics.requests}
		data-inventory-reference-count={Object.keys(rowMenuRefs).length}
		data-inventory-target-count={Object.keys(targetEntries).length}
	></div>
	{#if hydrated && window.error}<p role="alert">
			{window.error}<Button
				variant="secondary"
				onclick={() =>
					window.plan(virtualList?.anchor().index ?? 0, (virtualList?.anchor().index ?? 0) + 50)}
				>Try again</Button
			>
		</p>{/if}
</div>

{#if editingGroup}<GroupEditor
		group={editingGroup.group}
		refresh={refreshInventory}
		onClose={() => (editingGroup = null)}
		onCloseAutoFocus={returnFromGroup}
	/>{/if}
{#if assigningEntry}<EntryGroups
		entry={assigningEntry}
		refresh={refreshInventory}
		groups={currentWindow.groups}
		groupIds={membershipsFor(assigningEntry.id)}
		onClose={() => (assigningEntryId = null)}
		onCloseAutoFocus={returnFromGroup}
	/>{/if}
<ConfirmationDialog
	open={deletingGroup !== null}
	title="Delete this group?"
	description={`Delete ${deletingGroup?.name ?? ''}? Your cards stay in inventory; only this group's assignments are removed.`}
	pending={groupDeletion.pending}
	error={groupDeletion.error}
	onCancel={() => (deletingGroup = null)}
	onCloseAutoFocus={returnFromGroup}
>
	<form
		method="POST"
		action={inventoryAction('deleteGroup', effectiveInventoryUrl(page))}
		use:enhance={groupDeletion.submit}
	>
		<input type="hidden" name="requestId" value={data.requestId} />
		<input type="hidden" name="groupId" value={deletingGroup?.id ?? ''} /><button
			class="btn btn-destructive"
			disabled={groupDeletion.pending}
			type="submit">{groupDeletion.pending ? 'Deleting...' : 'Delete group'}</button
		>
	</form>
</ConfirmationDialog>

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
	<form
		method="POST"
		action={inventoryAction('remove', effectiveInventoryUrl(page))}
		use:enhance={saveEntry}
	>
		<input type="hidden" name="requestId" value={data.requestId} />
		<input type="hidden" name="entryId" value={removeId ?? ''} /><input
			type="hidden"
			name="expectedQuantity"
			value={removing?.quantity ?? 0}
		/>
		<button class="btn btn-destructive" type="submit" disabled={pendingId !== null || !removing}
			>{pendingId === removeId ? 'Removing…' : 'Remove'}</button
		>
	</form>
</ConfirmationDialog>

{#if inspection}
	<CardDetail
		card={inspection.card}
		returnFocus={inspection.returnFocus}
		actions={inspection.mode === 'edit' ? editEntryActions : undefined}
		onClose={() => {
			const id = inspection?.entryId;
			inspection = null;
			if (id)
				void restoreAnchor(id).then((restored) => {
					if (!restored) return;
					(rowMenuRefs[id] ?? searchInput)?.focus({ preventScroll: true });
				});
		}}
	/>
	{#snippet editEntryActions(activeCard: CardDocument)}
		{#if targetGone}<p role="alert">This entry was removed. Your unsaved notes are retained.</p>
			<label class="label" for="removed-notes">Unsaved Notes</label><textarea
				id="removed-notes"
				class="input"
				bind:value={notesDraft}
			></textarea>{:else if inspected && activeCard.id === inspected.catalogCardId}
			<form
				method="POST"
				action={inventoryAction('updateQuantity', effectiveInventoryUrl(page))}
				use:enhance={saveEntry}
				class="inspector-form"
			>
				<input type="hidden" name="requestId" value={data.requestId} />
				<input type="hidden" name="notesRevision" value={notesBase} />
				<input type="hidden" name="entryId" value={inspected.id} />
				<p>
					{inspected.setCode.toUpperCase()} · {inspected.finish === 'foil' ? 'Foil' : 'Nonfoil'} · {inspected.condition}
				</p>
				{#if notesConflict}<p role="alert">
						Latest saved Notes: {notesConflict.notes || '(empty)'}
					</p>
					<button
						type="button"
						class="btn btn-secondary"
						onclick={() => {
							notesBase = notesConflict!.notesRevision;
							notesConflict = null;
						}}>Use latest revision with my draft</button
					>{/if}
				<label class="label" for="inventory-quantity">Owned quantity</label><input
					class="input"
					id="inventory-quantity"
					name="quantity"
					type="number"
					min="1"
					step="1"
					required
					bind:value={quantityDraft}
					oninput={() => (draftDirty = true)}
				/><label class="label" for="inventory-notes">Notes</label><textarea
					class="input"
					id="inventory-notes"
					name="notes"
					rows="2"
					bind:value={notesDraft}
					oninput={() => (draftDirty = true)}></textarea><button
					type="submit"
					class="btn btn-primary"
					disabled={pendingId !== null || targetGone}
					>{pendingId === inspected.id ? 'Saving…' : 'Save'}</button
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
	.inventory-pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-top: 1rem;
		font-size: 0.75rem;
	}
	.native-inventory-filters {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.native-inventory-filters label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.inventory-views {
		display: flex;
		gap: 1.25rem;
		margin-bottom: 0.75rem;
	}
	.inventory-views a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding-inline: 0.125rem;
		text-decoration: none;
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
		border-bottom: 2px solid transparent;
	}
	.inventory-views a.active {
		color: var(--color-text-primary);
		border-bottom-color: currentColor;
	}
	.selected-group {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.625rem;
		margin-bottom: 0.75rem;
		font-size: 0.8125rem;
	}
	.selected-group a {
		color: var(--color-text-secondary);
	}
	.selected-group strong {
		font-weight: 500;
		overflow-wrap: anywhere;
	}
	.entry-groups {
		display: block;
		color: var(--color-text-secondary);
		font-size: 0.6875rem;
		max-width: 100%;

		overflow-wrap: anywhere;
	}

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
		color: var(--color-text-muted);
		font-size: 0.75rem;
		margin-top: 0.15rem;

		overflow-wrap: anywhere;
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
		.inventory-totals {
			font-size: 0.75rem;
		}
		.inventory-totals span {
			margin: 0 0.15rem;
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
		:global(.quantity-control) {
			grid-column: 2;
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
	}
</style>
