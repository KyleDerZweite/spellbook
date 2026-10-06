<script lang="ts">
	import { tick } from 'svelte';
	import { getSearchSession } from '#lib/search/session.svelte.ts';
	import { isPrimaryClick } from '#lib/search/navigation.ts';
	import type { ComponentProps } from 'svelte';
	import { page } from '$app/state';
	import { asset } from '$app/paths';
	import { Dialog } from 'bits-ui';
	import ActionMenu from '#lib/components/ui/menu/ActionMenu.svelte';
	import Avatar from '#lib/components/profile/Avatar.svelte';
	import AuthEntry from './AuthEntry.svelte';
	import ThemeToggle from './ThemeToggle.svelte';
	import GameSwitcher from './GameSwitcher.svelte';

	let { scrollViewport }: { scrollViewport: HTMLElement | null } = $props();

	const search = getSearchSession();
	const user = $derived(page.data.user);
	const NAV_LINKS = $derived([
		{
			href: user ? '/mtg/dashboard' : '/',
			label: user ? 'Dashboard' : 'Home',
			icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'
		},
		{
			href: '/mtg/search',
			label: 'Search',
			icon: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0'
		},
		{ href: '/mtg/inventory', label: 'Inventory', icon: 'M4 4h16v16H4zM4 10h16M10 10v10' },
		{
			href: '/mtg/decks',
			label: 'Decks',
			icon: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5'
		},
		{
			href: '/mtg/scan',
			label: 'Scan',
			icon: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 12h10'
		}
	]);

	let collapsed = $state(false);
	$effect(() => {
		const main = scrollViewport;
		const update = () => {
			const top = main?.scrollTop ?? 0;
			if (top > 160) collapsed = true;
			else if (top < 80) collapsed = false;
		};
		main?.addEventListener('scroll', update, { passive: true });
		update();
		return () => main?.removeEventListener('scroll', update);
	});
	let mobileMenuOpen = $state(false);
	let logoutForm: HTMLFormElement | undefined = $state();
	const userName = $derived(user?.username || 'Account');
	const accountActions: ComponentProps<typeof ActionMenu>['items'] = [
		{ label: 'Settings', href: '/settings' },
		{ label: 'App coming soon', disabled: true },
		{ label: 'Sign out', onSelect: () => logoutForm?.requestSubmit() }
	];

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
		return path === href || path.startsWith(href + '/');
	}
</script>

<a
	href="#main-content"
	class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-[200] focus:rounded focus:bg-gold focus:px-4 focus:py-2 focus:text-text-on-gold"
	>Skip to content</a
>

