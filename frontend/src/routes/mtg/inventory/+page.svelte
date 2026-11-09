<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import PlusIcon from '#lib/components/ui/PlusIcon.svelte';
	import type { HistoricalHoldingIdentity } from '@spellbook/contracts/inventory-value.ts';
	import SavedStateStatus from '#lib/saved-state/SavedStateStatus.svelte';
	import { workspaceSavedState } from '#lib/saved-state/workspace.svelte.ts';
	import type { ResourceSubscription, ReadLease } from '#lib/saved-state/workspace.ts';
	import {
		inventoryMetadataHref,
		type InventoryMetadataKind
	} from '#lib/inventory/filter-shortcuts.ts';
	import { InventoryTargetReads } from '#lib/inventory/targets.ts';
	import { goto } from '$app/navigation';
	import WorkspaceHeader from '#lib/components/layout/WorkspaceHeader.svelte';
	import Button from '#lib/components/ui/button/Button.svelte';
	import NativeRangeNavigation from '#lib/components/ui/pagination/NativeRangeNavigation.svelte';
	import { restoreInitialBrowsePosition } from '#lib/browsing/viewport.ts';
	import {
		parseLazyBrowsePagination as parseBrowsePagination,
		browsePaginationHref,
		clampBrowsePagination
	} from '#lib/browsing/pagination.ts';
	import CardQuickAdd from '#lib/components/cards/CardQuickAdd.svelte';
	import CardBrowsingActions from '#lib/components/cards/CardBrowsingActions.svelte';
	import {
		createDeckAdditionDraft,
		createInventoryAdditionDraft
	} from '#lib/cards/addition-drafts.ts';
	import VirtualInventoryList from '#lib/components/inventory/VirtualInventoryList.svelte';
	import {
		InventoryWindow,
		inventoryUrl,
		matchingNativeInventoryQuery
	} from '#lib/inventory/window.ts';
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
		submittedDraftMatches,
		confirmedInventoryBases
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
	let notesRecovery = $derived(form && 'notesRecovery' in form ? form.notesRecovery : undefined);
	let latestNotes = $derived(form && 'latestNotes' in form ? form.latestNotes : undefined);
	const search = getSearchSession();
	const initialQuery = untrack(() => data.window.query);
	let browse = $state(untrack(() => data.pagination));
	let resultsHeading = $state<HTMLHeadingElement | null>(null);
	let pageController: AbortController | null = null;
	let addingPending = $state(false);
	let deckAdditionDraft = $state(createDeckAdditionDraft());
	let inventoryAdditionDraft = $state(createInventoryAdditionDraft());
	let additionAccount = untrack(() => page.data.user?.accountId ?? null);
	function clearAdditionDrafts() {
		Object.assign(deckAdditionDraft, createDeckAdditionDraft());
		Object.assign(inventoryAdditionDraft, createInventoryAdditionDraft());
		addingPending = false;
	}
	$effect(() => {
		const account = page.data.user?.accountId ?? null;
		const state = workspaceSavedState.getState();
		untrack(() => {
			if (account !== additionAccount || !account || state === 'expired') clearAdditionDrafts();
			additionAccount = account;
		});
	});
	let privateCleared = $state(false);
	let lastBrowseSearch = untrack(() => effectiveInventoryUrl(page).search);
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
		mode: 'details' | 'edit' | 'add';
		historyIdentity: HistoricalHoldingIdentity;
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
	const addedDate = $derived(
		new Intl.DateTimeFormat(language.locale, { dateStyle: 'medium', timeZone: 'UTC' })
	);
	const columns: Array<{ column: Exclude<InventoryColumn, 'newest'>; label: string }> = $derived([
		{ column: 'name', label: language.t('ui.Card') },
		{ column: 'set', label: language.t('ui.Set') },
		{ column: 'finish', label: language.t('ui.Finish') },
		{ column: 'condition', label: language.t('ui.Condition') },
		{ column: 'quantity', label: language.t('ui.Quantity') }
	]);
	const conditionOptions = $derived([
		{ value: 'all', label: language.t('ui.All') },
		...inventoryConditions.map((value) => ({
			value,
			label: language.t(
				(
					{
						NM: 'ui.Near.Mint',
						LP: 'ui.Lightly.Played',
						MP: 'ui.Moderately.Played',
						HP: 'ui.Heavily.Played',
						DMG: 'ui.Damaged'
					} as const
				)[value as 'NM']
			)
		}))
	]);
	const finishOptions = $derived([
		{ value: 'all', label: language.t('ui.All') },
		{ value: 'nonfoil', label: language.t('notice.Nonfoil') },
		{ value: 'foil', label: language.t('notice.Foil') }
	]);
	let hydrated = $state(false),
		windowVersion = $state(0),
		virtualList = $state<ReturnType<typeof VirtualInventoryList> | null>(null),
		groupList = $state<ReturnType<typeof GroupDirectory> | null>(null);
	let confirmedInventoryWrite = $state(0);
	let anchorRestoreActive = false,
		anchorController: AbortController | null = null;
	let revisionAnchor: { id: string | null; index: number; intra: number } | null = null;
	let inventorySubscription: ResourceSubscription | undefined = $state();
	const window = new InventoryWindow(
		async (input, revision, signal) => {
			const publication = inventorySubscription?.publication() ?? (() => hydrated);
			const account = page.data.user?.accountId;
			const response = await fetch(`/api/v1/mtg/inventory?${inventoryUrl(input, revision)}`, {
				signal
			});
			if (response.status === 401) {
				if (publication() && account === page.data.user?.accountId) workspaceSavedState.expire();
				throw new Error(language.t('ui.Sign.in.again.to.load.inventory'));
			}
			const result = await response.json();
			if (!response.ok && result.kind !== 'RevisionChanged')
				throw new Error(result.message ?? language.t('ui.Could.not.load.inventory.Try.again'));
			return result;
		},
		() => windowVersion++,
		() => {
			if (!anchorRestoreActive) revisionAnchor = virtualList?.anchor() ?? null;
		},
		() => inventorySubscription?.publication() ?? (() => hydrated)
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
	let visitedSpan = $derived.by(() => {
		windowVersion;
		return window.span;
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
	let nativeCards = $derived(
		loadedEntries
			.filter(
				({ index }) =>
					index >= currentWindow.query.offset &&
					index < currentWindow.query.offset + currentWindow.query.limit
			)
			.map(({ entry }) => asLegacy(entry))
	);
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
	let lastServerWindow = untrack(() => data.window);
	let requestedServerQuery: InventoryQuery | null = $state(untrack(() => data.window.query));
	onMount(() => {
		hydrated = true;
		windowAccount = page.data.user?.accountId ?? 'session';
		window.pinServerPage(data.window);
		window.seed(windowAccount, data.window, () => true, false, 'lazy');
		inventorySubscription = workspaceSavedState.subscribe({
			topics: ['inventory'],
			refresh: (lease) => refreshInventory(windowAccount, lease),
			clear: () => {
				privateCleared = true;
				// Privacy clear discards records, not the checked current route range to reacquire.
				requestedServerQuery = { ...requestQuery(), offset: browse.offset };
				window.clear();
				targetEntries = {};
				inspection = null;
				clearAdditionDrafts();
				removeId = null;
				assigningEntryId = null;
				pendingId = null;
				notesDraft = '';
				notesOriginal = '';
				notesBase = '0';
				quantityBase = 1;
				quantityDraft = 1;
				pendingRequests.clear();
			}
		});
		return () => {
			hydrated = false;
			clearAdditionDrafts();
			inventorySubscription?.dispose();
			refreshController?.abort();
			pageController?.abort();
			anchorController?.abort();
			window.clear(true);
		};
	});
	$effect(() => {
		if (!hydrated) return;
		const initial = data.window;
		untrack(() => {
			if (initial === lastServerWindow) return;
			lastServerWindow = initial;
			window.pinServerPage(initial);
			const account = page.data.user?.accountId ?? 'session';
			if (!workspaceSavedState.isActive(account)) return;
			privateCleared = false;
			// Later SSR completion requests a current leased read, never overwrites synchronized state.
			if (
				effectiveInventoryUrl(page).search !== page.url.search &&
				window.current &&
				windowAccount === account
			) {
				inventorySubscription?.invalidate();
				return;
			}
			const samePage =
				window.current?.queryKey === initial.queryKey &&
				window.current?.query.offset === initial.query.offset &&
				window.current?.query.limit === initial.query.limit &&
				window.browseMode === 'lazy';
			if (!samePage) {
				browse = data.pagination;
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
				requestedServerQuery = initial.query;
			}
			windowAccount = account;
			inventorySubscription?.invalidate();
		});
	});

	function requestQuery(): InventoryQuery {
		return {
			...data.window.query,
			q: query.trim(),
			sets: selectedSets,
			finish: selectedFinish as InventoryQuery['finish'],
			condition: selectedCondition as InventoryQuery['condition'],
			sort: order.base,
			dir: order.direction,
			variant: order.variant?.column ?? null,
			variantDir: order.variant?.direction ?? 'asc',
			offset: 0,
			limit: browse.limit
		};
	}
	function viewHref(view: 'cards' | 'groups') {
		const url = new URL(effectiveInventoryUrl(page).href);
		url.searchParams.set('view', view);
		url.searchParams.delete('group');
		return browsePaginationHref(url, browse, { page: 1 });
	}
	function nativeUrl(input: InventoryQuery, pageNumber = 1) {
		const url = new URL('/mtg/inventory', effectiveInventoryUrl(page).href);
		url.search = inventoryUrl(input).toString();
		return browsePaginationHref(url, browse, { page: pageNumber });
	}
	function metadataHref(kind: InventoryMetadataKind, value: string) {
		return inventoryMetadataHref(new URL(nativeUrl(requestQuery()), page.url.href), kind, value);
	}
	function filterMetadata(event: MouseEvent, kind: InventoryMetadataKind, value: string) {
		if (!isPrimaryClick(event)) return;
		event.preventDefault();
		const href = metadataHref(kind, value);
		const params = new URL(href, page.url.href).searchParams;
		selectedSets = params.getAll('set');
		selectedFinish = params.get('finish') ?? 'all';
		selectedCondition = params.get('condition') ?? 'all';
		const trigger = event.currentTarget;
		void navigatePage(href).then(() => {
			if (
				trigger instanceof HTMLElement &&
				!trigger.isConnected &&
				document.activeElement === document.body
			) {
				searchInput?.focus({ preventScroll: true });
			}
		});
	}
	async function navigatePage(href: string, replace = false) {
		pageController?.abort();
		const controller = new AbortController();
		pageController = controller;
		const next = parseBrowsePagination(new URL(href, page.url.href).searchParams, 1_000_000);
		const input = { ...requestQuery(), offset: next.offset, limit: next.limit };
		browse = next;
		requestedServerQuery = input;
		lastBrowseSearch = new URL(href, page.url.href).search;
		try {
			await goto(href, { replace, reset: false, shallow: true });
			await window.open(windowAccount, input, controller.signal, 'lazy');
			if (controller.signal.aborted || pageController !== controller) return;
			requestedServerQuery = null;
			await tick();
			if (controller.signal.aborted) return;
			await restoreNativeOffset(next.offset);
		} catch (cause) {
			if (!controller.signal.aborted)
				mutationError =
					cause instanceof Error
						? language.message(cause.message)
						: language.t('ui.Could.not.load.this.page');
		} finally {
			if (pageController === controller) pageController = null;
		}
	}
	function lazyRange(start: number, end: number, directory = false, reveal = false) {
		if (!directory) window.plan(start, end, reveal);
		if (!hydrated || pageController || anchorRestoreActive) return;
		const anchorIndex = directory
			? start
			: untrack(() => virtualList?.anchor().index ?? browse.offset);
		const anchorPage = Math.floor(anchorIndex / browse.limit) + 1;
		if (anchorPage === browse.page) return;
		browse = parseBrowsePagination(
			new URLSearchParams({ pageSize: 'lazy', page: String(anchorPage) })
		);
		const href = browsePaginationHref(new URL(effectiveInventoryUrl(page).href), browse);
		lastBrowseSearch = new URL(href, page.url.href).search;
		void goto(href, {
			replace: true,
			reset: false,
			shallow: true
		});
	}
	$effect(() => {
		if (!hydrated || requestedServerQuery) return;
		const total = groupDirectory ? currentWindow.groupCount : currentWindow.matching.entryCount;
		const clamped = clampBrowsePagination(browse, total);
		if (clamped.page !== browse.page)
			untrack(() => {
				void navigatePage(
					browsePaginationHref(new URL(effectiveInventoryUrl(page).href), clamped),
					true
				);
			});
	});

	$effect(() => {
		if (!hydrated) return;
		const input = requestQuery();
		if (requestedServerQuery) {
			if (matchingNativeInventoryQuery(requestedServerQuery, input)) return;
			untrack(() => {
				requestedServerQuery = null;
				inventorySubscription?.invalidate();
			});
		}
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
					const typing = input.q !== currentWindow.query.q;
					await window.open(account, input, controller.signal, 'lazy');
					if (controller.signal.aborted) return;
					browse = parseBrowsePagination(
						new URLSearchParams({ pageSize: String(browse.pageSize) })
					);
					const href = nativeUrl(input);
					lastBrowseSearch = new URL(href, page.url.href).search;
					await goto(href, { replace: typing, reset: false, shallow: true });
				} catch (cause) {
					if (!controller.signal.aborted)
						mutationError =
							cause instanceof Error
								? language.message(cause.message)
								: language.t('ui.Could.not.apply.filters');
				}
			})();
		}, 200);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	$effect(() => {
		if (!hydrated) return;
		const visibleSearch = effectiveInventoryUrl(page).search;
		untrack(() => {
			if (visibleSearch === lastBrowseSearch) return;
			lastBrowseSearch = visibleSearch;
			const params = new URLSearchParams(visibleSearch);
			browse = parseBrowsePagination(params, 1_000_000);
			query = params.get('q') ?? '';
			selectedSets = [...new Set(params.getAll('set').map((value) => value.toLowerCase()))].sort();
			selectedFinish = params.get('finish') ?? 'all';
			selectedCondition = params.get('condition') ?? 'all';
			const sort = params.get('sort');
			const variant = params.get('variant');
			order = {
				base: sort === 'set' || sort === 'newest' ? sort : 'name',
				direction: params.get('dir') === 'desc' ? 'desc' : 'asc',
				variant:
					variant === 'finish' || variant === 'condition' || variant === 'quantity'
						? { column: variant, direction: params.get('variantDir') === 'desc' ? 'desc' : 'asc' }
						: null
			};
			requestedServerQuery = { ...requestQuery(), offset: browse.offset };
			inventorySubscription?.invalidate();
		});
	});

	async function restoreNativeOffset(
		offset: number,
		leaseCurrent: () => boolean = inventorySubscription?.publication() ?? (() => true)
	) {
		const identity = window.identity;
		const account = page.data.user?.accountId;
		const isCurrent = () =>
			leaseCurrent() &&
			hydrated &&
			window.identity === identity &&
			page.data.user?.accountId === account;
		if (!isCurrent()) return;
		// The hydrated child is created in this flush; reading its binding before tick loses the native offset.
		await tick();
		if (!isCurrent()) return;
		if (offset === 0) restoreInitialBrowsePosition(globalThis.window, 0, 0, 0);
		else if (groupDirectory) await groupList?.scrollToIndex(offset, 0, isCurrent);
		else await virtualList?.scrollToIndex(offset, 0, isCurrent);
	}

	let refreshController: AbortController | null = null;
	async function refreshInventory(
		expectedAccount = page.data.user?.accountId ?? 'session',
		lease?: ReadLease
	) {
		if (!lease) {
			inventorySubscription?.invalidate();
			return;
		}
		const queryLifetime = effectiveInventoryUrl(page).search;
		const controlQuery = requestQuery();
		const currentLease = () =>
			lease.current() &&
			hydrated &&
			queryLifetime === effectiveInventoryUrl(page).search &&
			matchingNativeInventoryQuery(controlQuery, requestQuery()) !== null;
		if (!currentLease()) return;
		if (!hydrated || expectedAccount !== (page.data.user?.accountId ?? 'session')) return;
		const controller = new AbortController();
		refreshController = controller;
		const account = expectedAccount;
		const pendingQuery = matchingNativeInventoryQuery(requestedServerQuery, controlQuery);
		const serverQuery = pendingQuery ? { ...pendingQuery, offset: browse.offset } : null;
		const anchor = serverQuery ? null : virtualList?.anchor();
		anchorController?.abort();
		anchorController = null;
		anchorRestoreActive = true;
		try {
			const identity = await window.refresh(
				account,
				lease.signal,
				currentLease,
				serverQuery ??
					matchingNativeInventoryQuery(window.current?.query ?? null, controlQuery) ??
					controlQuery,
				'lazy'
			);
			if (
				!currentLease() ||
				!identity ||
				controller.signal.aborted ||
				window.identity !== identity ||
				account !== (page.data.user?.accountId ?? 'session')
			)
				return;
			privateCleared = false;
			if (serverQuery && requestedServerQuery === pendingQuery) requestedServerQuery = null;
			await refreshTargets(currentLease);
			if (!currentLease()) return;
			if (anchor?.id) await restoreAnchor(anchor.id, anchor.intra, anchor.index, currentLease);
			else await restoreNativeOffset(window.current?.query.offset ?? 0, currentLease);
		} finally {
			if (refreshController === controller) {
				refreshController = null;
				if (!anchorController) anchorRestoreActive = false;
			}
		}
	}

	async function restoreAnchor(
		id: string,
		intra = 0,
		fallbackIndex = 0,
		leaseCurrent: () => boolean = inventorySubscription?.publication() ?? (() => true)
	) {
		if (!leaseCurrent()) return false;
		anchorController?.abort();
		const controller = new AbortController();
		anchorController = controller;
		anchorRestoreActive = true;
		try {
			const location = await window.locateAndLoad(
				id,
				async (query, entryId, revision, signal) => {
					const response = await fetch(
						`/api/v1/mtg/inventory/${entryId}/location?${inventoryUrl(query, revision)}`,
						{ signal }
					);
					if (response.status === 401 && leaseCurrent()) {
						workspaceSavedState.expire();
						throw Error(language.t('ui.Authentication.required'));
					}
					const result = await response.json();
					if (!response.ok && result.kind !== 'RevisionChanged')
						throw Error(language.t('ui.Could.not.restore.the.inventory.position'));
					return result;
				},
				controller.signal,
				leaseCurrent
			);
			if (
				!leaseCurrent() ||
				!location ||
				controller.signal.aborted ||
				window.identity !== location.identity
			)
				return false;
			const index =
				location.index ??
				Math.min(fallbackIndex, Math.max(0, (window.current?.matching.entryCount ?? 0) - 1));
			await virtualList?.scrollToIndex(
				index,
				location.index === null ? 0 : intra,
				() => leaseCurrent() && !controller.signal.aborted && window.identity === location.identity
			);
			if (!leaseCurrent() || controller.signal.aborted || window.identity !== location.identity)
				return false;
			const addressed = parseBrowsePagination(
				new URLSearchParams({
					pageSize: String(browse.pageSize),
					page: String(Math.floor(index / browse.limit) + 1)
				}),
				1_000_000
			);
			if (addressed.page !== browse.page) {
				browse = addressed;
				const href = browsePaginationHref(new URL(effectiveInventoryUrl(page).href), browse);
				lastBrowseSearch = new URL(href, page.url.href).search;
				await goto(href, { replace: true, reset: false, shallow: true });
			}
			return !controller.signal.aborted && window.identity === location.identity;
		} catch (cause) {
			if (!controller.signal.aborted)
				mutationError =
					cause instanceof Error
						? language.message(cause.message)
						: language.t('ui.Could.not.restore.the.inventory.position');
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
		if (anchorRestoreActive) return;
		untrack(() => {
			const anchor = anchorRestoreActive ? null : (revisionAnchor ?? virtualList?.anchor());
			revisionAnchor = null;
			if (anchor?.id) void restoreAnchor(anchor.id, anchor.intra, anchor.index);
			void refreshTargets().catch((cause) => {
				if (workspaceSavedState.isActive(windowAccount))
					mutationError =
						cause instanceof Error
							? language.message(cause.message)
							: language.t('ui.Saved.entry.details.are.unavailable');
			});
		});
	});
	let targetEntries = $state<Record<string, InventoryCard>>({}),
		notesDraft = $state(''),
		notesBase = $state('0'),
		notesOriginal = $state(''),
		quantityBase = $state(1),
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
		async (id) => {
			const response = await fetch(`/api/v1/mtg/inventory/${id}`);
			return response;
		},
		(id, entry) => {
			if (!entry) {
				if (id === inspection?.entryId) targetGone = true;
				delete targetEntries[id];
				return;
			}
			targetEntries[id] = asLegacy(entry);
			if (id === inspection?.entryId) {
				targetGone = false;
				if (notesDraft === notesOriginal) {
					notesDraft = entry.notes;
					notesBase = entry.notesRevision;
					notesOriginal = entry.notes;
				}
				if (quantityDraft === quantityBase) {
					quantityBase = entry.quantity;
					quantityDraft = entry.quantity;
				}
			}
		},
		() => workspaceSavedState.expire()
	);
	function refreshTargets(
		current: () => boolean = inventorySubscription?.publication() ?? (() => true)
	) {
		return targetReads.refresh(current);
	}

	function retainTargetEntries() {
		const ids = new Set([inspection?.entryId, removeId, assigningEntryId, pendingId]);
		for (const id of Object.keys(targetEntries)) if (!ids.has(id)) delete targetEntries[id];
	}
	$effect(() => {
		if (!hydrated) return;
		const targetIds = new Set([inspection?.entryId, removeId, assigningEntryId, pendingId]);
		const retained = new Set([...inventoryCards.map((entry) => entry.id), ...targetIds]);
		untrack(() => {
			for (const id of Object.keys(rowMenuRefs)) if (!retained.has(id)) delete rowMenuRefs[id];
			retainTargetEntries();
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
		deletingGroup = null;
		editingGroup = { group };
	}
	function removeGroup(group: InventoryGroup, trigger: HTMLElement | null) {
		groupReturnTarget = trigger;
		groupDeletion.error = '';
		editingGroup = null;
		deletingGroup = group;
	}
	function assignGroups(entryId: string) {
		groupReturnTarget = rowMenuRefs[entryId] ?? searchInput;
		targetEntries[entryId] = inventoryCards.find((e) => e.id === entryId)!;
		assigningLifetime++;
		assigningEntryId = entryId;
		retainTargetEntries();
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
			.sort(
				(a, b) => a.label.localeCompare(b.label, language.locale) || a.value.localeCompare(b.value)
			)
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
	let sortDescription = $derived(describeInventoryOrder(order, language.locale));
	$effect(() => {
		const anchor = data.viewedAt.getTime();
		const started = Date.now();
		viewedAt = data.viewedAt;
		let timer: ReturnType<typeof setTimeout>;
		const schedule = () => {
			const current = anchor + Date.now() - started;
			const utcDay = 24 * 60 * 60 * 1000;
			const untilMidnight = utcDay - (current % utcDay);
			timer = setTimeout(
				() => {
					viewedAt = new Date(anchor + Date.now() - started);
					schedule();
				},
				Math.min(60_000, untilMidnight)
			);
		};
		schedule();
		return () => clearTimeout(timer);
	});
	function openSearch(event: MouseEvent) {
		if (!isPrimaryClick(event)) return;
		event.preventDefault();
		search.open(
			undefined,
			event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined
		);
	}
	function openInspection(
		id: string,
		mode: 'details' | 'edit' | 'add',
		returnFocus: HTMLElement | null
	) {
		const card = inventoryCards.find((entry) => entry.id === id);
		if (!card) return;
		clearAdditionDrafts();
		targetEntries[id] = card;
		notesDraft = card.notes;
		notesBase = card.notesRevision;
		notesOriginal = card.notes;
		quantityBase = card.quantity;
		notesConflict = null;
		quantityDraft = card.quantity;
		draftDirty = false;
		targetGone = false;
		inspection = {
			entryId: id,
			mode,
			card: storedCardDocument(card),
			returnFocus,
			historyIdentity: {
				printingId: card.catalogCardId,
				finish: card.finish as HistoricalHoldingIdentity['finish'],
				condition: card.condition as HistoricalHoldingIdentity['condition']
			}
		};
		retainTargetEntries();
	}
	function openRemoval(id: string) {
		mutationError = '';
		removalReturnTarget = rowMenuRefs[id] ?? searchInput;
		targetEntries[id] = inventoryCards.find((e) => e.id === id)!;
		removeLifetime++;
		removeId = id;
		retainTargetEntries();
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
		const write = inventorySubscription?.beginWrite();
		const id = String(formData.get('entryId'));
		const card = inventoryCards.find((entry) => entry.id === id);
		const submitted = {
			id,
			notes: String(formData.get('notes') ?? ''),
			quantity: Number(formData.get('quantity'))
		};
		const submittedAccount = page.data.user?.accountId ?? 'session';
		const submittedOpening = inspection;
		const currentAttempt = () =>
			(write?.current() ?? true) &&
			hydrated &&
			submittedAccount === (page.data.user?.accountId ?? 'session');
		const currentEditor = () =>
			currentAttempt() &&
			inspection === submittedOpening &&
			inspection?.entryId === id &&
			formData.has('notes');
		const removing = action.searchParams.has('/remove');
		pendingId = id;
		status = 'Saving…';
		mutationError = '';
		return async ({ result, update }) => {
			try {
				if (result.type === 'success') {
					pendingRequests.delete(payload);
					if (hydrated && submittedAccount === (page.data.user?.accountId ?? 'session'))
						confirmedInventoryWrite++;
					if (!currentAttempt()) return;
					if (currentEditor() && result.data?.acknowledgement) {
						const bases = confirmedInventoryBases(
							formData,
							result.data
								.acknowledgement as import('@spellbook/contracts/inventory.ts').InventoryAcknowledgement,
							{ notesOriginal, notesBase, quantityBase }
						);
						notesOriginal = bases.notesOriginal;
						notesBase = bases.notesBase;
						quantityBase = bases.quantityBase;
					}
					const index = listCards.findIndex((entry) => entry.id === id);
					const neighbor = listCards[index + 1] ?? listCards[index - 1];
					const focus = document.activeElement;
					await update({ reset: false, refreshAll: false, navigate: false });
					if (focus instanceof HTMLElement && focus.isConnected)
						focus.focus({ preventScroll: true });
					if (!currentAttempt()) return;
					if (
						!removing &&
						currentEditor() &&
						submittedDraftMatches(submitted, {
							id: inspection?.entryId,
							notes: notesDraft,
							quantity: quantityDraft
						})
					)
						draftDirty = false;
					await refreshInventory(submittedAccount);
					if (!currentAttempt()) return;
					if (removing) {
						if (neighbor) await restoreAnchor(neighbor.id);
						await tick();
						removalReturnTarget = rowMenuRefs[neighbor?.id ?? ''] ?? searchInput ?? emptyAction;
						removeId = null;
					}
					status = removing
						? language.t('message.p0.removed', { p0: String(card?.name ?? language.t('ui.Entry')) })
						: language.t('message.p0.saved', {
								p0: String(card?.name ?? language.t('ui.Quantity'))
							});
				} else if (result.type === 'redirect') {
					await update();
				} else {
					if (!currentAttempt()) return;
					if (currentEditor() && result.type === 'failure' && result.data?.latestNotes)
						notesConflict = result.data.latestNotes as { notes: string; notesRevision: string };
					mutationError =
						result.type === 'failure' && typeof result.data?.message === 'string'
							? result.data.message
							: language.t('ui.Could.not.save.this.change.Try.again');
					status = '';
					if (removing) await refreshTargets();
				}
			} catch {
				if (!currentAttempt()) return;
				mutationError = language.t('ui.Could.not.refresh.inventory.Reload.before.trying.again');
				status = '';
			} finally {
				write?.complete();
				pendingId = null;
			}
		};
	};
</script>

{#snippet addIcon()}<PlusIcon />{/snippet}

<svelte:head><title>{language.t('ui.Inventory.Spellbook')}</title></svelte:head>

{#if privateCleared}<div class="workspace-container">
		<SavedStateStatus resource={inventorySubscription} />
		<p>{language.t('ui.Sign.in.again.to.load.Inventory')}</p>
	</div>{:else}
	<div class="inventory-page workspace-container">
		<SavedStateStatus resource={inventorySubscription} />
		{#if notesRecovery}
			<section aria-labelledby="notes-recovery-title" class="inspector-form">
				<h2 id="notes-recovery-title">{language.t('ui.Your.unsaved.Notes')}</h2>
				<p role="alert">{language.message(form?.message)}</p>
				{#if latestNotes}<p>
						{language.t('ui.Latest.saved.Notes')}
						{latestNotes.notes || '(empty)'}
					</p>{/if}
				<form method="POST" action={inventoryAction('updateQuantity', effectiveInventoryUrl(page))}>
					<input type="hidden" name="entryId" value={notesRecovery.entryId} />
					<input type="hidden" name="requestId" value={notesRecovery.requestId} />
					<input type="hidden" name="rebaseRequestId" value={data.requestId} />
					<input type="hidden" name="notesRevision" value={notesRecovery.notesRevision} /><input
						type="hidden"
						name="notesOriginal"
						value={notesRecovery.notesOriginal}
					/><input type="hidden" name="quantityBase" value={notesRecovery.quantityBase} />
					<label for="recovered-quantity">{language.t('ui.Owned.quantity')}</label><input
						id="recovered-quantity"
						name="quantity"
						type="number"
						min="1"
						step="1"
						value={notesRecovery.quantity}
					/>
					<label for="recovered-notes">{language.t('ui.Notes.draft')}</label><textarea
						id="recovered-notes"
						name="notes">{notesRecovery.notes}</textarea
					>
					{#if latestNotes}<button
							class="btn btn-primary"
							name="rebaseNotesRevision"
							value={latestNotes.notesRevision}
							>{language.t('ui.Save.my.draft.against.the.latest.revision')}</button
						>{:else}<button class="btn btn-primary">{language.t('ui.Retry.Save')}</button>{/if}
				</form>
			</section>
		{/if}

		{#if currentWindow.query.view === 'groups'}<noscript
				><section aria-labelledby="native-groups-title">
					<h2 id="native-groups-title">{language.t('ui.Manage.Boxes')}</h2>
					<form method="POST" action={inventoryAction('createGroup', effectiveInventoryUrl(page))}>
						<input type="hidden" name="requestId" value={data.requestId} /><label
							for="native-group-name">{language.t('ui.New.box.name')}</label
						><input id="native-group-name" name="name" required maxlength="128" /><button
							class="btn btn-primary"><PlusIcon />{language.t('ui.Create.box')}</button
						>
					</form>
					{#each currentWindow.groupPage as group}<form
							method="POST"
							action={inventoryAction('renameGroup', effectiveInventoryUrl(page))}
						>
							<input type="hidden" name="requestId" value={data.requestId} /><input
								type="hidden"
								name="groupId"
								value={group.id}
							/><label for={`native-group-${group.id}`}
								>{language.t('ui.Rename')} {group.name}</label
							><input
								id={`native-group-${group.id}`}
								name="name"
								value={group.name}
								required
								maxlength="128"
							/><button class="btn btn-secondary">{language.t('ui.Save.name')}</button>
						</form>
						<form
							method="POST"
							action={inventoryAction('deleteGroup', effectiveInventoryUrl(page))}
						>
							<input type="hidden" name="requestId" value={data.requestId} /><input
								type="hidden"
								name="groupId"
								value={group.id}
							/><label
								><input type="checkbox" name="confirmDeleteGroup" value="yes" required />
								{language.t('ui.Delete')}
								{group.name}
								{language.t('ui.and.its.memberships.keeping.every.owned.card')}</label
							><button class="btn btn-secondary">{language.t('ui.Delete.box')}</button>
						</form>{/each}
				</section></noscript
			>{/if}

		<WorkspaceHeader title={language.t('ui.Inventory')}>
			{#snippet metadata()}<p class="inventory-totals">
					<strong>{currentWindow.totals.copyCount.toLocaleString(language.locale)}</strong>
					{language.t('ui.cards')}
					<span>·</span>
					<strong>{currentWindow.totals.canonicalCardCount.toLocaleString(language.locale)}</strong>
					{language.t('ui.card.names')} <span>·</span>
					<strong>{currentWindow.totals.setCount}</strong>
					{language.t('ui.sets')}
				</p>{/snippet}
			{#snippet actions()}{#if groupDirectory}<Button
						onclick={(event) => editGroup(null, event.currentTarget)}
						><PlusIcon />{language.t('ui.New.box')}</Button
					>{:else if selectedGroup}<Button variant="secondary" href={viewHref('cards')}
						>{language.t('ui.Assign.cards')}</Button
					>{:else}<Button href="/mtg/search" onclick={openSearch}
						><PlusIcon />{language.t('ui.Add.cards')}</Button
					>{/if}{/snippet}
		</WorkspaceHeader>
		<noscript
			><form
				method="GET"
				class="native-inventory-filters"
				aria-label={language.t('ui.Inventory.filters')}
			>
				<input type="hidden" name="pageSize" value={String(browse.pageSize)} /><input
					type="hidden"
					name="page"
					value="1"
				/>
				<label
					>{language.t('ui.Search')}<input
						class="input"
						type="search"
						name="q"
						value={data.window.query.q}
					/></label
				><label
					>{language.t('ui.Sets')}<select class="input" name="set" multiple
						>{#each data.window.sets as set}<option
								value={set.code}
								selected={data.window.query.sets.includes(set.code)}>{set.name}</option
							>{/each}</select
					></label
				><label
					>{language.t('ui.Finish')}<select class="input" name="finish"
						>{#each finishOptions as option}<option
								value={option.value}
								selected={data.window.query.finish === option.value}>{option.label}</option
							>{/each}</select
					></label
				><label
					>{language.t('ui.Condition')}<select class="input" name="condition"
						>{#each conditionOptions as option}<option
								value={option.value}
								selected={data.window.query.condition === option.value}>{option.label}</option
							>{/each}</select
					></label
				><label
					>{language.t('ui.Sort')}<select class="input" name="sort"
						>{#each ['name', 'set', 'newest'] as value}<option
								{value}
								selected={data.window.query.sort === value}
								>{language.t(
									(
										{
											name: 'ui.Name',
											set: 'ui.Set',
											newest: 'ui.Newest',
											finish: 'ui.Finish',
											condition: 'ui.Condition',
											quantity: 'ui.Quantity'
										} as const
									)[value as 'name']
								)}</option
							>{/each}</select
					></label
				><label
					>{language.t('ui.Direction')}<select class="input" name="dir"
						><option value="asc" selected={data.window.query.dir === 'asc'}
							>{language.t('ui.Ascending')}</option
						><option value="desc" selected={data.window.query.dir === 'desc'}
							>{language.t('ui.Descending')}</option
						></select
					></label
				><label
					>{language.t('ui.Variant')}<select class="input" name="variant"
						><option value="">{language.t('ui.None')}</option
						>{#each ['finish', 'condition', 'quantity'] as value}<option
								{value}
								selected={data.window.query.variant === value}
								>{language.t(
									(
										{
											name: 'ui.Name',
											set: 'ui.Set',
											newest: 'ui.Newest',
											finish: 'ui.Finish',
											condition: 'ui.Condition',
											quantity: 'ui.Quantity'
										} as const
									)[value as 'name']
								)}</option
							>{/each}</select
					></label
				><label
					>{language.t('ui.Variant.direction')}<select class="input" name="variantDir"
						><option value="asc" selected={data.window.query.variantDir === 'asc'}
							>{language.t('ui.Ascending')}</option
						><option value="desc" selected={data.window.query.variantDir === 'desc'}
							>{language.t('ui.Descending')}</option
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
					/>{/if}<Button type="submit">{language.t('ui.Apply.filters')}</Button>
			</form></noscript
		>
		<nav class="inventory-views" aria-label={language.t('ui.Inventory.views')}>
			<a
				href={viewHref('cards')}
				class:active={!(currentWindow.query.view === 'groups')}
				aria-current={!(currentWindow.query.view === 'groups') ? 'page' : undefined}
				>{language.t('ui.Cards')}</a
			><a
				bind:this={groupLink}
				href={viewHref('groups')}
				class:active={currentWindow.query.view === 'groups'}
				aria-current={currentWindow.query.view === 'groups' ? 'page' : undefined}
				>{language.t('ui.Boxes')}</a
			>
		</nav>
		{#if selectedGroup}<div class="selected-group">
				<a href={viewHref('groups')}>{language.t('ui.All.boxes')}</a><span aria-hidden="true"
					>/</span
				><strong>{selectedGroup.name}</strong>
			</div>{/if}
		{#if !removeId && (mutationError || form?.message)}<p class="mutation-error" role="alert">
				{mutationError || form?.message}
			</p>{/if}
		{#if groupDirectory}
			{#key window.queryIdentity}<GroupDirectory
					bind:this={groupList}
					groups={hydrated
						? currentWindow.groups.filter(
								(group) =>
									!currentWindow.query.q ||
									group.name.toLowerCase().includes(currentWindow.query.q.toLowerCase())
							)
						: currentWindow.groupPage}
					lazy={hydrated}
					initialIndex={currentWindow.query.offset}
					onRange={(index) => lazyRange(index, index + 1, true)}
					canonicalURL={new URL(effectiveInventoryUrl(page).href)}
					dialogOpen={editingGroup !== null || deletingGroup !== null}
					onRename={editGroup}
					onRemove={removeGroup}
				/>{/key}
		{:else if currentWindow.totals.entryCount === 0}
			<div class="empty-state">
				<p>{language.t('ui.No.cards.yet')}</p>
				<a bind:this={emptyAction} href="/mtg/search" onclick={openSearch} class="btn btn-secondary"
					>{language.t('ui.Find.your.first.card')}</a
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
						aria-label={language.t('ui.Search.inventory')}
						onkeydown={(event) => {
							if (event.key !== 'Enter') return;
							event.preventDefault();
							void navigatePage(nativeUrl(requestQuery()));
						}}
						bind:value={query}
						placeholder={language.t('ui.Search.inventory')}
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
							<label class="label" for="inventory-set-search">{language.t('ui.Sets')}</label><button
								type="button"
								class="filter-reset"
								disabled={selectedSets.length === 0}
								onclick={() => (selectedSets = [])}>{language.t('ui.Clear')}</button
							>
						</div>
						<input
							bind:this={setSearchInput}
							bind:value={setQuery}
							id="inventory-set-search"
							type="search"
							class="input"
							placeholder={language.t('ui.Find.a.set.by.name.or.code')}
						/>
						<div class="set-options">
							{#each visibleSets as option (option.value)}
								<label class="set-option"
									><input
										type="checkbox"
										checked={selectedSets.includes(option.value)}
										onchange={() => toggleSet(option.value)}
									/><span>{option.label}</span><small>{option.value.toUpperCase()}</small></label
								>
							{:else}<p class="no-sets">{language.t('ui.No.sets.match.this.search')}</p>{/each}
						</div>
						<div class="variant-filters">
							<div>
								<label class="label" for="inventory-finish-filter">{language.t('ui.Finish')}</label
								><Select
									id="inventory-finish-filter"
									label={language.t('ui.Filter.by.finish')}
									bind:triggerRef={finishTrigger}
									bind:value={selectedFinish}
									options={finishOptions}
								/>
							</div>
							<div>
								<label class="label" for="inventory-condition-filter"
									>{language.t('ui.Condition')}</label
								><Select
									id="inventory-condition-filter"
									label={language.t('ui.Filter.by.condition')}
									bind:triggerRef={conditionTrigger}
									bind:value={selectedCondition}
									options={conditionOptions}
								/>
							</div>
						</div>
					</div>
				</FilterPopover>
				<ActionMenu
					label={language.t('ui.Sort.inventory')}
					variant="toolbar"
					items={[
						{
							label: language.t('ui.Card.name.A.to.Z'),
							onSelect: () => (order = nextInventoryOrder(order, 'name', 'asc'))
						},
						{
							label: language.t('ui.Card.name.Z.to.A'),
							onSelect: () => (order = nextInventoryOrder(order, 'name', 'desc'))
						},
						{
							label: language.t('ui.Set.A.to.Z'),
							onSelect: () => (order = nextInventoryOrder(order, 'set', 'asc'))
						},
						{
							label: language.t('ui.Set.Z.to.A'),
							onSelect: () => (order = nextInventoryOrder(order, 'set', 'desc'))
						},
						{
							label: language.t('ui.Newest.first'),
							onSelect: () => (order = nextInventoryOrder(order, 'newest'))
						},
						{
							label:
								columnDirection('finish') === 'asc'
									? language.t('ui.Finish.foil.first')
									: language.t('ui.Finish.nonfoil.first'),
							onSelect: () => (order = nextInventoryOrder(order, 'finish'))
						},
						{
							label:
								columnDirection('condition') === 'asc'
									? language.t('ui.Condition.worst.first')
									: language.t('ui.Condition.best.first'),
							onSelect: () => (order = nextInventoryOrder(order, 'condition'))
						},
						{
							label:
								columnDirection('quantity') === 'asc'
									? language.t('ui.Quantity.most.first')
									: language.t('ui.Quantity.fewest.first'),
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
						>{language.t('ui.Sort')}{/snippet}
				</ActionMenu>
				<p class="inventory-result-count">
					{language.t(`entries.${language.plural(currentWindow.matching.entryCount)}`, {
						count: language.number(currentWindow.matching.entryCount)
					})} <span>·</span>
					{matchingQuantity}
					{language.t('ui.cards')}
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
								aria-label={language.t('message.Edit.set.filter.p0', { p0: String(setName(code)) })}
								>{language.t('ui.Set')} {setName(code)}</button
							><button
								type="button"
								class="filter-chip-remove"
								aria-label={language.t('message.Clear.set.filter.p0', {
									p0: String(setName(code))
								})}
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
								>{language.t('ui.Finish')}
								{selectedFinish === 'foil'
									? language.t('notice.Foil')
									: language.t('notice.Nonfoil')}</button
							><button
								type="button"
								class="filter-chip-remove"
								aria-label={language.t('message.Clear.finish.filter.p0', {
									p0: String(selectedFinish)
								})}
								onclick={() => (selectedFinish = 'all')}>×</button
							>
						</div>{/if}
					{#if selectedCondition !== 'all'}<div class="filter-chip">
							<button
								type="button"
								class="filter-chip-edit"
								onclick={(event) => editFilter('condition', event)}
								>{language.t('ui.Condition')} {selectedCondition}</button
							><button
								type="button"
								class="filter-chip-remove"
								aria-label={language.t('message.Clear.condition.filter.p0', {
									p0: String(selectedCondition)
								})}
								onclick={() => (selectedCondition = 'all')}>×</button
							>
						</div>{/if}
					<button type="button" class="clear-filters" onclick={clearFilters}
						>{language.t('ui.Clear.filters')}</button
					>
				</div>
			{/if}
			<span class="sr-only" role="status">{status}</span>
			{#if singleSet}
				<div class="set-progress">
					<p>
						{setName(singleSet)} <span>·</span>
						{setCatalogTotal !== null && setCatalogTotal > 0
							? language.t('message.p0.of.p1.card.names.owned', {
									p0: String(ownedInSet),
									p1: String(setCatalogTotal)
								})
							: language.t('message.p0.card.names.owned', { p0: String(ownedInSet) })}
						{#if setProgressLoading}<span>·</span>
							{language.t(
								'ui.Loading.set.total'
							)}{:else if setCatalogTotal === null || setCatalogTotal === 0}<span>·</span>
							{language.t('ui.Set.total.unavailable')}{/if}
					</p>
					{#if setCatalogTotal !== null && setCatalogTotal > 0}<progress
							value={Math.min(ownedInSet, setCatalogTotal)}
							max={setCatalogTotal}
							aria-label={language.t('message.p0.set.completion', {
								p0: String(setName(singleSet))
							})}
						></progress>{/if}
				</div>
			{/if}
			<h2 class="sr-only" bind:this={resultsHeading} tabindex="-1">
				{language.t('ui.Inventory.results')}
			</h2>
			<p class="sr-only" id="inventory-order" role="status">{sortDescription}</p>
			<div
				class="inventory-columns"
				role="group"
				aria-label={language.t('ui.Inventory.column.sorting')}
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
							aria-label={language.t('message.Sort.by.p0.p1', {
								p0: label,
								p1: language.t(
									columnDirection(column) === 'asc'
										? 'inventory.direction.desc'
										: 'inventory.direction.asc'
								)
							})}
							onclick={() => (order = nextInventoryOrder(order, column))}
							>{column === 'name' && order.base === 'newest' ? language.t('ui.Newest') : label}<span
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
							? language.t('ui.No.cards.in.this.box.yet.Assign.cards.from.their.row.menu.in.Cards')
							: language.t('ui.No.cards.match.these.filters')}
					</p>
					{#if hasFilters}<button class="btn btn-secondary" onclick={clearFilters}
							>{language.t('ui.Clear.filters')}</button
						>{/if}
				</div>
			{:else}
				{#snippet entryRow(card: InventoryCard)}
					{@const groupNames = entryGroupNames(card.id)}
					<div
						class="inventory-row"
						data-inventory-row={card.id}
						class:saving={pendingId === card.id}
					>
						<div class="card-cell">
							<button
								class="card-identity"
								onclick={(event) => openInspection(card.id, 'details', event.currentTarget)}
								aria-label={language.t('message.Inspect.p0.p1.p2.p3', {
									p0: String(card.name),
									p1: String(card.setCode.toUpperCase()),
									p2: String(card.finish),
									p3: String(card.condition)
								})}
								aria-describedby={isNewInventoryEntry(card.createdAt, asOf)
									? `inventory-new-${card.id}`
									: undefined}
								><img src={card.imageUri} alt="" width="40" height="56" loading="lazy" /><span
									><span class="card-name"
										><strong>{card.name}</strong
										>{#if isNewInventoryEntry(card.createdAt, asOf)}<span
												class="new-entry"
												id={`inventory-new-${card.id}`}
												title={language.t(
													'message.Added.p0.UTC.New.until.the.end.of.this.UTC.date',
													{ p0: String(addedDate.format(card.createdAt)) }
												)}
												>{language.t('ui.New')}<span class="sr-only"
													>{language.t(
														'sentence.entry.added.p0.UTC.marked.new.until.the.end.of.this.UTC.date',
														{ p0: String(addedDate.format(card.createdAt)) }
													)}</span
												></span
											>{/if}</span
									>{#if groupNames}<span class="entry-groups" title={groupNames}>{groupNames}</span
										>{/if}{#if card.notes}<span class="entry-notes">{card.notes}</span>{/if}</span
								></button
							>
							<span class="mobile-metadata"
								>{@render metadata('set', card.setCode)}{@render metadata(
									'finish',
									card.finish
								)}{@render metadata('condition', card.condition)}</span
							>
							<noscript
								><a href={`/mtg/inventory/${card.id}${effectiveInventoryUrl(page).search}`}
									>{language.t('ui.Details')}</a
								></noscript
							>
						</div>
						<span class="row-metadata">{@render metadata('set', card.setCode)}</span><span
							class="row-metadata">{@render metadata('finish', card.finish)}</span
						><span class="row-metadata">{@render metadata('condition', card.condition)}</span>
						<span
							class="owned-quantity"
							aria-label={language.t('message.p0.owned.copies', { p0: String(card.quantity) })}
							>{card.quantity}</span
						>
						<ActionMenu
							label={language.t('message.Actions.for.p0.p1.p2.p3', {
								p0: String(card.name),
								p1: String(card.setCode.toUpperCase()),
								p2: String(card.finish),
								p3: String(card.condition)
							})}
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
									label: language.t('ui.Edit'),
									disabled: pendingId !== null,
									onSelect: () =>
										openInspection(card.id, 'edit', rowMenuRefs[card.id] ?? searchInput)
								},
								{
									label: language.t('ui.Add.another.printing'),
									icon: addIcon,
									disabled: pendingId !== null,
									onSelect: () =>
										openInspection(card.id, 'add', rowMenuRefs[card.id] ?? searchInput)
								},
								{
									label: language.t('ui.Boxes'),
									disabled: pendingId !== null,
									onSelect: () => assignGroups(card.id)
								},
								{
									label: language.t('ui.Remove'),
									destructive: true,
									disabled: pendingId !== null,
									onSelect: () => openRemoval(card.id)
								}
							]}
						/>
					</div>{/snippet}
				{#if hydrated}{#if visitedSpan.start > 0}<button
							class="btn btn-secondary"
							onclick={() => window.loadEarlier()}>{language.t('ui.Load.earlier.entries')}</button
						>{/if}<VirtualInventoryList
						bind:this={virtualList}
						total={currentWindow.matching.entryCount}
						span={visitedSpan}
						queryKey={window.queryIdentity}
						version={windowVersion}
						initialIndex={currentWindow.query.offset}
						loadedIndexes={loadedEntries.map((row) => row.index)}
						pinnedIndexes={pins}
						getEntry={(index) => window.at(index)}
						onRange={(start, end, reveal) => lazyRange(start, end, false, reveal)}
					>
						{#snippet row(entry: InventoryEntry)}{@render entryRow(asLegacy(entry))}{/snippet}
					</VirtualInventoryList>{:else}<ul
						class="inventory-list"
						aria-label={language.t('ui.Inventory.entries')}
					>
						{#each nativeCards as card (card.id)}<li>
								{@render entryRow(card)}
							</li>{/each}
					</ul>{/if}
			{/if}
		{/if}
		{#if requestedServerQuery}<p role="status">
				{language.t('ui.Loading.the.selected.inventory.page')}
			</p>{/if}
		<NativeRangeNavigation
			state={browse}
			total={groupDirectory ? currentWindow.groupCount : currentWindow.matching.entryCount}
			canonicalURL={new URL(effectiveInventoryUrl(page).href)}
			native={!hydrated}
		/>
		<div
			hidden
			data-inventory-span-start={metrics.spanStart}
			data-inventory-span-end={metrics.spanEnd}
			data-inventory-cache-pages={metrics.pages}
			data-inventory-cache-entries={metrics.entries}
			data-inventory-contexts={metrics.contexts}
			data-inventory-cache-bytes={metrics.serializedBytes}
			data-inventory-byte-overflow={metrics.byteOverflow}
			data-inventory-metadata-overflow={metrics.metadataOverflow}
			data-inventory-requests={metrics.requests}
			data-inventory-reference-count={Object.keys(rowMenuRefs).length}
			data-inventory-target-count={Object.keys(targetEntries).length}
			data-inventory-pinned-ssr-pages={metrics.pinnedSSRPages}
			data-inventory-pinned-ssr-entries={metrics.pinnedSSREntries}
		></div>
		{#if hydrated && window.error}<p role="alert">
				{language.message(window.error)}<Button
					variant="secondary"
					onclick={() =>
						window.plan(
							virtualList?.anchor().index ?? currentWindow.query.offset,
							(virtualList?.anchor().index ?? currentWindow.query.offset) + browse.limit
						)}>{language.t('ui.Try.again')}</Button
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
		title={language.t('ui.Delete.this.box')}
		description={language.t(
			'message.Delete.p0.Your.cards.stay.in.inventory.only.this.box.s.assignments.are.removed',
			{ p0: String(deletingGroup?.name ?? '') }
		)}
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
				type="submit">{groupDeletion.pending ? 'Deleting...' : language.t('ui.Delete.box')}</button
			>
		</form>
	</ConfirmationDialog>

	<ConfirmationDialog
		open={removeId !== null}
		title={language.t('ui.Remove.this.entry')}
		description={removing
			? language.t(
					'message.This.removes.p0.p1.p2.of.p3.p4.p5.p6.from.your.inventory.It.cannot.be.undone',
					{
						p0: String(removing.quantity > 1 ? 'all ' : ''),
						p1: String(removing.quantity),
						p2: String(
							removing.quantity === 1 ? language.t('unit.copy') : language.t('unit.copies')
						),
						p3: String(removing.name),
						p4: String(removing.setCode.toUpperCase()),
						p5: String(
							removing.finish === 'foil' ? language.t('notice.Foil') : language.t('notice.Nonfoil')
						),
						p6: String(removing.condition)
					}
				)
			: ''}
		pending={pendingId !== null}
		error={language.message(mutationError)}
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
				>{pendingId === removeId ? 'Removing…' : language.t('ui.Remove')}</button
			>
		</form>
	</ConfirmationDialog>

	{#if inspection}
		<CardDetail
			card={inspection.card}
			inventoryEntryId={inspection.mode === 'add' ? undefined : inspection.entryId}
			inventoryHistoryIdentity={inspection.mode === 'add' ? undefined : inspection.historyIdentity}
			callerPending={pendingId !== null || addingPending}
			onPendingChange={(value) => (addingPending = value)}
			inventoryPriceRefreshKey={`${confirmedInventoryWrite}:${currentWindow.revision}:${inspected?.updatedAt.toISOString() ?? 'missing'}:${targetGone}`}
			returnFocus={inspection.returnFocus}
			actions={inspectionActions}
			onClose={() => {
				const id = inspection?.entryId;
				inspection = null;
				clearAdditionDrafts();
				if (id)
					void restoreAnchor(id).then((restored) => {
						if (!restored) return;
						(rowMenuRefs[id] ?? searchInput)?.focus({ preventScroll: true });
					});
			}}
		/>
		{#snippet inspectionActions(activeCard: CardDocument)}
			<nav aria-label={language.t('ui.Card.task')} class="inspection-tasks">
				<Button
					variant="secondary"
					disabled={pendingId !== null || addingPending}
					onclick={() => {
						if (inspection) inspection.mode = 'details';
					}}>{language.t('ui.Details')}</Button
				>
				<Button
					variant="secondary"
					disabled={pendingId !== null || addingPending || targetGone}
					onclick={() => {
						if (inspection) inspection.mode = 'edit';
					}}>{language.t('ui.Edit.owned.entry')}</Button
				>
				<Button
					variant="secondary"
					disabled={pendingId !== null || addingPending}
					onclick={() => {
						if (inspection) inspection.mode = 'add';
					}}><PlusIcon />{language.t('ui.Add.another.printing')}</Button
				>
			</nav>
			{#if inspection?.mode === 'add'}
				<CardQuickAdd
					card={activeCard}
					draft={inventoryAdditionDraft}
					actionRole="primary"
					callerPending={pendingId !== null}
					onPendingChange={(value) => (addingPending = value)}
				/>
			{:else if inspection?.mode === 'details'}
				<CardBrowsingActions
					card={activeCard}
					deckDraft={deckAdditionDraft}
					inventoryDraft={inventoryAdditionDraft}
					onPendingChange={(value) => (addingPending = value)}
				/>
			{/if}
			{#if inspection?.mode === 'edit'}{@render editEntryActions(activeCard)}
			{:else if inspection?.mode === 'details'}<p>
					{language.t('sentence.p0.owned.copies.p1.p2', {
						p0: String(inspected?.quantity ?? quantityBase),
						p1: String(inspected?.finish ?? ''),
						p2: String(inspected?.condition ?? '')
					})}
				</p>
				{#if notesDraft !== notesOriginal || quantityDraft !== quantityBase}<p>
						{language.t('ui.Unsaved.entry.edits.retained')}
					</p>{/if}{#if inspected?.notes}<p>{inspected.notes}</p>{/if}{/if}
		{/snippet}
		{#snippet editEntryActions(activeCard: CardDocument)}
			{#if targetGone}<p role="alert">
					{language.t('ui.This.entry.was.removed.Your.unsaved.notes.are.retained')}
				</p>
				<label class="label" for="removed-notes">{language.t('ui.Unsaved.Notes')}</label><textarea
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
					<input type="hidden" name="notesOriginal" value={notesOriginal} /><input
						type="hidden"
						name="quantityBase"
						value={quantityBase}
					/>
					<input type="hidden" name="entryId" value={inspected.id} />
					<p>
						{inspected.setCode.toUpperCase()} · {inspected.finish === 'foil'
							? language.t('notice.Foil')
							: language.t('notice.Nonfoil')} · {inspected.condition}
					</p>
					{#if notesConflict}<p role="alert">
							{language.t('ui.Latest.saved.Notes')}
							{notesConflict.notes || '(empty)'}
						</p>
						<button
							type="button"
							class="btn btn-secondary"
							onclick={() => {
								notesBase = notesConflict!.notesRevision;
								notesConflict = null;
							}}>{language.t('ui.Use.latest.revision.with.my.draft')}</button
						>{/if}
					<label class="label" for="inventory-quantity">{language.t('ui.Owned.quantity')}</label
					><input
						class="input"
						id="inventory-quantity"
						name="quantity"
						type="number"
						min="1"
						step="1"
						required
						bind:value={quantityDraft}
						oninput={() => (draftDirty = true)}
					/><label class="label" for="inventory-notes">{language.t('ui.Notes')}</label><textarea
						class="input"
						id="inventory-notes"
						name="notes"
						rows="2"
						bind:value={notesDraft}
						oninput={() => (draftDirty = true)}></textarea><button
						type="submit"
						class="btn btn-primary"
						disabled={pendingId !== null || targetGone}
						>{pendingId === inspected.id ? 'Saving…' : language.t('ui.Save')}</button
					>{#if mutationError}<p class="mutation-error" role="alert">
							{language.message(mutationError)}
						</p>{:else}<p class="text-sm text-text-muted" role="status">
							{status}
						</p>{/if}
				</form>
			{:else}<a
					class="btn btn-secondary"
					href={`/mtg/search?q=${encodeURIComponent(activeCard.name)}`}
					>{language.t('ui.Find.this.card.in.Search')}</a
				>{/if}
		{/snippet}
	{/if}
{/if}

{#snippet metadata(kind: InventoryMetadataKind, value: string)}
	<a
		class="metadata-link"
		href={metadataHref(kind, value)}
		onclick={(event) => filterMetadata(event, kind, value)}
		aria-label={language.t('message.Filter.by.p0.p1', { p0: String(kind), p1: String(value) })}
	>
		<span
			class="metadata-frame"
			data-finish={kind === 'finish' ? value : undefined}
			data-condition={kind === 'condition' ? value : undefined}
			style={kind === 'set' ? `--metadata-color: ${inventorySetColor(value)}` : undefined}
			>{kind === 'set'
				? value.toUpperCase()
				: kind === 'finish'
					? value === 'foil'
						? language.t('notice.Foil')
						: language.t('notice.Nonfoil')
					: value}</span
		>
	</a>
{/snippet}

<style>
	.inspection-tasks {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.owned-quantity {
		text-align: right;
		font-size: 0.75rem;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
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
		min-height: 0;
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
	.metadata-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		min-height: 44px;
		border-radius: 0.25rem;
	}
	.metadata-link:hover .metadata-frame {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.metadata-link:focus-visible {
		outline: 2px solid var(--color-text-secondary);
		outline-offset: 2px;
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
		grid-template-columns: minmax(0, 1fr) 96px 112px 96px 84px 44px;
		gap: 0.75rem;
		align-items: center;
	}
	.inventory-columns {
		padding: 0 0.625rem;
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}
	.inventory-columns > .column-header:nth-child(5) {
		justify-content: flex-end;
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
	.card-cell {
		min-width: 0;
	}
	.card-identity {
		display: flex;
		width: 100%;
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
			grid-template-columns: minmax(0, 1fr) 84px 44px;
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
			padding-left: calc(40px + 0.875rem);
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
			grid-template-columns: minmax(0, 1fr) 84px;
			padding: 0.375rem 0;
			gap: 0 0.5rem;
		}
		.card-cell {
			grid-column: 1;
			grid-row: 1 / 3;
		}
		.card-identity {
			gap: 0.625rem;
		}
		.card-identity strong {
			font-size: 0.8125rem;
		}
		.mobile-metadata {
			font-size: 0.75rem;
			padding-left: calc(40px + 0.625rem);
		}
		.owned-quantity {
			grid-column: 2;
			grid-row: 1;
		}
		:global(.entry-menu) {
			grid-column: 2;
			grid-row: 2;
			justify-self: end;
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
