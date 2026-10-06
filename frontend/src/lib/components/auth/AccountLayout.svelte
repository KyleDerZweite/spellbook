<script lang="ts">
	import { asset } from '$app/paths';
	import type { Snippet } from 'svelte';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<div class="account-layout">
	<section class="account-form">
		<div class="account-heading">
			<img src={asset('logo.webp')} alt="" width="64" height="64" />
			<h1>{title}</h1>
		</div>
		{@render children()}
	</section>
</div>

<style>
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
