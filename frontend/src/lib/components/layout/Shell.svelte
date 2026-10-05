<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { asset } from '$app/paths';
	import Nav from './Nav.svelte';
	import Footer from './Footer.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
	const isAuth = $derived(
		page.url.pathname === '/auth/login' || page.url.pathname === '/auth/register'
	);
</script>

<div class="app-shell bg-background">
	{#if isAuth}
		<header class="auth-header">
			<a href="/" aria-label="Spellbook home" class="auth-brand"
				><img src={asset('logo.webp')} alt="" width="32" height="32" />Spellbook</a
			>
			<div class="flex items-center gap-1">
				<ThemeToggle /><a href="/" class="btn btn-ghost">Home</a>
			</div>
		</header>
	{:else}<Nav />{/if}
	<main id="main-content" tabindex="-1" class="app-main">
		<div class="app-content">
			{@render children()}
		</div>
		<Footer />
	</main>
</div>

<style>
	.app-content:has(> :global(.public-home)) {
		display: flex;
		flex-direction: column;
	}
	.app-shell {
		--app-header-height: 72px;
	}
	@media (max-width: 1023px) {
		.app-shell {
			--app-header-height: 64px;
		}
	}
</style>
