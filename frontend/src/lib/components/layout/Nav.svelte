<script lang="ts">
	import { clearDemo } from '#lib/demo/storage.ts';
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { authState } from '#lib/auth/state.svelte.ts';
	import { workspaceSavedState } from '#lib/saved-state/workspace.svelte.ts';
	import { tick } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { getSearchSession } from '#lib/search/session.svelte.ts';
	import { isPrimaryClick } from '#lib/search/navigation.ts';
	import type { ComponentProps } from 'svelte';
	import { page } from '$app/state';
	import { pwaState } from '#lib/pwa/state.svelte.ts';
	import { hasWorkspaceNavigation } from './workspace-navigation.ts';
	import { asset } from '$app/paths';
	import { Dialog } from 'bits-ui';
	import Archive from '@lucide/svelte/icons/archive';
	import Box from '@lucide/svelte/icons/box';
	import House from '@lucide/svelte/icons/house';
	import Layers from '@lucide/svelte/icons/layers';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Menu from '@lucide/svelte/icons/menu';
	import QrCode from '@lucide/svelte/icons/qr-code';
	import Search from '@lucide/svelte/icons/search';
	import Settings from '@lucide/svelte/icons/settings';
	import Smartphone from '@lucide/svelte/icons/smartphone';
	import X from '@lucide/svelte/icons/x';
	import ActionMenu from '#lib/components/ui/menu/ActionMenu.svelte';
	import Avatar from '#lib/components/profile/Avatar.svelte';
	import AuthEntry from './AuthEntry.svelte';
	import ThemeToggle from './ThemeToggle.svelte';
	import LanguageSwitcher from './LanguageSwitcher.svelte';
	import GameSwitcher from './GameSwitcher.svelte';

	const search = getSearchSession();
	const user = $derived(
		workspaceSavedState.getState() === 'expired'
			? null
			: authState.user?.accountId === page.data.user?.accountId
				? authState.user
				: page.data.user
	);
	const NAV_LINKS = $derived([
		{
			href: user ? '/mtg/dashboard' : '/',
			label: user ? language.t('ui.Dashboard') : language.t('ui.Home'),
			icon: user ? LayoutGrid : House
		},
		{
			href: '/mtg/search',
			label: language.t('ui.Search'),
			icon: Search
		},
		{
			href: '/mtg/inventory',
			label: language.t('ui.Inventory'),
			icon: Archive
		},
		{
			href: '/mtg/decks',
			label: language.t('ui.Decks'),
			icon: Layers
		}
	]);

	const workspace = $derived(hasWorkspaceNavigation(page.route.id, !!user));
	const workspaceLinks = $derived(NAV_LINKS.slice(1));
	const moreLinks = $derived([
		NAV_LINKS[0],
		{ href: '/settings', label: language.t('ui.Settings'), icon: Settings },
		{
			href: '/settings/physical-boxes',
			label: language.t('physicalBoxes.title'),
			icon: Box
		},
		{ href: '/app/connect', label: language.t('ui.Connect.device'), icon: QrCode },
		{ href: '/app', label: language.t('ui.App'), icon: Smartphone }
	]);
	const currentMoreLink = $derived(moreLinks.findLast((link) => isActive(link.href)));
	const narrowViewport = new MediaQuery('screen and (max-width: 700px)');
	let moreOpen = $state(false);
	let brandLink: HTMLAnchorElement | undefined = $state();
	$effect(() => {
		if (!narrowViewport.current) moreOpen = false;
	});

	let collapsed = $state(false);
	$effect(() => {
		const update = () => {
			const top = window.scrollY;
			if (top > 160) collapsed = true;
			else if (top < 80) collapsed = false;
		};
		window.addEventListener('scroll', update, { passive: true });
		update();
		return () => window.removeEventListener('scroll', update);
	});
	let mobileMenuOpen = $state(false);
	let logoutError = $state(false);
	let signingOut = false;

	async function clearDemoBeforeLogout(event: SubmitEvent) {
		const session = page.data.demoSession;
		if (!session) return;
		event.preventDefault();
		if (signingOut) return;
		signingOut = true;
		logoutError = false;
		try {
			await clearDemo(session, true);
			logoutForm?.submit();
		} catch {
			logoutError = true;
			signingOut = false;
		}
	}

	let logoutForm: HTMLFormElement | undefined = $state();
	const userName = $derived(user?.username || language.t('ui.Account'));
	const accountActions: ComponentProps<typeof ActionMenu>['items'] = $derived([
		{ label: language.t('ui.Settings'), href: '/settings', icon: settingsIcon },
		{ label: 'App', href: '/app', icon: appIcon },
		{
			label: language.t('ui.Sign.out'),
			icon: signOutIcon,
			onSelect: () => logoutForm?.requestSubmit()
		}
	]);

	function searchClick(event: MouseEvent, mobile = false) {
		if (!isPrimaryClick(event)) return;
		event.preventDefault();
		const trigger = event.currentTarget as HTMLElement;
		if (mobile) {
			mobileMenuOpen = false;
			void tick().then(() => search.open(undefined, trigger));
		} else search.open(undefined, trigger);
	}

	function isActive(href: string): boolean {
		const path = page.state.searchOverlay
			? (page.shallow?.url.pathname ?? page.url.pathname)
			: page.url.pathname;
		return path === href || (href !== '/app' && path.startsWith(href + '/'));
	}
