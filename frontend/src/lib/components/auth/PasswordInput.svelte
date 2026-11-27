<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import type { HTMLInputAttributes } from 'svelte/elements';

	let { ...attributes }: Omit<HTMLInputAttributes, 'type' | 'class'> = $props();
	let visible = $state(false);
</script>

<div class="password-field">
	<input {...attributes} type={visible ? 'text' : 'password'} class="input password-input" />
	<button
		type="button"
		disabled={attributes.disabled}
		class="btn btn-ghost password-toggle"
		aria-label={visible ? language.t('ui.Hide.password') : language.t('ui.Show.password')}
		aria-controls={attributes.id}
		onclick={() => (visible = !visible)}
	>
		{#if visible}
			<EyeOff size={20} aria-hidden="true" />
		{:else}
			<Eye size={20} aria-hidden="true" />
		{/if}
	</button>
</div>

<style>
	.password-field {
		position: relative;
	}
	.password-input {
		padding-right: 3.25rem;
	}
	.password-toggle {
		position: absolute;
		right: 0;
		top: 50%;
		transform: translateY(-50%);
		width: 44px;
		height: 44px;
		padding: 0;
		border: 0;
	}
</style>
