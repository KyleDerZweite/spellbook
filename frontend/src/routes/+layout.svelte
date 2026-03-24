<script lang="ts">
	import '../app.css';
	import Shell from '$lib/components/layout/Shell.svelte';
	import { browser } from '$app/environment';
	import { connect, disconnect } from '$lib/spacetimedb/client';
	import type { Snippet } from 'svelte';

	interface Props {
		data: { user: App.Locals['user'] };
		children: Snippet;
	}

	let { data, children }: Props = $props();

	$effect(() => {
		if (browser && data.user) {
			connect(data.user);
			return () => disconnect();
		}
	});
</script>

<Shell>
	{@render children()}
</Shell>
