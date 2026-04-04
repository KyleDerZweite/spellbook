<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { DropdownMenu } from 'bits-ui';
	import { spacetimeState } from '$lib/spacetimedb/state.svelte';

	const GAME_NAV_LINKS = {
		mtg: [
			{ href: '/mtg/search', label: 'Search' },
			{ href: '/mtg/inventory', label: 'Inventory' },
			{ href: '/mtg/decks', label: 'Decks' }
		]
	} as const;

	function getCurrentGame(pathname: string): keyof typeof GAME_NAV_LINKS | null {
		const [maybeGame] = pathname.split('/').filter(Boolean);
		return maybeGame === 'mtg' ? maybeGame : null;
	}

	function isActive(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	}

	const LANGUAGES = [
		{ id: 'EN', label: 'English', flag: '🇬🇧', disabled: false },
		{ id: 'DE', label: 'Deutsch', flag: '🇩🇪', disabled: true }
	] as const;

	let selectedLang = $state('EN');
	let mobileMenuOpen = $state(false);
	let currentGame = $derived(getCurrentGame(page.url.pathname));
	let navLinks = $derived(currentGame ? GAME_NAV_LINKS[currentGame] : []);
	let gameLabel = $derived(currentGame ? currentGame.toUpperCase() : 'Games');

	let userInitial = $derived(spacetimeState.userProfile?.username?.charAt(0).toUpperCase() ?? 'U');

	let userName = $derived(spacetimeState.userProfile?.username || 'User');
	let userEmail = $derived(spacetimeState.userProfile?.email ?? '');

	function closeMobileMenu() {
		mobileMenuOpen = false;
	}
</script>

<nav
	class="w-full shrink-0"
	style="background-color: var(--color-stone); border-bottom: 1px solid rgba(196, 146, 42, 0.3);"
