<script lang="ts">
	import { onMount } from 'svelte';
	import TooltipButton from '#lib/components/ui/tooltip/TooltipButton.svelte';
	type Theme = 'system' | 'light' | 'dark';
	let theme = $state<Theme>('system');
	const next = $derived(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system');
	onMount(() => {
		const sync = () => {
			theme = document.documentElement.dataset.theme as Theme;
		};
		sync();
		window.addEventListener('spellbook:theme-changed', sync);
		return () => window.removeEventListener('spellbook:theme-changed', sync);
	});
</script>

<TooltipButton
	label={`Theme: ${theme}. Switch to ${next}`}
	onclick={() => window.dispatchEvent(new CustomEvent('spellbook:set-theme', { detail: next }))}
>
	<svg
		aria-hidden="true"
		width="19"
		height="19"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.6"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		{#if theme === 'system'}<rect x="3" y="4" width="18" height="13" rx="2" /><path
				d="M8 21h8m-4-4v4"
			/>
		{:else if theme === 'light'}<circle cx="12" cy="12" r="4" /><path
				d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"
			/>
		{:else}<path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z" />{/if}
	</svg>
</TooltipButton>
