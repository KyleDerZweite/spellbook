<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { onMount } from 'svelte';
	import Monitor from '@lucide/svelte/icons/monitor';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
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
	label={language.t('message.Theme.p0.Switch.to.p1', {
		p0: language.t(`theme.${theme}`),
		p1: language.t(`theme.${next}`)
	})}
	onclick={() => window.dispatchEvent(new CustomEvent('spellbook:set-theme', { detail: next }))}
>
	{#if theme === 'system'}
		<Monitor size={20} aria-hidden="true" />
	{:else if theme === 'light'}
		<Sun size={20} aria-hidden="true" />
	{:else}
		<Moon size={20} aria-hidden="true" />
	{/if}
</TooltipButton>
