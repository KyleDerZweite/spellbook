<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		title,
		metadata,
		actions,
		variant = 'default'
	}: {
		title: string;
		metadata?: Snippet;
		actions?: Snippet;
		variant?: 'default' | 'overview';
	} = $props();
</script>

<header class="workspace-header" class:overview={variant === 'overview'}>
	<div class="workspace-heading">
		<div class="page-title"><h1>{title}</h1></div>
		{#if metadata}{@render metadata()}{/if}
	</div>
	<div class="workspace-actions">{@render actions?.()}</div>
</header>

<style>
	.overview .page-title h1 {
		font-size: clamp(2rem, 2.4vw, 2.5rem);
		font-weight: 400;
		line-height: 1.2;
		letter-spacing: -0.02em;
	}
	.workspace-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
		min-width: 0;
	}
	.workspace-heading {
		min-width: 0;
	}
	.workspace-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	@media (max-width: 600px) {
		.workspace-header {
			align-items: flex-start;
			flex-wrap: wrap;
			gap: 0.75rem;
		}
	}
</style>
