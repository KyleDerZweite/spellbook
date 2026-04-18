<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Dialog, DropdownMenu } from 'bits-ui';
	import { authState } from '$lib/auth/state.svelte';
	import GameSwitcher from './GameSwitcher.svelte';

	// Decks is implemented at /decks but intentionally hidden from the
	// navigation while search, inventory, and scan are the product focus.
	// The route still works via direct URL.
	interface NavLink {
		href: string;
		label: string;
		shortcut?: string;
	}

	const NAV_LINKS: readonly NavLink[] = [
		{ href: '/search', label: 'Search', shortcut: '⌘K' },
		{ href: '/inventory', label: 'Inventory' }
	];

	let mobileMenuOpen = $state(false);

	const userInitial = $derived(authState.user?.username?.charAt(0).toUpperCase() ?? 'U');
	const userName = $derived(authState.user?.username || 'User');
	const userEmail = $derived(authState.user?.email ?? '');
	const isAuthenticated = $derived(authState.isAuthenticated);

	function isActive(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	}

	function closeMobileMenu() {
		mobileMenuOpen = false;
	}
</script>

<nav class="w-full shrink-0 border-b border-gold/20 bg-stone" aria-label="Primary">
	<div class="flex h-14 items-center justify-between px-4 sm:px-6">
		<!-- Left: logo + game dropdown -->
		<div class="flex items-center gap-3">
			<a
				href="/"
				class="font-display text-lg font-bold tracking-wider text-gold-bright no-underline transition-colors hover:text-amber"
				aria-label="Spellbook home"
			>
				<i class="ms ms-library" aria-hidden="true"></i> SPELLBOOK
			</a>
			<div class="hidden sm:block">
				<GameSwitcher />
			</div>
		</div>

		<!-- Center: flat link list -->
		<div class="hidden items-center gap-8 sm:flex">
			{#each NAV_LINKS as link}
				{@const active = isActive(link.href)}
				<a
					href={link.href}
					aria-current={active ? 'page' : undefined}
					class="nav-link {active ? 'nav-link--active' : ''}"
				>
					<span>{link.label}</span>
					{#if link.shortcut}
						<kbd
							class="ml-2 hidden rounded border border-gold/15 bg-slate px-1 py-0.5 font-mono text-[9px] font-normal tracking-normal text-text-muted lg:inline"
							aria-hidden="true"
						>
							{link.shortcut}
						</kbd>
					{/if}
				</a>
			{/each}
		</div>

		<!-- Right: user menu / sign-in -->
		<div class="flex items-center gap-2 sm:gap-3">
			{#if isAuthenticated}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-gold/35 bg-slate font-display text-xs font-bold text-gold-bright transition-all duration-150 hover:ring-2 hover:ring-gold-dim"
						aria-label="User menu"
					>
						{userInitial}
					</DropdownMenu.Trigger>

					<DropdownMenu.Portal>
						<DropdownMenu.Content
							class="surface-menu z-100 min-w-[220px] overflow-hidden rounded py-1"
							sideOffset={8}
							align="end"
						>
							<div class="px-3 py-2.5">
								<p class="font-display text-sm font-bold text-text-primary">{userName}</p>
								{#if userEmail}
									<p class="font-body text-xs text-text-muted">{userEmail}</p>
								{/if}
							</div>

							<DropdownMenu.Separator class="my-1 h-px bg-gold/15" />

							<DropdownMenu.Item class="menu-item" onSelect={() => goto('/settings')}>
								Settings
							</DropdownMenu.Item>

							<DropdownMenu.Item class="menu-item" onSelect={() => goto('/auth/logout')}>
								Sign Out
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Portal>
				</DropdownMenu.Root>
			{:else}
				<a
					href={`/auth/login?returnTo=${encodeURIComponent(`${page.url.pathname}${page.url.search}`)}`}
					class="rounded border border-gold/35 bg-slate px-3 py-2 font-display text-[10px] uppercase tracking-[0.22em] text-gold-bright no-underline transition-colors hover:text-amber"
				>
					Sign In
				</a>
			{/if}

			<!-- Hamburger: mobile only -->
			<button
				onclick={() => (mobileMenuOpen = true)}
				class="flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-gold/25 bg-slate text-text-secondary sm:hidden"
				aria-label="Open navigation menu"
				aria-expanded={mobileMenuOpen}
				aria-controls="mobile-menu-dialog"
			>
				&#9776;
			</button>
		</div>
	</div>
</nav>

<Dialog.Root bind:open={mobileMenuOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="filter-overlay fixed inset-0 z-40 sm:hidden" />
		<Dialog.Content
			id="mobile-menu-dialog"
			class="fixed left-0 right-0 top-14 z-50 border-b border-gold/25 bg-stone shadow-[0_8px_24px_rgba(13,11,15,0.8)] sm:hidden"
		>
			<Dialog.Title class="sr-only">Navigation menu</Dialog.Title>
			<Dialog.Description class="sr-only">
				Switch the active game or jump to a primary section.
			</Dialog.Description>
			<div class="flex flex-col py-2">
				<div class="flex items-center justify-between gap-3 px-5 py-3">
					<GameSwitcher />
					<Dialog.Close
						class="flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-gold/25 bg-slate text-text-secondary"
						aria-label="Close navigation menu"
					>
						&#10005;
					</Dialog.Close>
				</div>

				{#each NAV_LINKS as link}
					{@const active = isActive(link.href)}
					<a
						href={link.href}
						aria-current={active ? 'page' : undefined}
						onclick={closeMobileMenu}
						class="mobile-nav-link {active ? 'mobile-nav-link--active' : ''}"
					>
						{link.label}
					</a>
				{/each}
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
