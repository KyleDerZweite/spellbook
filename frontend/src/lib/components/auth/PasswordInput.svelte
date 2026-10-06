<script lang="ts">
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
		aria-label={visible ? 'Hide password' : 'Show password'}
		aria-controls={attributes.id}
		onclick={() => (visible = !visible)}
	>
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
			<circle cx="12" cy="12" r="3" />
			{#if visible}<path d="m3 3 18 18" />{/if}
		</svg>
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
