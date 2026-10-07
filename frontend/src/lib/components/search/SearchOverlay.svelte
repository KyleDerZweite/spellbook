<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { page } from '$app/state';
	import { beforeNavigate, goto } from '$app/navigation';
	import { onMount, tick, untrack } from 'svelte';
	import { getSearchSession } from '#lib/search/session.svelte.ts';
	import { pendingOverlayBack } from '#lib/search/history.ts';
	import { parseSearchUrl, searchHref } from '#lib/search/navigation.ts';
	import SearchWorkspace from './SearchWorkspace.svelte';

	const session = getSearchSession();
	const fullRoute = $derived(page.route.id === '/mtg/search');
	const open = $derived(!!page.state.searchOverlay && !!page.shallow && !fullRoute);
	let viewport: HTMLDivElement | null = $state(null);
	let returnFocus: HTMLElement | null = null;

	function openSearch(query?: string, trigger?: HTMLElement) {
		if (session.pending) return;
		returnFocus =
			trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
		if (query !== undefined) session.hydrate({ query, filters: {} });
		if (fullRoute || open) {
			if (query !== undefined) syncUrl();
			session.selectedCard = null;
			void tick().then(() => session.focus());
			return;
		}
		void goto(searchHref(session.input), {
			shallow: true,
			state: {
				...page.state,
				searchOverlay: { background: (page.shallow?.url ?? page.url).href, depth: 1 }
			}
		});
	}

	function syncUrl(intent: 'push' | 'replace' = 'replace') {
		if (!open && !fullRoute) return;
		void goto(searchHref(session.input), {
			shallow: true,
			replace: intent === 'replace',
			state:
				open && intent === 'push'
					? {
							...page.state,
							searchOverlay: {
								...page.state.searchOverlay!,
								depth: (page.state.searchOverlay?.depth ?? 1) + 1
							}
						}
					: page.state
		});
	}

	function closeSearch() {
		if (session.pending || !open) return;
		session.selectedCard = null;
		session.rememberPosition();
		history.go(-(page.state.searchOverlay?.depth ?? 1));
	}

	function fullView() {
		if (session.pending) return;
		void goto(searchHref(session.input), {
			replace: true,
			state: {
				...page.state,
				searchOverlay: undefined,
				searchFullView: {
					background: page.state.searchOverlay?.background ?? (page.shallow?.url ?? page.url).href,
					depth: page.state.searchOverlay?.depth ?? 1
				}
			}
		});
	}

	beforeNavigate((navigation) => {
		if (session.pending) navigation.cancel();
	});

	$effect(() => {
		const url = page.shallow?.url ?? page.url;
		// Kit 3 retains a replaced entry's navigation index. Back/Forward can update
		// its URL without changing the rendered route after Full view.
		if (!page.shallow && fullRoute !== (page.url.pathname === '/mtg/search')) {
			void goto(page.url.href, { replace: true, state: page.state });
			return;
		}
		if ((open || fullRoute) && url.pathname === '/mtg/search')
			untrack(() => session.hydrate(parseSearchUrl(url)));
	});

	onMount(() => {
		session.open = openSearch;
		session.onEdit = syncUrl;
		function shortcut(event: KeyboardEvent) {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
				event.preventDefault();
				openSearch();
			}
		}
		function pendingBack(event: PopStateEvent) {
			if (
				pendingOverlayBack(
					session.pending,
					page.state.searchOverlay?.background ?? page.state.searchFullView?.background,
					location.href
				)
			) {
				event.stopImmediatePropagation();
				history.forward();
			}
		}
		window.addEventListener('popstate', pendingBack, { capture: true });
		window.addEventListener('keydown', shortcut);
		return () => {
			window.removeEventListener('keydown', shortcut);
			window.removeEventListener('popstate', pendingBack, { capture: true });
			session.open = () => {};
			session.onEdit = () => {};
		};
	});
</script>

<Dialog.Root
	{open}
	onOpenChange={(value) => {
		if (!value) closeSearch();
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay class="search-backdrop fixed inset-0 z-40" />
		<Dialog.Content
			bind:ref={viewport}
			class="search-dialog fixed z-50 overflow-y-auto overscroll-contain border border-border bg-background shadow-xl"
			escapeKeydownBehavior={session.pending ? 'ignore' : 'close'}
			interactOutsideBehavior={session.pending ? 'ignore' : 'close'}
			onOpenAutoFocus={(event) => {
				event.preventDefault();
				void tick().then(() => session.focus());
			}}
			onCloseAutoFocus={(event) => {
				event.preventDefault();
				if (fullRoute) {
					void tick().then(() => session.focus());
					return;
				}
				const desktop = document.querySelector<HTMLElement>('.primary-nav a[href="/mtg/search"]');
				const fallback = desktop?.getClientRects().length
					? desktop
					: document.querySelector<HTMLElement>('[aria-label="Open navigation menu"]');
				const target =
					returnFocus?.isConnected && returnFocus.getClientRects().length ? returnFocus : fallback;
				target?.focus();
			}}
		>
			<Dialog.Title class="sr-only">Search cards</Dialog.Title>
			<Dialog.Description class="sr-only"
				>Search the Magic catalog, inspect printings, and add cards to inventory.</Dialog.Description
			>
			{#if open}
				<SearchWorkspace {viewport} controls={overlayControls} />
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

{#snippet overlayControls()}
	<div class="ml-auto flex shrink-0 items-center gap-1">
		<button class="btn btn-ghost shrink-0" onclick={fullView} disabled={session.pending}
			>Full view</button
		>
		<button
			class="btn btn-ghost btn-icon shrink-0"
			onclick={closeSearch}
			disabled={session.pending}
			aria-label="Close search">✕</button
		>
	</div>
{/snippet}

<style>
	:global(.search-backdrop) {
		background: rgb(0 0 0 / 55%);
	}
	:global(.search-dialog) {
		left: 50%;
		top: calc(var(--app-header-height, 72px) + 0.5rem);
		transform: translateX(-50%);
		width: min(calc(100% - 3rem), var(--layout-wide-width));
		height: calc(100dvh - var(--app-header-height, 72px) - 2rem);
		padding: 1rem 1rem 0;
		border-radius: 0.75rem;
	}
	@media (max-width: 767px) {
		:global(.search-dialog) {
			inset: 0;
			transform: none;
			width: 100%;
			height: 100dvh;
			padding: 0.75rem 0.75rem 0;
			border-radius: 0;
		}
	}
</style>
