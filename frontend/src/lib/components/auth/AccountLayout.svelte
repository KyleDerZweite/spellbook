<script lang="ts">
	import { asset } from '$app/paths';
	import type { Snippet } from 'svelte';

	let { title, children, aside }: { title: string; children: Snippet; aside?: Snippet } = $props();
</script>

<div class="account-layout" class:with-aside={!!aside}>
	<section class="account-form">
		<div class="account-heading">
			{#if !aside}<img src={asset('logo.webp')} alt="" width="64" height="64" />{/if}
			<h1>{title}</h1>
		</div>
		{@render children()}
	</section>
	{#if aside}<aside class="account-aside">{@render aside()}</aside>{/if}
</div>

<style>
	.with-aside {
		max-width: 848px;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 240px;
		gap: 3rem;
		align-items: center;
		padding: 2rem;
		border: 1px solid var(--color-border);
		border-radius: 1rem;
		background: var(--color-card);
	}
	.account-form,
	.account-aside {
		min-width: 0;
	}
	@media (max-width: 700px) {
		.with-aside {
			grid-template-columns: minmax(0, 1fr);
			gap: 2rem;
			max-width: 480px;
			padding: 1.5rem;
		}
		.account-aside {
			border-top: 1px solid var(--color-border);
			padding-top: 1.5rem;
		}
	}
	.account-heading {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1.75rem;
	}
	.account-heading h1 {
		text-align: center;
	}
</style>
