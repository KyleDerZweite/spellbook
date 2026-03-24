<script lang="ts">
	import { page } from '$app/state';

	const NAV_LINKS = [
		{ href: '/search', label: 'Search' },
		{ href: '/collections', label: 'Collections' }
	] as const;

	function isActive(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	}
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
		&#9889; SPELLBOOK
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
	<div class="flex items-center gap-4">
		<button
			class="flex h-8 w-8 items-center justify-center rounded text-text-secondary transition-colors hover:text-gold-bright"
			aria-label="Settings"
			style="border: 1px solid rgba(196, 146, 42, 0.2);"
		>
			&#9881;
		</button>
		<div
			class="flex h-8 w-8 items-center justify-center rounded-full bg-slate font-display text-xs text-text-secondary"
			style="border: 1px solid rgba(196, 146, 42, 0.25);"
		>
			U
		</div>
	</div>
</nav>
