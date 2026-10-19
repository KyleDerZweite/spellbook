<script lang="ts">
	import { asset } from '$app/paths';
	import type { Snippet } from 'svelte';

	let { title, children, aside }: { title: string; children: Snippet; aside?: Snippet } = $props();
</script>

<div class="account-layout" class:with-aside={!!aside}>
	<section class="account-form">
		<div class="account-heading">
			<img src={asset('logo.webp')} alt="" width="64" height="64" />
			<h1>{title}</h1>
		</div>
		{@render children()}
	</section>
	{#if aside}<aside class="account-aside">{@render aside()}</aside>{/if}
</div>

<style>
	.with-aside {
		max-width: 880px;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 3rem;
		align-items: center;
	}
	.account-aside {
		border-left: 1px solid var(--color-border);
		padding-left: 3rem;
	}
	@media (max-width: 700px) {
		.with-aside {
			grid-template-columns: minmax(0, 1fr);
			gap: 2rem;
			max-width: 480px;
		}
		.account-aside {
			border-left: 0;
			border-top: 1px solid var(--color-border);
			padding: 2rem 0 0;
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
