<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(() => {
		goto('/mtg/inventory', { replaceState: true });
	});
</script>

<p class="px-6 py-8 font-body text-sm text-text-secondary">Redirecting to MTG inventory...</p>