>
	<!-- Main bar -->
	<div class="flex h-14 items-center justify-between px-4 sm:px-6">
		<!-- Logo -->
		<div class="flex items-center gap-3">
			<a
				href="/"
				class="font-display text-lg font-bold tracking-wider text-gold-bright no-underline transition-colors hover:text-amber"
				style="text-shadow: 0 0 12px rgba(232, 184, 75, 0.3);"
			>
				<i class="ms ms-library" aria-hidden="true"></i> SPELLBOOK
			</a>
			{#if currentGame}
				<a
					href="/"
					class="hidden rounded-full px-2.5 py-1 font-display text-[10px] uppercase tracking-[0.28em] text-text-secondary no-underline transition-colors hover:text-gold-bright sm:inline-flex"
					style="border: 1px solid rgba(196, 146, 42, 0.2); background: rgba(28, 23, 32, 0.65);"
				>
					{gameLabel}
				</a>
			{/if}
		</div>

		<!-- Center nav links: hidden on mobile -->
		<div class="hidden items-center gap-8 sm:flex">
			{#if navLinks.length > 0}
				{#each navLinks as link}
					<a
						href={link.href}
						class="font-display text-sm font-medium uppercase tracking-widest no-underline transition-all duration-150
							{isActive(link.href) ? 'text-gold-bright' : 'text-text-secondary hover:text-text-primary'}"
						style={isActive(link.href)
							? 'text-shadow: 0 0 8px rgba(232, 184, 75, 0.4); border-bottom: 2px solid var(--color-gold-bright); padding-bottom: 2px;'
							: 'border-bottom: 2px solid transparent; padding-bottom: 2px;'}
					>
						{link.label}
					</a>
				{/each}
			{:else}
				<span class="font-display text-xs uppercase tracking-[0.26em] text-text-muted">
					Choose Your Game
				</span>
			{/if}
		</div>

		<!-- Right zone -->
		<div class="flex items-center gap-2 sm:gap-3">
			<!-- Language selector: hidden on mobile (accessible via mobile menu) -->
			<div class="hidden sm:block">
				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						class="flex cursor-pointer items-center gap-1 rounded px-2 py-1 font-display text-xs font-bold uppercase tracking-wider text-text-secondary transition-colors hover:text-gold-bright"
						style="border: 1px solid rgba(196, 146, 42, 0.2); background: transparent;"
						aria-label="Language"
					>
						{selectedLang}
						<span class="text-[8px] text-text-muted">&#9660;</span>
					</DropdownMenu.Trigger>

					<DropdownMenu.Portal>
						<DropdownMenu.Content
							class="z-[100] min-w-[120px] overflow-hidden rounded py-1"
							style="
								background-color: var(--color-slate);
								border: 1px solid rgba(196, 146, 42, 0.4);
								box-shadow: 0 4px 24px rgba(13, 11, 15, 0.8);
							"
							sideOffset={8}
							align="end"
						>
							{#each LANGUAGES as lang}
								<DropdownMenu.Item
									class="flex cursor-pointer items-center gap-2 px-3 py-2 font-body text-sm transition-colors data-[highlighted]:bg-mist data-[highlighted]:text-amber
										{selectedLang === lang.id ? 'text-gold-bright' : 'text-text-primary'}"
									disabled={lang.disabled}
									onclick={() => {
										if (!lang.disabled) selectedLang = lang.id;
									}}
								>
									<span class="w-5 text-center">{lang.flag}</span>
									{lang.label}
									{#if lang.disabled}
										<span class="ml-auto font-mono text-[9px] text-text-muted">soon</span>
									{/if}
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Content>
					</DropdownMenu.Portal>
				</DropdownMenu.Root>
			</div>

			<!-- User menu -->
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full font-display text-xs font-bold transition-all duration-150 hover:ring-2 hover:ring-gold-dim"
					style="
						background-color: var(--color-slate);
						border: 1px solid rgba(196, 146, 42, 0.35);
						color: var(--color-gold-bright);
					"
					aria-label="User menu"
				>
					{userInitial}
				</DropdownMenu.Trigger>

				<DropdownMenu.Portal>
					<DropdownMenu.Content
						class="z-[100] min-w-[200px] overflow-hidden rounded py-1"
						style="
							background-color: var(--color-slate);
							border: 1px solid rgba(196, 146, 42, 0.4);
							box-shadow: 0 4px 24px rgba(13, 11, 15, 0.8);
						"
						sideOffset={8}
						align="end"
					>
						<!-- User info header -->
						<div class="px-3 py-2.5">
							<p class="font-display text-sm font-bold text-text-primary">{userName}</p>
							{#if userEmail}
								<p class="font-body text-xs text-text-muted">{userEmail}</p>
							{/if}
						</div>

						<DropdownMenu.Separator
							class="my-1 h-px"
							style="background-color: rgba(196, 146, 42, 0.15);"
						/>

						<!-- Active items -->
						<DropdownMenu.Item
							class="flex cursor-pointer items-center gap-2.5 px-3 py-2 font-body text-sm text-text-primary transition-colors data-[highlighted]:bg-mist data-[highlighted]:text-amber"
							onSelect={() => goto('/settings')}
						>
							<span class="w-4 text-center text-text-muted">&#9881;</span>
							Settings
						</DropdownMenu.Item>

						<DropdownMenu.Separator
							class="my-1 h-px"
							style="background-color: rgba(196, 146, 42, 0.15);"
						/>

						<!-- Disabled / coming soon items -->
						<DropdownMenu.Item
							class="flex items-center gap-2.5 px-3 py-2 font-body text-sm text-text-muted"
							disabled
						>
							<span class="w-4 text-center">&#9783;</span>
							Display Preferences
						</DropdownMenu.Item>

						<DropdownMenu.Item
							class="flex items-center gap-2.5 px-3 py-2 font-body text-sm text-text-muted"
							disabled
						>
							<span class="w-4 text-center">&#9743;</span>
							Mobile Companion
						</DropdownMenu.Item>

						<DropdownMenu.Item
							class="flex items-center gap-2.5 px-3 py-2 font-body text-sm text-text-muted"
							disabled
						>
							<span class="w-4 text-center">&#8693;</span>
							Import / Export
						</DropdownMenu.Item>

						<DropdownMenu.Separator
							class="my-1 h-px"
							style="background-color: rgba(196, 146, 42, 0.15);"
						/>

						<DropdownMenu.Item
							class="flex items-center gap-2.5 px-3 py-2 font-body text-sm text-text-muted"
							disabled
						>
							<span class="w-4 text-center">&#8614;</span>
							Sign Out
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>

			<!-- Hamburger: visible only on mobile -->
			<button
				onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
				class="flex h-9 w-9 cursor-pointer items-center justify-center rounded border-none sm:hidden"
				style="
					background-color: var(--color-slate);
					border: 1px solid rgba(196, 146, 42, 0.25);
					color: var(--color-text-secondary);
				"
				aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
				aria-expanded={mobileMenuOpen}
			>
				{#if mobileMenuOpen}
					&#10005;
				{:else}
					&#9776;
				{/if}
			</button>
		</div>
	</div>

	<!-- Mobile dropdown menu: absolutely positioned so it overlays content below -->
	{#if mobileMenuOpen}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 z-40 sm:hidden"
			style="top: 56px;"
			onclick={closeMobileMenu}
			onkeydown={(e) => {
				if (e.key === 'Escape') closeMobileMenu();
			}}
		>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="absolute left-0 right-0 top-0"
				style="
					background-color: var(--color-stone);
					border-bottom: 1px solid rgba(196, 146, 42, 0.3);
					box-shadow: 0 8px 24px rgba(13, 11, 15, 0.8);
					animation: fade-in 150ms ease-out;
				"
				onclick={(e) => e.stopPropagation()}
				onkeydown={() => {}}
			>
				<div class="flex flex-col py-2">
					{#if currentGame}
						<a
							href="/"
							onclick={closeMobileMenu}
							class="flex items-center gap-3 px-5 py-3.5 font-display text-sm uppercase tracking-widest text-text-muted no-underline transition-colors hover:text-gold-bright"
						>
							Games
						</a>
					{/if}

					{#each navLinks as link}
						<a
							href={link.href}
							onclick={closeMobileMenu}
							class="flex items-center gap-3 px-5 py-3.5 font-display text-sm uppercase tracking-widest no-underline transition-colors
								{isActive(link.href) ? 'text-gold-bright' : 'text-text-secondary'}"
							style={isActive(link.href)
								? 'border-left: 3px solid var(--color-gold-bright);'
								: 'border-left: 3px solid transparent;'}
						>
							{link.label}
						</a>
					{/each}

					<!-- Language row in mobile menu -->
					<div
						class="mx-5 mt-1 flex items-center justify-between py-3"
						style="border-top: 1px solid rgba(196, 146, 42, 0.1);"
					>
						<span class="font-display text-xs uppercase tracking-widest text-text-muted"
							>Language</span
						>
						<div class="flex gap-1.5">
							{#each LANGUAGES as lang}
								<button
									onclick={() => {
										if (!lang.disabled) selectedLang = lang.id;
									}}
									disabled={lang.disabled}
									class="cursor-pointer rounded px-2 py-1 font-display text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-40"
									style="
										background-color: {selectedLang === lang.id ? 'var(--color-mist)' : 'transparent'};
										border: 1px solid {selectedLang === lang.id ? 'var(--color-gold)' : 'rgba(196, 146, 42, 0.2)'};
										color: {selectedLang === lang.id ? 'var(--color-gold-bright)' : 'var(--color-text-secondary)'};
									"
									title={lang.label}
								>
									{lang.id}
								</button>
							{/each}
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</nav>
