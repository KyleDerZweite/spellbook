<script lang="ts">
	import { onMount, untrack, tick } from 'svelte';
	import { goto, replaceState } from '$app/navigation';
	import { page as route } from '$app/state';
	import type {
		DeckLibraryPage,
		DeckLibraryCategories,
		DeckLibraryItem,
		DeckLibraryLocation
	} from '@spellbook/contracts/deck-library.ts';
	import {
		DeckLibraryWindow,
		deckLibraryParams,
		deckLibraryGeometry,
		deckLibraryMountedRows,
		readDeckLibraryJSON,
		mergeDeckLibraryCategories,
		deckLibraryTiles,
		deckLibraryMeasurement,
		DeckLibraryLocateAttempts,
		deckLibraryTilePosition
	} from '#lib/decks/library-window.ts';
	import {
		measureBrowseViewport,
		captureBrowseAnchor,
		browseAnchorScrollTop,
		browseOriginShift,
		restoreInitialBrowsePosition
	} from '#lib/browsing/viewport.ts';
	import { nextLoadedRange } from '#lib/browsing/loadedSpan.ts';
	import { workspaceSavedState } from '#lib/saved-state/workspace.svelte.ts';
	import type { ResourceSubscription } from '#lib/saved-state/workspace.ts';
	import Button from '#lib/components/ui/button/Button.svelte';
	import SavedStateStatus from '#lib/saved-state/SavedStateStatus.svelte';

	let {
		page,
		categories,
		accountId
	}: { page: DeckLibraryPage; categories: DeckLibraryCategories; accountId: string } = $props();
	let version = $state(0),
		enhanced = $state(false),
		terminal = $state(false);
	let wrapper: HTMLDivElement | undefined = $state();
	let width = $state(0),
		visibleTop = $state(0),
		viewportHeight = $state(0),
		focused = $state<{ index: number; item: DeckLibraryItem; revision: string } | null>(null);
	let categoryPage = $state(untrack(() => categories));
	let categoryError = $state('');
	let categorySelection = $state(untrack(() => [...page.query.categoryVersionIds]));
	let retainedOptions = $state<DeckLibraryCategories['items']>([]);
	let subscription: ResourceSubscription | undefined = $state();
	const heights = new Map<string, number>();
	let anchor: {
		deckId: string | null;
		index: number;
		intra: number;
		queryKey: string;
		revision: string;
		account: string;
	} | null = null;
	let positionError = $state('');
	let focusError = $state('');
	const locateAttempts = new DeckLibraryLocateAttempts();
	let layingOut = false,
		layoutPending = false;
	let measuredOrigin: number | undefined;
	let focusNode: HTMLElement | null = null;
	let restoreFocus: HTMLElement | null = null;
	let alive = false,
		scheduled = false,
		positioned = false;
	const library = untrack(
		() =>
			new DeckLibraryWindow(
				async (query, offset, limit, revision, signal, owned) =>
					readDeckLibraryJSON<DeckLibraryPage | { kind: 'RevisionChanged'; revision: string }>(
						`/api/mobile/v1/mtg/deck-library?${deckLibraryParams(query, offset, limit, revision)}`,
						signal,
						() => owned() && alive && !terminal,
						() => workspaceSavedState.expire()
					),
				() => {
					version++;
					schedule();
				},
				capture
			)
	);
	const current = $derived.by(() => {
		version;
		return library.current ?? page;
	});
	const span = $derived.by(() => {
		version;
		return library.span;
	});
	const columns = $derived(
		width > 0 ? (width <= 420 ? 2 : Math.max(1, Math.floor((width + 24) / 204))) : 1
	);
	const tileWidth = $derived(width <= 420 ? (width - 24) / 2 : 180);
	const geometry = $derived.by(() => {
		version;
		return deckLibraryGeometry(
			span,
			columns,
			Math.max(140, (tileWidth * 680) / 488 + 94),
			heights,
			(index) => library.at(index)
		);
	});
	const rows = $derived(
		deckLibraryMountedRows(
			geometry.base,
			geometry.offsets,
			visibleTop,
			viewportHeight,
			columns,
			geometry.rowAt,
			focused?.index
		)
	);
	const tiles = $derived.by(() => {
		version;
		const freshFocus = focused
			? library.loaded().find(({ item }) => item.id === focused?.item.id)
			: undefined;
		return deckLibraryTiles(
			rows
				.flatMap((row) =>
					Array.from({ length: columns }, (_, i) => (geometry.base + row) * columns + i)
				)
				.filter((index) => index >= span.start && index < span.end),
			(index) => library.at(index),
			freshFocus ?? focused
		);
	});
	async function locate(deckId: string, owns: () => boolean) {
		return library.locateAndLoad(
			deckId,
			async (query, id, revision, signal, current) => {
				const params = deckLibraryParams(query, 0, 200, revision);
				params.set('deckId', id);
				return readDeckLibraryJSON<
					DeckLibraryLocation | { kind: 'RevisionChanged'; revision: string }
				>(`/api/mobile/v1/mtg/deck-library/locate?${params}`, signal, current, () =>
					workspaceSavedState.expire()
				);
			},
			new AbortController().signal,
			owns
		);
	}
	function retryPosition() {
		locateAttempts.retry();
		focusError = '';
		positionError = '';
		schedule();
	}
	async function reconcileFocus() {
		const retained = focused;
		if (!retained) return;
		const account = accountId,
			queryKey = library.current?.queryKey;
		const owns = () =>
			alive &&
			!terminal &&
			accountId === account &&
			library.current?.queryKey === queryKey &&
			focused?.item.id === retained.item.id;
		let fresh = library.loaded().find(({ item }) => item.id === retained.item.id);
		if (!fresh && retained.revision !== library.current?.revision) {
			const attemptedRevision = library.current?.revision,
				attemptedIdentity = library.identity;
			const result = await locateAttempts.run(
				'focus',
				JSON.stringify([account, queryKey, attemptedRevision, retained.item.id]),
				() => locate(retained.item.id, owns)
			);
			if (!owns()) return;
			if (result.kind === 'Skipped') return;
			if (result.kind === 'Failed') {
				if (
					library.current?.revision !== attemptedRevision ||
					library.identity !== attemptedIdentity
				)
					return;
				focusError =
					result.cause instanceof Error
						? result.cause.message
						: 'Focused Deck position could not be restored.';
				return;
			}
			const location = result.value;
			focusError = '';
			if (!location || !owns() || location.identity !== library.identity) return;
			fresh =
				location.index === null
					? undefined
					: library.loaded().find(({ item }) => item.id === retained.item.id);
			if (location.index === null) {
				focused = null;
				library.retain(null);
				return;
			}
		}
		if (fresh && owns()) {
			focusError = '';
			focused = { ...fresh, revision: library.current!.revision };
			library.retain(fresh.item);
		}
	}
	const options = $derived(
		mergeDeckLibraryCategories(categoryPage, retainedOptions, categorySelection)
	);
	$effect(() => {
		const seed = page,
			account = accountId;
		untrack(() => {
			if (terminal) return;
			focused = null;
			positioned = false;
			anchor = null;
			positionError = '';
			focusError = '';
			heights.clear();
			library.seed(account, seed);
			categoryPage = categories;
			categorySelection = [...seed.query.categoryVersionIds];
			retainedOptions = [];
			positioned = false;
			if (enhanced) schedule();
		});
	});
	function capture() {
		if (focusNode && document.activeElement === focusNode) restoreFocus = focusNode;
		if (!enhanced || !wrapper || !positioned || terminal || anchor) return;
		const relative = -wrapper.getBoundingClientRect().top;
		const captured = captureBrowseAnchor(
			relative,
			(top) => geometry.rowAt(top),
			(index) => geometry.offsets[index] ?? 0
		);
		const index = Math.max(span.start, (geometry.base + captured.index) * columns);
		const item = library.at(index);
		anchor = {
			deckId: item?.id ?? null,
			index,
			intra: captured.intra,
			queryKey: current.queryKey,
			revision: current.revision,
			account: accountId
		};
	}
	function schedule() {
		if (!alive) return;
		if (layingOut) {
			layoutPending = true;
			return;
		}
		if (scheduled) return;
		scheduled = true;
		requestAnimationFrame(() => {
			scheduled = false;
			void layout();
		});
	}
	function restoreKeyboardFocus() {
		if (
			restoreFocus?.isConnected &&
			focused &&
			restoreFocus.dataset.libraryId === focused.item.id &&
			(document.activeElement === document.body || document.activeElement === restoreFocus)
		) {
			restoreFocus.focus({ preventScroll: true });
		}
		restoreFocus = null;
	}
	async function layout() {
		if (layingOut) {
			layoutPending = true;
			return;
		}
		layingOut = true;
		try {
			if (!alive || !wrapper || terminal) return;
			await reconcileFocus();
			if (!alive || !wrapper || terminal) return;
			const priorWidth = width;
			const rect = wrapper.getBoundingClientRect();
			const origin = rect.top + window.scrollY;
			if (priorWidth !== rect.width) {
				capture();
				heights.clear();
				width = rect.width;
				version++;
			}
			if (measuredOrigin !== undefined && !anchor) {
				const shift = browseOriginShift(measuredOrigin, origin, window.scrollY, 0);
				if (shift) window.scrollTo({ top: window.scrollY + shift, behavior: 'instant' });
			}
			await tick();
			if (!alive || !wrapper || terminal) return;
			restoreKeyboardFocus();
			if (anchor) {
				const captured = anchor;
				let index = captured.index;
				const owns = () =>
					alive &&
					!terminal &&
					accountId === captured.account &&
					library.current?.queryKey === captured.queryKey;
				if (!owns()) {
					anchor = null;
					return;
				}
				const residentAnchor = captured.deckId
					? library.loaded().find(({ item }) => item.id === captured.deckId)
					: undefined;
				if (residentAnchor) {
					index = residentAnchor.index;
				} else if (captured.deckId && captured.revision !== library.current?.revision) {
					const attemptedRevision = library.current?.revision,
						attemptedIdentity = library.identity;
					const result = await locateAttempts.run(
						'anchor',
						JSON.stringify([
							captured.account,
							captured.queryKey,
							attemptedRevision,
							captured.deckId
						]),
						() => locate(captured.deckId!, owns)
					);
					if (!owns()) {
						anchor = null;
						return;
					}
					if (result.kind === 'Skipped') return;
					if (result.kind === 'Failed') {
						if (
							library.current?.revision !== attemptedRevision ||
							library.identity !== attemptedIdentity
						)
							return;
						positionError =
							result.cause instanceof Error
								? result.cause.message
								: 'Saved Deck position could not be restored.';
						return;
					}
					const located = result.value;
					if (!located || !owns() || located.identity !== library.identity) {
						anchor = null;
						return;
					}
					index = located.index ?? index;
				} else if (captured.deckId) {
					index = library.loaded().find(({ item }) => item.id === captured.deckId)?.index ?? index;
				}
				await tick();
				if (!owns()) {
					anchor = null;
					return;
				}
				anchor = null;
				positionError = '';
				const row = Math.max(
					0,
					Math.min(geometry.offsets.length - 2, Math.floor(index / columns) - geometry.base)
				);
				window.scrollTo({
					top: browseAnchorScrollTop(
						wrapper.getBoundingClientRect().top + window.scrollY,
						geometry.offsets[row] ?? 0,
						captured.intra,
						0
					),
					behavior: 'instant'
				});
			}

			await tick();
			if (!alive || !wrapper || terminal) return;
			restoreKeyboardFocus();
			measuredOrigin = wrapper.getBoundingClientRect().top + window.scrollY;
			if (!positioned) {
				positioned = true;
				restoreInitialBrowsePosition(window, window.scrollY, page.offset, measuredOrigin, null);
			}
			const measured = measureBrowseViewport(window, wrapper);
			viewportHeight = measured.height;
			visibleTop = Math.max(0, measured.visibleTop);
			const firstRow = geometry.rowAt(visibleTop),
				lastRow = geometry.rowAt(visibleTop + viewportHeight);
			const first = Math.max(span.start, (geometry.base + firstRow) * columns),
				last = Math.min(span.end, (geometry.base + lastRow + 1) * columns);
			const mountedStart = Math.max(
				span.start,
				(geometry.base + Math.max(0, firstRow - 2)) * columns
			);
			library.setVisible(mountedStart, Math.min(span.end, mountedStart + 200), first);
			const ids = new Set(library.loaded().map(({ item }) => item.id));
			if (focused) ids.add(focused.item.id);
			let pruned = false;
			for (const id of heights.keys())
				if (!ids.has(id)) {
					capture();
					heights.delete(id);
					pruned = true;
				}
			if (pruned) {
				version++;
				schedule();
			}
			if (span.start > 0 && visibleTop < 100) void library.loadEarlier();
			if (nextLoadedRange(span, last, current.matchingTotal, columns * 3) !== null)
				void library.loadLater();
			const logical = Math.floor(first / current.limit) + 1;
			if (
				route.url.pathname === '/mtg/decks' &&
				!route.url.searchParams.has('deck') &&
				route.url.searchParams.get('dirPage') !== String(logical)
			) {
				const url = new URL(route.url.href);
				url.searchParams.set('dirPage', String(logical));
				replaceState(url, route.state);
			}
		} catch (cause) {
			anchor = null;
			if (alive && !terminal)
				positionError =
					cause instanceof Error ? cause.message : 'Saved Deck position could not be restored.';
		} finally {
			layingOut = false;
			if (layoutPending) {
				layoutPending = false;
				schedule();
			}
		}
	}
	function measure(node: HTMLElement, item: DeckLibraryItem) {
		const measurement = deckLibraryMeasurement(item, (id, height) => {
			if (Math.abs((heights.get(id) ?? 0) - height) > 0.5) {
				capture();
				heights.set(id, height);
				version++;
				schedule();
			}
		});
		const read = () => {
			if (!node.classList.contains('retained-outside'))
				measurement.measure(node.getBoundingClientRect().height);
		};
		const observer = new ResizeObserver(read);
		observer.observe(node);
		return {
			update(item: DeckLibraryItem) {
				measurement.update(item);
				read();
			},
			destroy: () => observer.disconnect()
		};
	}

	function href(id: string) {
		const url = new URL(route.url.href);
		url.searchParams.set('deck', id);
		url.searchParams.delete('flow');
		return url.pathname + url.search;
	}
	function categoryHref(offset: number) {
		const url = new URL(route.url.href);
		url.searchParams.set('dirCategoryOffset', String(offset));
		return url.pathname + url.search;
	}
	function pageHref(offset: number) {
		const url = new URL(route.url.href);
		url.searchParams.set('dirPage', String(Math.floor(offset / 200) + 1));
		return url.pathname + url.search;
	}
	async function filter(event: SubmitEvent) {
		if (!enhanced) return;
		event.preventDefault();
		const form = event.currentTarget as HTMLFormElement;
		const values = new FormData(form),
			url = new URL(route.url.href);
		for (const key of [
			'dirQ',
			'dirFormat',
			'dirSort',
			'dirCategory',
			'dirPage',
			'dirCategoryOffset'
		])
			url.searchParams.delete(key);
		for (const [key, value] of values)
			if (key !== 'q' && typeof value === 'string' && value) url.searchParams.append(key, value);
		url.searchParams.set('dirPage', '1');
		await goto(url);
	}
	async function readCategories(offset: number, signal: AbortSignal, currentLease: () => boolean) {
		const page = library.current;
		if (!page) return;
		const value = await library.read(
			async (signal, owned) =>
				readDeckLibraryJSON<DeckLibraryCategories | { kind: 'RevisionChanged'; revision: string }>(
					`/api/mobile/v1/mtg/deck-library/categories?${deckLibraryParams(page.query, offset, 200, page.revision)}`,
					signal,
					() => owned() && alive && !terminal,
					() => workspaceSavedState.expire()
				),
			signal,
			currentLease
		);
		if (value && 'kind' in value)
			throw new Error('Deck Library changed while loading category options. Try again.');
		if (value && currentLease()) {
			retainedOptions = options.filter((item) => categorySelection.includes(item.versionId));
			categoryPage = value;
			categoryError = '';
		}
	}
	async function categoryNext(offset: number) {
		const controller = new AbortController(),
			identity = library.identity;
		const owned = () => alive && !terminal && identity === library.identity;
		try {
			await readCategories(offset, controller.signal, owned);
		} catch {
			if (owned()) categoryError = 'Category options could not be loaded. Try again.';
		}
	}
	onMount(() => {
		alive = true;
		enhanced = true;
		library.seed(accountId, page);
		const observer = new ResizeObserver(() => schedule());
		if (wrapper) observer.observe(wrapper);
		const scroll = () => schedule();
		window.addEventListener('scroll', scroll, { passive: true });
		window.addEventListener('resize', scroll);
		subscription = workspaceSavedState.subscribe({
			topics: ['decks'],
			clear: () => {
				terminal = true;
				library.clear();
				categoryPage = { ...categoryPage, items: [], selected: [] };
				retainedOptions = [];
				categorySelection = [];
				categoryError = '';
				positionError = '';
				focusError = '';
				locateAttempts.clear();
				focused = null;
				heights.clear();
			},
			refresh: async (lease) => {
				const account = accountId,
					query = page.queryKey;
				const current = () =>
					lease.current() && alive && !terminal && accountId === account && page.queryKey === query;
				await library.refresh(current);
				if (current() && library.error) throw new Error(library.error);
				if (current()) await readCategories(categoryPage.offset, lease.signal, current);
			}
		});
		schedule();
		return () => {
			alive = false;
			observer.disconnect();
			window.removeEventListener('scroll', scroll);
			window.removeEventListener('resize', scroll);
			subscription?.dispose();
			library.clear();
		};
	});
