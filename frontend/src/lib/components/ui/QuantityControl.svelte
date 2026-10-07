<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import type { Snippet } from 'svelte';
	import Button from './button/Button.svelte';
	let {
		quantity,
		label,
		action,
		submit,
		fields,
		disabled = false,
		maxQuantity = Infinity
	}: {
		quantity: number;
		label: string;
		action: string;
		submit: SubmitFunction;
		fields: Snippet<[number]>;
		disabled?: boolean;
		maxQuantity?: number;
	} = $props();
</script>

<div class="quantity-control">
	{#each [-1, 1] as delta}{#if delta === 1}<span class="quantity" aria-label={`${quantity} copies`}
				>{quantity}</span
			>{/if}
		<form method="POST" {action} use:enhance={submit}>
			{@render fields(delta)}<Button
				variant="ghost"
				size="icon"
				type="submit"
				disabled={disabled ||
					(delta === -1 && quantity <= 1) ||
					(delta === 1 && quantity >= maxQuantity)}
				aria-label={`${delta === -1 ? 'Decrease' : 'Increase'} ${label} quantity`}
				><svg
					aria-hidden="true"
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					><path d="M5 12h14" />{#if delta === 1}<path d="M12 5v14" />{/if}</svg
				></Button
			>
		</form>{/each}
</div>

<style>
	.quantity-control {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.125rem;
	}
	.quantity {
		min-width: 2rem;
		text-align: center;
		font-size: 0.8125rem;
		font-variant-numeric: tabular-nums;
	}
	.quantity-control :global(.btn-icon) {
		width: 2rem;
		height: 2rem;
		min-height: 2rem;
		padding: 0;
	}
	@media (max-width: 600px) {
		.quantity {
			min-width: 1.5rem;
		}
		.quantity-control :global(.btn-icon) {
			width: 2.75rem;
			height: 2.75rem;
			min-height: 2.75rem;
		}
	}
</style>
