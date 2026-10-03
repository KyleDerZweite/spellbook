<script lang="ts">
	import { page } from '$app/state';
	import { asset } from '$app/paths';
	import { Dialog, DropdownMenu } from 'bits-ui';

	const NAV_LINKS = [
		{ href: '/search', label: 'Card search' },
		{ href: '/decks', label: 'Deck builder' },
		{ href: '/inventory', label: 'Inventory' },
		{ href: '/scan', label: 'Scan review' }
	];

	let mobileMenuOpen = $state(false);
	let logoutForm: HTMLFormElement | undefined = $state();
	const user = $derived(page.data.user);
	const userName = $derived(user?.username || 'Account');
	const loginUrl = $derived(
		`/auth/login?returnTo=${encodeURIComponent(`${page.url.pathname}${page.url.search}`)}`
	);

	function isActive(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	}
</script>

<a
	href="#main-content"
	class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-[200] focus:rounded focus:bg-gold focus:px-4 focus:py-2 focus:text-text-on-gold"
	>Skip to content</a
>

<nav class="shrink-0 border-b border-border bg-stone" aria-label="Primary">
	<div class="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
		<a
			href="/"
			class="flex items-center gap-2.5 font-display text-base font-bold tracking-wide text-gold-bright no-underline"
			aria-label="Spellbook home"
		>
			<img src={asset('logo.webp')} alt="" width="32" height="32" class="h-8 w-8 shrink-0" />
			Spellbook
		</a>
		<div class="hidden h-full items-center gap-6 md:flex">
			{#each NAV_LINKS as link}
				<a
					href={link.href}
					aria-current={isActive(link.href) ? 'page' : undefined}
					class="nav-link {isActive(link.href) ? 'nav-link--active' : ''}">{link.label}</a
				>
			{/each}
		</div>
		<div class="flex items-center gap-2">
			{#if user}
				<form method="POST" action="/auth/logout" bind:this={logoutForm}></form>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						class="btn btn-secondary max-w-24 sm:max-w-40"
						aria-label="Account menu"
					>
						<span class="truncate">{userName}</span><span
							aria-hidden="true"
							class="text-xs text-text-muted">▾</span
						>
					</DropdownMenu.Trigger>
					<DropdownMenu.Portal>
						<DropdownMenu.Content
							class="surface-menu z-100 min-w-56 max-w-80 rounded-lg p-1"
							sideOffset={8}
							align="end"
						>
							<div class="px-3 py-2">
								<p class="text-sm font-semibold">{userName}</p>
								{#if user.email}<p class="break-all text-xs text-text-muted">{user.email}</p>{/if}
							</div>
							<DropdownMenu.Separator class="my-1 h-px bg-border" />
							<DropdownMenu.Item
								class="menu-item rounded"
								onSelect={() => logoutForm?.requestSubmit()}>Sign out</DropdownMenu.Item
							>
						</DropdownMenu.Content>
					</DropdownMenu.Portal>
				</DropdownMenu.Root>
			{:else}
				<a href={loginUrl} class="btn btn-ghost">Sign in</a>
				<a href="/auth/register" class="btn btn-primary hidden sm:inline-flex">Create account</a>
			{/if}
			<Dialog.Root bind:open={mobileMenuOpen}>
				<Dialog.Trigger class="btn btn-secondary md:hidden" aria-label="Open navigation menu"
					><span aria-hidden="true">☰</span></Dialog.Trigger
				>
				<Dialog.Portal>
					<Dialog.Overlay class="filter-overlay fixed inset-0 z-40" />
					<Dialog.Content
						class="fixed inset-x-3 top-3 z-50 rounded-xl border border-border bg-stone p-2 shadow-xl"
					>
						<div class="flex items-center justify-between p-3">
							<Dialog.Title class="font-semibold">Spellbook</Dialog.Title>
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
								onclick={() => (mobileMenuOpen = false)}
								class="mobile-nav-link {isActive(link.href) ? 'mobile-nav-link--active' : ''}"
								>{link.label}</a
							>
						{/each}
						{#if !user}<a
								href="/auth/register"
								onclick={() => (mobileMenuOpen = false)}
								class="mobile-nav-link">Create account</a
							>{/if}
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
		</div>
	</div>
</nav>