</script>

{#snippet settingsIcon()}<Settings size={16} aria-hidden="true" class="shrink-0" />{/snippet}
{#snippet appIcon()}<Smartphone size={16} aria-hidden="true" class="shrink-0" />{/snippet}
{#snippet signOutIcon()}<LogOut size={16} aria-hidden="true" class="shrink-0" />{/snippet}

<a
	href="#main-content"
	class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-[200] focus:rounded focus:bg-gold focus:px-4 focus:py-2 focus:text-text-on-gold"
>
	{language.t('ui.Skip.to.content')}
</a>

<nav
	class="primary-nav"
	class:collapsed
	class:workspace
	class:installed={pwaState.standalone}
	aria-label={language.t('ui.Primary')}
>
	<div class="nav-inner">
		<div class="brand-controls">
			<a
				href="/"
				bind:this={brandLink}
				class="brand-link font-display font-normal tracking-tight text-foreground no-underline"
				aria-label={language.t('ui.Spellbook.home')}
			>
				<img src={asset('logo.webp')} alt="" width="36" height="36" class="shrink-0" />
				<span class="brand-name">Spellbook</span>
			</a>
		</div>
		<div class="desktop-links">
			{#each NAV_LINKS as link}
				{@const Icon = link.icon}
				<a
					href={link.href}
					onclick={link.href === '/mtg/search' ? (event) => searchClick(event) : undefined}
					aria-label={link.label}
					title={link.label}
					aria-current={isActive(link.href) ? 'page' : undefined}
					class="nav-link {isActive(link.href) ? 'nav-link--active' : ''}"
				>
					<Icon size={16} aria-hidden="true" class="nav-icon shrink-0" /><span class="nav-label">
						{link.label}
					</span>
				</a>
			{/each}
		</div>
		<div class="account-controls">
			<GameSwitcher />
			<ThemeToggle />
			<LanguageSwitcher />
			{#if user}
				<form
					method="POST"
					action="/auth/logout"
					bind:this={logoutForm}
					onsubmit={clearDemoBeforeLogout}
				></form>
				{#if logoutError}<p role="alert">{language.t('ui.Could.not.save.Try.again')}</p>{/if}
			{/if}
			<div class="desktop-account">
				{#if user}
					<ActionMenu label={language.t('ui.Account.menu')} iconOnly items={accountActions}>
						{#snippet trigger()}
							<Avatar id={user.avatarId} size={26} />
						{/snippet}
						{#snippet header()}
							{@render accountIdentity()}
						{/snippet}
					</ActionMenu>
				{:else}
					<AuthEntry />
				{/if}
			</div>
			<Dialog.Root bind:open={mobileMenuOpen}>
				<Dialog.Trigger
					class="btn btn-secondary btn-icon header-menu-trigger lg:hidden"
					data-navigation-trigger
					aria-label={language.t('ui.Open.navigation.menu')}
				>
					<Menu size={20} aria-hidden="true" />
				</Dialog.Trigger>
				<Dialog.Portal>
					<Dialog.Overlay class="filter-overlay fixed inset-0 z-40" />
					<Dialog.Content
						class="fixed inset-x-3 top-3 z-50 max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-xl border border-border bg-stone p-2 shadow-xl"
					>
						<div class="flex items-center justify-between p-3">
							<Dialog.Title class="font-semibold tracking-tight">Spellbook</Dialog.Title>
							<Dialog.Close
								class="btn btn-ghost btn-icon"
								aria-label={language.t('ui.Close.navigation.menu')}
							>
								<X size={20} aria-hidden="true" />
							</Dialog.Close>
						</div>
						<Dialog.Description class="sr-only">
							{language.t('ui.Navigate.your.Magic.card.workspace')}
						</Dialog.Description>
						{#each NAV_LINKS as link}
							{@const Icon = link.icon}
							<a
								href={link.href}
								aria-current={isActive(link.href) ? 'page' : undefined}
								onclick={(event) => {
									if (link.href === '/mtg/search') searchClick(event, true);
									else mobileMenuOpen = false;
								}}
								class="mobile-nav-link {isActive(link.href) ? 'mobile-nav-link--active' : ''}"
							>
								<Icon size={16} aria-hidden="true" class="shrink-0" />{link.label}
							</a>
						{/each}
						<div class="mobile-account">
							{#if user}
								{@render accountIdentity()}
								<div class="mobile-account-actions">
									{#each accountActions as item}
										{#if item.href}<a
												href={item.href}
												class="btn btn-ghost"
												onclick={() => (mobileMenuOpen = false)}
											>
												{#if item.icon}{@render item.icon()}{/if}{item.label}
											</a>
										{:else}<button
												class="btn btn-ghost"
												disabled={item.disabled}
												onclick={() => {
													if (item.disabled) return;
													mobileMenuOpen = false;
													item.onSelect?.();
												}}
											>
												{#if item.icon}{@render item.icon()}{/if}{item.label}
											</button>{/if}
									{/each}
								</div>
							{:else}<AuthEntry />{/if}
						</div>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
		</div>
	</div>
</nav>

{#if workspace}
	<nav class="app-bottom-nav" aria-label={language.t('ui.Workspace.navigation')}>
		{#each workspaceLinks as link (link.href)}
			{@const Icon = link.icon}
			<a
				class="bottom-tab"
				href={link.href}
				onclick={link.href === '/mtg/search' ? (event) => searchClick(event) : undefined}
				aria-current={isActive(link.href) ? 'page' : undefined}
			>
				<Icon size={20} aria-hidden="true" class="shrink-0" />
				<span>{link.label}</span>
			</a>
		{/each}
		<Dialog.Root bind:open={moreOpen}>
			<Dialog.Trigger
				class="bottom-tab {currentMoreLink ? 'bottom-tab--active' : ''}"
				data-navigation-trigger
			>
				<Menu size={20} aria-hidden="true" class="shrink-0" />
				<span>{language.t('ui.More')}</span>
			</Dialog.Trigger>
			<Dialog.Portal>
				<Dialog.Overlay class="filter-overlay fixed inset-0 z-40" />
				<Dialog.Content
					class="workspace-sheet fixed z-50 overflow-y-auto rounded-xl border border-border bg-stone p-2 shadow-xl"
					onCloseAutoFocus={(event) => {
						if (narrowViewport.current) return;
						event.preventDefault();
						brandLink?.focus({ preventScroll: true });
					}}
				>
					<div class="flex items-center justify-between gap-2 px-3">
						<Dialog.Title class="font-semibold tracking-tight">
							{language.t('ui.More')}
						</Dialog.Title>
						<Dialog.Close
							class="btn btn-ghost btn-icon min-h-[44px] min-w-[44px]"
							aria-label={language.t('ui.Close.navigation.menu')}
						>
							<X size={20} aria-hidden="true" />
						</Dialog.Close>
					</div>
					<Dialog.Description class="sr-only">
						{language.t('ui.Navigate.your.Magic.card.workspace')}
					</Dialog.Description>
					{#each moreLinks as link (link.href)}
						{@const Icon = link.icon}
						<a
							href={link.href}
							aria-current={currentMoreLink === link ? 'page' : undefined}
							onclick={(event) => {
								if (isPrimaryClick(event)) moreOpen = false;
							}}
							class="mobile-nav-link min-h-[44px] {currentMoreLink === link
								? 'mobile-nav-link--active'
								: ''}"
						>
							<Icon size={16} aria-hidden="true" class="shrink-0" />{link.label}
						</a>
					{/each}
					<div class="mt-2 border-t border-border px-3 pt-2">
						{@render accountIdentity()}
						<button
							type="button"
							class="btn btn-ghost min-h-[44px]"
							onclick={() => {
								moreOpen = false;
								logoutForm?.requestSubmit();
							}}
						>
							{@render signOutIcon()}{language.t('ui.Sign.out')}
						</button>
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	</nav>
{/if}

{#snippet accountIdentity()}
	<div class="account-identity">
		<Avatar id={user?.avatarId} size={28} />
		<span>{userName}</span>
	</div>
{/snippet}

<style>
	.app-bottom-nav {
		display: none;
	}
	@media screen and (max-width: 700px) {
		.primary-nav.workspace :global(.header-menu-trigger) {
			display: none;
		}
		.primary-nav.installed .nav-inner {
			padding-top: env(safe-area-inset-top, 0px);
		}
		.app-bottom-nav {
			display: grid;
			grid-template-columns: repeat(4, minmax(0, 1fr));
			position: fixed;
			inset: auto 0 0;
			z-index: 30;
			height: var(--app-bottom-nav-height);
			padding: 0 max(0.25rem, env(safe-area-inset-right, 0px)) env(safe-area-inset-bottom, 0px)
				max(0.25rem, env(safe-area-inset-left, 0px));
			border-top: 1px solid var(--color-border);
			background: var(--color-background);
		}
		.app-bottom-nav :global(.bottom-tab) {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 0.25rem;
			min-height: 44px;
			padding: 0.25rem 0;
			text-align: center;
			min-width: 0;
			font-size: var(--text-meta);
			line-height: var(--text-meta--line-height);
			color: var(--color-foreground);
			text-decoration: none;
		}
		.app-bottom-nav a[aria-current='page'],
		.app-bottom-nav :global(.bottom-tab--active) {
			color: var(--color-gold);
			box-shadow: inset 0 3px currentColor;
		}
		.app-bottom-nav :global(.bottom-tab:focus-visible) {
			outline: 2px solid var(--color-gold);
			outline-offset: -4px;
		}
	}

	:global(.workspace-sheet) {
		inset-inline: max(0.75rem, env(safe-area-inset-left, 0px))
			max(0.75rem, env(safe-area-inset-right, 0px));
		bottom: max(0.75rem, env(safe-area-inset-bottom, 0px));
		max-height: calc(
			100dvh - 1.5rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)
		);
	}

	.account-identity {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
		font-size: var(--text-control);
		line-height: var(--text-control--line-height);
		font-weight: 500;
	}
	.account-identity span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mobile-account {
		margin-top: 1rem;
		padding: 0.75rem 1.25rem 0.25rem;
	}
	.mobile-account-actions {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.25rem;
		margin: 0.5rem 0 0 -0.75rem;
	}
	@media (min-width: 1024px) {
		.nav-label {
			max-width: 7rem;
			opacity: 1;
			overflow: hidden;
			transition:
				max-width 160ms ease,
				opacity 160ms ease;
		}
		.collapsed:not(:hover):not(:focus-within) .nav-label {
			max-width: 0;
			opacity: 0;
		}
		.collapsed:not(:hover):not(:focus-within) .desktop-links :global(.nav-link) {
			gap: 0;
		}
		.collapsed:not(:hover):not(:focus-within) .brand-name {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.nav-label {
			transition: none;
		}
	}

	.primary-nav {
		flex-shrink: 0;
		position: sticky;
		top: 0;
		z-index: 20;
		background: color-mix(in srgb, var(--color-background) 88%, transparent);
		backdrop-filter: blur(12px);
	}
	.primary-nav::after {
		content: '';
		position: absolute;
		inset: 100% 0 auto;
		height: 16px;
		background: linear-gradient(
			to bottom,
			color-mix(in srgb, var(--color-background) 88%, transparent),
			transparent
		);
		pointer-events: none;
	}
	.primary-nav ~ :global(.app-main) {
		margin-top: calc(-1 * var(--app-header-height));
	}
	.primary-nav ~ :global(.app-main .app-content) {
		padding-top: var(--app-header-height);
	}
	.nav-inner {
		width: 100%;
		margin: auto;
		min-height: var(--app-header-height);
		padding: 0 clamp(1rem, 1.5vw, 2rem);
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
		gap: 1rem;
	}
	.brand-controls {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.brand-link {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		min-height: 44px;
		gap: 0.5rem;
		font-size: 1.75rem;
	}
	.desktop-links {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		justify-content: center;
	}
	.desktop-links :global(a:nth-child(1) .nav-icon) {
		color: var(--color-nav-dashboard);
	}
	.desktop-links :global(a:nth-child(2) .nav-icon) {
		color: var(--color-nav-search);
	}
	.desktop-links :global(a:nth-child(3) .nav-icon) {
		color: var(--color-nav-inventory);
	}
	.desktop-links :global(a:nth-child(4) .nav-icon) {
		color: var(--color-nav-decks);
	}
	.desktop-links :global(a:nth-child(5) .nav-icon) {
		color: #c9a3bb;
	}
	:global(html.light) .desktop-links :global(a:nth-child(5) .nav-icon) {
		color: #82536e;
	}
	.account-controls {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.account-controls :global(.btn-icon) {
		width: 44px;
		min-width: 44px;
		height: 44px;
		min-height: 44px;
		padding: 0;
	}
	.account-controls :global(.game-symbol) {
		font-size: 16px;
	}
	@media (max-width: 1100px) {
		.nav-inner {
			gap: 1rem;
			padding: 0 1rem;
		}
	}
	@media (max-width: 1023px) {
		.desktop-links,
		.desktop-account {
			display: none;
		}
		.nav-inner {
			display: flex;
		}
	}
	@media (max-width: 700px) {
		.nav-inner {
			gap: 0.5rem;
			padding-inline: 1rem;
		}
		.brand-controls {
			gap: 0.25rem;
		}
		.brand-name {
			display: none;
		}
	}
</style>
