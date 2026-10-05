<script lang="ts">
	import type { PageProps } from './$types';
	import ScanWorkspace from './ScanWorkspace.svelte';
	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Scan | Spellbook</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#key data.result?.session?.id ?? 'new'}
	<ScanWorkspace sessions={data.sessions} initialResult={data.result} />
{/key}
