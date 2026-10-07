<script lang="ts">
	import { workspaceSavedState } from './workspace.svelte.ts';
	import type { ResourceSubscription } from './workspace.ts';
	let { resource }: { resource: ResourceSubscription | undefined } = $props();
	const transport = $derived(workspaceSavedState.getState());
	const state = $derived(resource?.getState());
</script>

{#if resource && (state?.stale || transport !== 'live')}
	<div class="my-2 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
		<p role="status">
			{state?.error ||
				(transport === 'live'
					? 'Refreshing saved changes.'
					: `Saved changes synchronization is ${transport}.`)}
		</p>
		{#if state?.error || transport === 'offline' || transport === 'recovering'}
			<button
				type="button"
				class="btn btn-secondary"
				disabled={state?.refreshing}
				onclick={() => resource?.invalidate()}>Retry saved data</button
			>
		{/if}
	</div>
{/if}