</script>

<SavedStateStatus resource={subscription} />
{#if !terminal}
	<form class="directory-controls" method="GET" onsubmit={filter}>
		{#if route.url.searchParams.get('q')}<input
				type="hidden"
				name="q"
				value={route.url.searchParams.get('q') ?? ''}
			/>{/if}
		<label>Deck name <input name="dirQ" value={page.query.query} maxlength="200" /></label>
		<label
			>Format <select name="dirFormat" value={page.query.format}
				><option value="">All formats</option
				>{#each ['Commander', 'Standard', 'Modern', 'Pioneer', 'Legacy', 'Vintage', 'Pauper', 'Brawl', 'Casual'] as format}<option
						value={format}>{format}</option
					>{/each}</select
			></label
		>
		<label
			>Sort <select name="dirSort" value={page.query.sort}
				><option value="updated:desc">Recently edited</option><option value="name:asc"
					>Name A to Z</option
				><option value="name:desc">Name Z to A</option></select
			></label
		>
		<label
			>Categories <select
				name="dirCategory"
				multiple
				bind:value={categorySelection}
				aria-describedby="category-filter-help"
				>{#each options as option}<option value={option.versionId}
						>{option.name} · v{option.version}{option.historical ? ' · historical' : ''} ({option.count})</option
					>{/each}</select
			></label
		>
		<Button class="directory-action" type="submit">Apply filters</Button>
	</form>
	<p id="category-filter-help" class="muted">
		Selected categories match any version. Historical versions keep their saved meaning.
	</p>
	{#if categorySelection.length}<details class="category-meanings">
			<summary>Selected category meanings</summary
			>{#each options.filter((item) => categorySelection.includes(item.versionId)) as option}<p>
					<strong>{option.name}</strong> · v{option.version}{option.historical
						? ' · historical'
						: ''}. {option.meaning}
				</p>{/each}
		</details>{/if}
	{#if categoryPage.total > 200}<div class="category-options">
			{#if enhanced}{#if categoryPage.offset > 0}<Button
						class="directory-action"
						onclick={() => categoryNext(Math.max(0, categoryPage.offset - 200))}
						>Earlier categories</Button
					>{/if}{#if categoryPage.offset + categoryPage.limit < categoryPage.total}<Button
						class="directory-action"
						onclick={() => categoryNext(categoryPage.offset + 200)}>More categories</Button
					>{/if}{:else}{#if categoryPage.offset > 0}<a
						href={categoryHref(Math.max(0, categoryPage.offset - 200))}>Earlier categories</a
					>{/if}{#if categoryPage.offset + categoryPage.limit < categoryPage.total}<a
						href={categoryHref(categoryPage.offset + 200)}>More categories</a
					>{/if}{/if}
		</div>{/if}
	{#if categoryError}<p role="alert">{categoryError}</p>{/if}
	{#if positionError || focusError}<p role="alert">
			{focusError || positionError}
			<Button class="directory-action" onclick={retryPosition}>Retry position</Button>
		</p>{/if}
	<p class="directory-total">{current.matchingTotal} of {current.globalTotal} decks</p>
	{#if enhanced && library.error}<p role="alert">
			{library.error}
			<Button class="directory-action" onclick={() => library.retry()}>Retry</Button>
		</p>{/if}
	{#snippet tile(item: DeckLibraryItem, index: number, virtual = false)}
		{@const position = deckLibraryTilePosition(
			index,
			span,
			columns,
			geometry.base,
			geometry.offsets,
			tileWidth
		)}
		<a
			class="library-card"
			class:virtual-tile={virtual}
			class:retained-outside={virtual && position.offscreen}
			style:top={virtual ? `${position.top}px` : undefined}
			style:left={virtual ? `${position.left}px` : undefined}
			style:width={virtual ? `${tileWidth}px` : undefined}
			href={href(item.id)}
			data-library-id={item.id}
			use:measure={item}
			onfocus={(event) => {
				focusNode = event.currentTarget;
				focused = { index, item, revision: current.revision };
				library.retain(item);
				if (index >= span.end - columns) void library.loadLater();
			}}
			onblur={() => {
				void tick().then(() => {
					if (restoreFocus === focusNode && document.activeElement === document.body) return;
					if (wrapper && !wrapper.contains(document.activeElement)) {
						focusNode = null;
						focused = null;
						library.retain(null);
					}
				});
			}}
		>
			{#if item.imageUri}<img src={item.imageUri} alt="" loading="lazy" />{:else}<div
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
						><rect x="7" y="3" width="13" height="18" rx="2" /><path d="m4 6-2 1 3 15 11-2" /></svg
					>
				</div>{/if}
			<strong>{item.name}</strong><span>{item.format} · {item.quantity} cards</span><small
				>Edited {new Date(item.updatedAt).toLocaleDateString('en-GB')}</small
			>
			{#if item.categories.length}<span class="category-badges"
					>{#each item.categories as category}<small
							title={category.historical ? 'Historical saved version' : ''}
							>{category.name}{category.historical ? ' · historical' : ''}</small
						>{/each}{#if item.remainingCategoryCount}<small
							>+{item.remainingCategoryCount} categories</small
						>{/if}</span
				>{/if}
		</a>
	{/snippet}
	<div
		bind:this={wrapper}
		class:virtual={enhanced}
		class="deck-library"
		style:height={enhanced ? `${geometry.total}px` : undefined}
		aria-label="Deck Library"
	>
		{#if enhanced}{#each tiles as entry (entry.key)}
				{#if entry.item}{@render tile(entry.item, entry.index, true)}{:else}<div
						class="loading-tile virtual-tile"
						style:top={`${geometry.offsets[Math.floor(entry.index / columns) - geometry.base] ?? 0}px`}
						style:left={`${(entry.index % columns) * (tileWidth + 24)}px`}
						style:width={`${tileWidth}px`}
						style:min-height={`${Math.max(140, (tileWidth * 680) / 488 + 94)}px`}
						aria-label="Loading Deck"
					></div>{/if}
			{/each}{:else}{#each page.items as item, index (item.id)}{@render tile(
					item,
					page.offset + index
				)}{/each}{/if}
	</div>
	{#if !current.matchingTotal}<section class="panel empty-state welcome">
			<p>{current.globalTotal ? 'No decks match these filters.' : 'No decks yet.'}</p>
		</section>{/if}
	{#if !enhanced}<nav aria-label="Deck Library pages">
			{#if page.offset > 0}<a href={pageHref(Math.max(0, page.offset - page.limit))}>Previous</a
				>{/if}{#if page.offset + page.items.length < page.matchingTotal}<a
					href={pageHref(page.offset + page.limit)}>Next</a
				>{/if}
		</nav>{/if}
{/if}

<style>
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

	.empty-state {
		padding: 3rem 1rem;
		text-align: center;
		color: var(--color-text-secondary);
	}
	@media (max-width: 420px) {
		.deck-library {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	.directory-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		align-items: end;
	}
	.directory-controls label {
		min-width: 0;
		flex: 1 1 10rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-width: 100%;
	}
	.directory-controls input,
	.directory-controls select {
		max-width: 100%;
		min-height: 44px;
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-surface);
		color: var(--color-text-primary);
		font: inherit;
	}
	.directory-controls input:focus-visible,
	.directory-controls select:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
	.directory-controls select[multiple] {
		width: 100%;
		max-width: 100%;
		min-width: 0;
		min-height: 5rem;
	}
	.virtual {
		display: block;
		position: relative;
		overflow-anchor: none;
	}
	.virtual-tile {
		position: absolute;
	}
	.virtual-tile.retained-outside {
		width: 1px !important;
		height: 1px;
		overflow: hidden;
		clip-path: inset(100%);
	}
	.library-card strong,
	.category-badges small {
		overflow-wrap: anywhere;
	}
	.category-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.category-badges small {
		background: var(--color-stone);
		border-radius: 0.25rem;
		padding: 0.2rem 0.35rem;
	}
	.loading-tile {
		border-radius: 0.6rem;
		background: var(--color-stone);
	}
	:global(.directory-action) {
		min-height: 44px;
	}
	nav a {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		padding: 0.5rem;
	}
	nav {
		display: flex;
		gap: 1rem;
		margin-top: 1rem;
	}
</style>
