<script lang="ts">
	import { page } from '$app/state';
	import { DropdownMenu } from 'bits-ui';
	import { spacetimeState } from '$lib/spacetimedb/state.svelte';

	const NAV_LINKS = [
		{ href: '/search', label: 'Search' },
		{ href: '/collections', label: 'Collections' }
	] as const;

	function isActive(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	}

	const LANGUAGES = [
		{ id: 'EN', label: 'English', flag: '🇬🇧', disabled: false },
		{ id: 'DE', label: 'Deutsch', flag: '🇩🇪', disabled: true }
	] as const;

	let selectedLang = $state('EN');

	let userInitial = $derived(
		spacetimeState.userProfile?.username?.charAt(0).toUpperCase() ?? 'U'
	);

	let userName = $derived(spacetimeState.userProfile?.username || 'User');
	let userEmail = $derived(spacetimeState.userProfile?.email ?? '');
</script>

<nav
	class="flex h-14 w-full shrink-0 items-center justify-between px-6"
	style="background-color: var(--color-stone); border-bottom: 1px solid rgba(196, 146, 42, 0.3);"
>
	<!-- Logo -->
	<a
		href="/"
		class="font-display text-lg font-bold tracking-wider text-gold-bright no-underline transition-colors hover:text-amber"
		style="text-shadow: 0 0 12px rgba(232, 184, 75, 0.3);"
	>
		<i class="ms ms-library" aria-hidden="true"></i> SPELLBOOK
	</a>

	<!-- Center nav links -->
	<div class="flex items-center gap-8">
		{#each NAV_LINKS as link}
			<a
				href={link.href}
				class="font-display text-sm font-medium uppercase tracking-widest no-underline transition-all duration-150
					{isActive(link.href)
					? 'text-gold-bright'
					: 'text-text-secondary hover:text-text-primary'}"
				style={isActive(link.href)
					? 'text-shadow: 0 0 8px rgba(232, 184, 75, 0.4); border-bottom: 2px solid var(--color-gold-bright); padding-bottom: 2px;'
					: 'border-bottom: 2px solid transparent; padding-bottom: 2px;'}
			>
				{link.label}
			</a>
		{/each}
	</div>

	<!-- Right zone -->
	<div class="flex items-center gap-3">

	<!-- Language selector -->
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
						onclick={() => { if (!lang.disabled) selectedLang = lang.id; }}
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
					href="/settings"
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

	</div><!-- /right zone -->
</nav>
