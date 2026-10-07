<script lang="ts">
	import { onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import SearchBar from './SearchBar.svelte';
	import SearchFilters from './SearchFilters.svelte';
	import SearchResults from './SearchResults.svelte';
	import CardDetail from '#lib/components/cards/CardDetail.svelte';
	import CardBrowsingActions from '#lib/components/cards/CardBrowsingActions.svelte';
	import { workspaceSavedState } from '#lib/saved-state/workspace.svelte.ts';
	import {
		createDeckAdditionDraft,
		createInventoryAdditionDraft
	} from '#lib/cards/addition-drafts.ts';
	import Pagination from '#lib/components/ui/pagination/Pagination.svelte';
	import { cardAt, type CatalogRange } from '#lib/search/catalogWindow.ts';
	import { getSearchSession } from '#lib/search/session.svelte.ts';
	import {
		parseSearchUrl,
		searchHref,
		searchPagination,
		type SearchInput
	} from '#lib/search/navigation.ts';
	import {
		browseScrollTop,
		restoreBrowsePosition,
		type BrowseViewport
	} from '#lib/browsing/viewport.ts';
	import { onMount, onDestroy, tick, untrack, type Snippet } from 'svelte';
	import { nativeFeedbackRange } from '#lib/search/native-panel.ts';
	import {
		getActiveFilters,
		MANA_COLORS,
		RARITIES,
		CARD_TYPES,
		LEGALITY_FORMATS
	} from '#lib/search/filter-options.ts';
	import type { CardDocument, SearchResult } from '#lib/search/types.ts';

	let {
		controls,
		viewport = null,
		serverInput,
		serverResult = null,
		serverError = null,
		canonicalHref,
		restorationTarget = null
	}: {
		controls?: Snippet;
		viewport?: BrowseViewport | null;
		serverInput?: SearchInput;
		serverResult?: SearchResult | null;
		serverError?: string | null;
		canonicalHref?: string;
		restorationTarget?: HTMLElement | null;
	} = $props();
	const session = getSearchSession();
	const filters = session.filters;
	const catalog = session.catalog;
	let deckDraft = $state(createDeckAdditionDraft());
	let inventoryDraft = $state(createInventoryAdditionDraft());
	let additionAccount = untrack(() => page.data.user?.accountId ?? null);
	let additionPending = false;
	let inspectorPending = false;
	function clearAdditionDrafts() {
		Object.assign(deckDraft, createDeckAdditionDraft());
		Object.assign(inventoryDraft, createInventoryAdditionDraft());
		additionPending = inspectorPending = false;
		session.pending = false;
	}
	function changePending(kind: 'addition' | 'inspector', pending: boolean) {
		if (kind === 'addition') additionPending = pending;
		else inspectorPending = pending;
		session.pending = additionPending || inspectorPending;
	}
	$effect(() => {
		const account = page.data.user?.accountId ?? null;
		const expired = workspaceSavedState.getState() === 'expired';
		const selected = session.selectedCard;
		untrack(() => {
			if (!selected || !account || account !== additionAccount || expired) clearAdditionDrafts();
			additionAccount = account;
		});
	});
	let mounted = $state(false);
	let windowViewport: Window | null = $state(null);
	const host = $derived(viewport ?? windowViewport);
	const input = $derived(!mounted && serverInput ? serverInput : session.input);
	const paging = $derived(input.pagination ?? searchPagination());
	const snapshot = $derived(session.snapshot);
	const total = $derived(!mounted ? (serverResult?.estimatedTotalHits ?? 0) : snapshot.total);
	const facets = $derived(!mounted ? (serverResult?.facets ?? null) : snapshot.facets);
	const loading = $derived(mounted ? snapshot.loading : false);
	const error = $derived(mounted ? snapshot.error : serverError);
	const browseMode = $derived(input.query.trim().length < 2);
	const activeFilters = $derived(getActiveFilters(filters));
	const pageCards = $derived(
		!mounted ? (serverResult?.hits ?? []) : (snapshot.pages.get(paging.offset) ?? [])
	);
	const href = $derived(canonicalHref && !mounted ? canonicalHref : searchHref(session.input));
	const canonicalURL = $derived(new URL(href, 'https://spellbook.invalid'));
	let searchInput: HTMLInputElement | null = $state(null);
	let resultsElement: HTMLDivElement | null = $state(null);
	let resultsHeading: HTMLHeadingElement | null = $state(null);
	let resultTrigger: HTMLElement | null = $state(null);
	let filtersOpen = $state(false);
	let range: CatalogRange = $state(session.range);
	const warmedImages = new Set<string>();
	const initialPublicationReset = untrack(() => session.snapshot.publicationReset ?? 0);
	let restoredReset = -1;
	let restoredTarget: HTMLElement | null = null;
	let retainedServerPage: SearchResult | null = null;
	let serverPageVersion = $state(0);
	let consumedServerVersion = 0;
	let activatedAddress: string | null = null;
	let restoreTop = $state(0);
	let anchorIndex = $state(0);

	onMount(() => {
		if (serverInput) session.hydrate(serverInput);
		windowViewport = window;
		restoreTop = session.scrollTop;
		anchorIndex = session.pagination.offset;
		session.activate(serverInput ? (serverResult ?? undefined) : undefined);
		retainedServerPage = serverResult;
		serverPageVersion = consumedServerVersion = 1;
		activatedAddress = activationAddress;
		mounted = true;
	});
	onNavigate(({ shallow }) => {
		if (shallow || !host) return;
		session.scrollTop = browseScrollTop(host);
		session.rememberPosition();
	});
	function resetFocus() {
		searchInput?.focus({ preventScroll: true });
	}
	const activationAddress = $derived(
		searchHref({
			...session.input,
			pagination: searchPagination(
				session.pagination.pageSize,
				session.pagination.pageSize === 'lazy' ? 1 : session.pagination.page
			)
		})
	);
	$effect(() => {
		if (!mounted || !serverInput || serverResult === retainedServerPage) return;
		const nextInput = serverInput,
			nextResult = serverResult;
		untrack(() => {
			session.retainServerPage(nextInput, nextResult);
			retainedServerPage = nextResult;
			serverPageVersion++;
		});
	});
	$effect(() => {
		if (!mounted) return;
		const address = activationAddress;
		const replacedServerPage = serverPageVersion !== consumedServerVersion;
		const freshSeed =
			replacedServerPage &&
			serverInput &&
			searchHref(serverInput) === untrack(() => searchHref(session.input));
		if (untrack(() => activatedAddress === address) && !freshSeed) return;
		untrack(() => session.pause());
		const timer = setTimeout(
			() =>
				untrack(() => {
					restoreTop = session.scrollTop;
					anchorIndex = session.pagination.offset;
					session.activate(
						serverPageVersion !== consumedServerVersion &&
							serverInput &&
							searchHref(serverInput) === searchHref(session.input)
							? (serverResult ?? undefined)
							: undefined
					);
					if (serverInput && searchHref(serverInput) === searchHref(session.input))
						consumedServerVersion = serverPageVersion;
					activatedAddress = address;
				}),
			150
		);
		return () => clearTimeout(timer);
	});
	$effect(() => {
		if (
			!mounted ||
			!host ||
			paging.pageSize === 'lazy' ||
			!snapshot.validated ||
			(restoredReset === snapshot.reset && restoredTarget === restorationTarget)
		)
			return;
		restoredReset = snapshot.reset;
		restoredTarget = restorationTarget;
		const targetHost = host;
		const feedback = restorationTarget;
		const top =
			snapshot.publicationReset && snapshot.publicationReset !== initialPublicationReset
				? 0
				: restoreTop;
		void tick().then(() => {
			restoreBrowsePosition(targetHost, top, resultsHeading, feedback);
		});
	});
	$effect(() => {
		if (!mounted || !host) return;
		const targetHost = host;
		const update = () => {
			session.scrollTop = browseScrollTop(targetHost);
		};
		targetHost.addEventListener('scroll', update, { passive: true });
		return () => targetHost.removeEventListener('scroll', update);
	});
	$effect(() => {
		session.focus = resetFocus;
	});
	onDestroy(() => {
		clearAdditionDrafts();
		session.pause();
		if (serverInput) catalog.releaseSeed();
		if (session.focus === resetFocus) session.focus = () => {};
	});
	function handleRange(next: CatalogRange) {
		range = next;
		session.setRange(nativeFeedbackRange(next, session.pagination.offset, !!restorationTarget));
	}
	function navigate(nextHref: string) {
		if (session.pending) return;
		session.navigate(parseSearchUrl(new URL(nextHref, window.location.origin)));
		if (paging.pageSize === 'lazy') session.activate();
	}
	$effect(() => {
		if (!mounted || session.selectedCard) return;
		const current = snapshot;
		const windowRange = range;
		const connection = (
			navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
		).connection;
		if (connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '')) return;
		const timer = setTimeout(() => {
			for (let step = 0; step < 12; step++) {
				const index =
					windowRange.direction === 1 ? windowRange.end + step : windowRange.start - 1 - step;
				const card = cardAt(current, index, paging.limit);
				const url = card?.image_uri || card?.image_uri_small;
				if (!url || warmedImages.has(url)) continue;
				warmedImages.add(url);
				if (warmedImages.size > 120) warmedImages.delete(warmedImages.values().next().value!);
				const image = new Image();
				image.decoding = 'async';
				image.src = url;
			}
		}, 120);
		return () => clearTimeout(timer);
	});
	function handleSelect(card: CardDocument) {
		if (!snapshot.validated || session.pending) return;
		clearAdditionDrafts();
		resultTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		session.selectedCard = card;
	}
	function handleCloseDetail() {
		if (session.pending) return;
		const id = session.selectedCard?.id;
		session.selectedCard = null;
		clearAdditionDrafts();
		void tick().then(() => {
			const target = id
				? resultsElement?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`)
				: null;
			if (target) target.focus({ preventScroll: true });
			else if (resultTrigger?.isConnected) resultTrigger.focus({ preventScroll: true });
			else resultsHeading?.focus({ preventScroll: true });
		});
	}
</script>

<div class="catalog-workspace">
	<form
		class="search-toolbar flex flex-wrap items-center gap-3 pb-4"
		method="GET"
		action="/mtg/search"
		onsubmit={(event) => {
			if (mounted) {
				event.preventDefault();
				session.submit();
			}
		}}
	>
		<SearchBar
			bind:inputRef={searchInput}
			value={input.query}
			onInput={(value) => session.setQuery(value)}
			name="q"
			submitLabel="Search cards"
			class="search-query min-w-0 flex-1"
		/>
		<input type="hidden" name="pageSize" value={paging.pageSize} />
		<input type="hidden" name="page" value="1" />
		{#if mounted}
			<button
				type="button"
				onclick={() => (filtersOpen = !filtersOpen)}
				aria-expanded={filtersOpen}
				class="btn btn-secondary md:hidden"
				>Filters{activeFilters.length ? ` (${activeFilters.length})` : ''}</button
			>
		{:else}
			<details class="w-full">
				<summary>Filters</summary>
				<div class="grid gap-4 sm:grid-cols-4">
					{#each [{ name: 'color', label: 'Deck colors', options: MANA_COLORS, selected: input.filters.colorIdentity }, { name: 'rarity', label: 'Rarity', options: RARITIES, selected: input.filters.rarities }, { name: 'type', label: 'Card type', options: CARD_TYPES, selected: input.filters.types }, { name: 'legal', label: 'Legality', options: LEGALITY_FORMATS, selected: input.filters.legalities }] as group}
						<fieldset>
							<legend>{group.label}</legend>{#each group.options as option}<label
									class="flex items-center gap-2"
									><input
										type="checkbox"
										name={group.name}
										value={option.id}
										checked={group.selected?.some((value) => value === option.id)}
									/>{option.label}</label
								>{/each}
						</fieldset>
					{/each}
				</div>
				<button class="btn btn-secondary" type="submit">Apply filters</button>
			</details>
		{/if}
		{@render controls?.()}
	</form>
	<div class="search-content flex items-start gap-4">
		{#if mounted}<div class="search-sidebar shrink-0" class:filters-open={filtersOpen}>
				<SearchFilters {filters} {facets} />
			</div>{/if}
		<div bind:this={resultsElement} class="w-full min-w-0 flex-1">
			<h2
				bind:this={resultsHeading}
				tabindex="-1"
				class="search-status flex flex-wrap items-center gap-3 pb-3 text-sm text-text-muted"
				aria-live="polite"
			>
				<span
					>{loading && !total
						? 'Finding cards…'
						: `${total.toLocaleString()} ${total === 1 ? 'card' : 'cards'}`}</span
				>
				{#if error}<span class="text-error">Search unavailable</span>{#if mounted}<button
							class="btn btn-ghost"
							onclick={() => catalog.retry()}>Retry</button
						>{:else}<a {href}>Retry search</a>{/if}{:else if loading && total}<span>Loading…</span
					>{/if}
			</h2>
			<SearchResults
				{restorationTarget}
				totalCount={total}
				getCard={(index) => cardAt(snapshot, index, paging.limit)}
				cards={pageCards}
				mode={paging.pageSize === 'lazy' ? 'lazy' : 'numeric'}
				viewport={host}
				anchorIndex={snapshot.anchor ?? anchorIndex}
				native={!mounted}
				canonicalHref={searchHref(input)}
				onRangeChange={handleRange}
				resetKey={snapshot.reset}
				initialScrollTop={snapshot.publicationReset &&
				snapshot.publicationReset !== initialPublicationReset
					? 0
					: restoreTop}
				onScrollPositionChange={(top) => (session.scrollTop = top)}
				onFocusReset={resetFocus}
				{loading}
				{error}
				query={input.query}
				{browseMode}
				onRetry={() => catalog.retry()}
				onClearFilters={() => filters.clear()}
				hasFilters={activeFilters.length > 0}
				selectedId={session.selectedCard?.id}
				onSelect={handleSelect}
			/>
			<Pagination
				state={paging}
				{total}
				{canonicalURL}
				onNavigate={mounted ? navigate : undefined}
				lazyLoading={mounted && paging.pageSize === 'lazy'}
			/>
		</div>
	</div>
</div>
{#if session.selectedCard}
	<CardDetail
		card={session.selectedCard}
		onClose={handleCloseDetail}
		returnFocus={resultTrigger ?? resultsHeading}
		callerPending={session.pending}
		onPendingChange={(value) => changePending('inspector', value)}
	>
		{#snippet actions(card: CardDocument)}
			<CardBrowsingActions
				{card}
				{deckDraft}
				{inventoryDraft}
				onPendingChange={(value) => changePending('addition', value)}
			/>
		{/snippet}
	</CardDetail>
{/if}

<style>
	.search-sidebar {
		width: 260px;
	}
	.search-status {
		scroll-margin-top: calc(var(--app-header-height, 72px) + 1rem);
	}
	@media (max-width: 767px) {
		.search-content {
			flex-direction: column;
		}
		.search-sidebar {
			display: none;
			width: 100%;
		}
		.search-sidebar.filters-open {
			display: block;
		}
		.search-toolbar :global(.search-query) {
			flex-basis: 100%;
		}
	}
</style>