<nav class="primary-nav" class:collapsed aria-label="Primary">
	<div class="nav-inner">
		<div class="brand-controls">
			<a
				href="/"
				class="brand-link font-display font-normal tracking-tight text-foreground no-underline"
				aria-label="Spellbook home"
			>
				<img src={asset('logo.webp')} alt="" width="36" height="36" class="shrink-0" />
				<span class="brand-name">Spellbook</span>
			</a>
		</div>
		<div class="desktop-links">
			{#each NAV_LINKS as link}
				<a
					href={link.href}
					onclick={link.href === '/mtg/search' ? (event) => searchClick(event) : undefined}
					aria-label={link.label}
					title={link.label}
					aria-current={isActive(link.href) ? 'page' : undefined}
					class="nav-link {isActive(link.href) ? 'nav-link--active' : ''}"
					><svg
						aria-hidden="true"
						width={link.href === '/' || link.href === '/mtg/dashboard' ? 18 : 14}
						height={link.href === '/' || link.href === '/mtg/dashboard' ? 18 : 14}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						class="nav-icon"
						stroke-width="1.5"><path d={link.icon} /></svg
					><span class="nav-label">{link.label}</span></a
				>
			{/each}
		</div>
		<div class="account-controls">
			<GameSwitcher />
			<ThemeToggle />
			{#if user}
				<form method="POST" action="/auth/logout" bind:this={logoutForm}></form>
			{/if}
			<div class="desktop-account">
				{#if user}
					<ActionMenu label="Account menu" iconOnly items={accountActions}>
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
					class="btn btn-secondary btn-icon lg:hidden"
					aria-label="Open navigation menu"
					><svg
						aria-hidden="true"
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"><path d="M4 6h16M4 12h16M4 18h16" /></svg
					></Dialog.Trigger
				>
				<Dialog.Portal>
					<Dialog.Overlay class="filter-overlay fixed inset-0 z-40" />
					<Dialog.Content
						class="fixed inset-x-3 top-3 z-50 max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-xl border border-border bg-stone p-2 shadow-xl"
					>
						<div class="flex items-center justify-between p-3">
							<Dialog.Title class="font-semibold tracking-tight">Spellbook</Dialog.Title>
							<Dialog.Close class="btn btn-ghost" aria-label="Close navigation menu">✕</Dialog.Close
							>
						</div>
						<Dialog.Description class="sr-only"
							>Navigate your Magic card workspace.</Dialog.Description
						>
						{#each NAV_LINKS as link}
							<a
								href={link.href}
								aria-current={isActive(link.href) ? 'page' : undefined}
								onclick={(event) => {
									if (link.href === '/mtg/search') searchClick(event, true);
									else mobileMenuOpen = false;
								}}
								class="mobile-nav-link {isActive(link.href) ? 'mobile-nav-link--active' : ''}"
								>{link.label}</a
							>
						{/each}
						<div class="mobile-account">
							{#if user}
								{@render accountIdentity()}
								<div class="mobile-account-actions">
									{#each accountActions as item}
										{#if item.href}<a
												href={item.href}
												class="btn btn-ghost"
												onclick={() => (mobileMenuOpen = false)}>{item.label}</a
											>
										{:else}<button
												class="btn btn-ghost"
												disabled={item.disabled}
												onclick={() => {
													if (item.disabled) return;
													mobileMenuOpen = false;
													item.onSelect?.();
												}}>{item.label}</button
											>{/if}
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

{#snippet accountIdentity()}
	<div class="account-identity">
		<Avatar id={user?.avatarId} size={28} />
		<span>{userName}</span>
	</div>
{/snippet}

<style>
	.account-identity {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
		font-size: 0.875rem;
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
		gap: 0;
		margin: 0.5rem 0 0 -0.875rem;
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
		position: relative;
		z-index: 20;
		background: color-mix(in srgb, var(--color-background) 88%, transparent);
		backdrop-filter: blur(12px);
	}
	.primary-nav::after {
		content: '';
		position: absolute;
		inset: 100% 0 auto;
		height: 18px;
		background: linear-gradient(
			to bottom,
			color-mix(in srgb, var(--color-background) 88%, transparent),
			transparent
		);
		pointer-events: none;
	}
	.primary-nav + :global(.app-main) {
		margin-top: calc(-1 * var(--app-header-height));
	}
	.primary-nav + :global(.app-main .app-main-viewport) {
		scroll-padding-top: calc(var(--app-header-height) + 18px);
	}
	.primary-nav + :global(.app-main .app-content) {
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
		gap: 0.2rem;
		justify-content: center;
	}
	.desktop-links :global(a:nth-child(1) .nav-icon) {
		color: #b7a7e5;
	}
	.desktop-links :global(a:nth-child(2) .nav-icon) {
		color: #8cbbdd;
	}
	.desktop-links :global(a:nth-child(3) .nav-icon) {
		color: #d4ac86;
	}
	.desktop-links :global(a:nth-child(4) .nav-icon) {
		color: #93bea6;
	}
	.desktop-links :global(a:nth-child(5) .nav-icon) {
		color: #c9a3bb;
	}
	:global(html.light) .desktop-links :global(a:nth-child(1) .nav-icon) {
		color: #7156a0;
	}
	:global(html.light) .desktop-links :global(a:nth-child(2) .nav-icon) {
		color: #326184;
	}
	:global(html.light) .desktop-links :global(a:nth-child(3) .nav-icon) {
		color: #845830;
	}
	:global(html.light) .desktop-links :global(a:nth-child(4) .nav-icon) {
		color: #35694d;
	}
	:global(html.light) .desktop-links :global(a:nth-child(5) .nav-icon) {
		color: #82536e;
	}
	.account-controls {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0;
	}
	.account-controls :global(.btn-icon) {
		width: 44px;
		min-width: 44px;
		height: 44px;
		min-height: 44px;
		padding: 0;
	}
	.account-controls > :global(.btn-icon svg) {
		width: 16px;
		height: 16px;
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
