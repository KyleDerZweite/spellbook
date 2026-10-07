<script lang="ts">
	import { workspaceSavedState } from './workspace.svelte.ts';
	import type { ResourceSubscription } from './workspace.ts';
	let { resource }: { resource: ResourceSubscription | undefined } = $props();
	const transport = $derived(workspaceSavedState.getState());
	const resourceState = $derived(resource?.getState());
	const pending = $derived(Boolean(resource && (resourceState?.stale || transport !== 'live')));
	const immediate = $derived(
		Boolean(resourceState?.error) ||
			transport === 'offline' ||
			transport === 'recovering' ||
			transport === 'expired'
	);
	let visibleResource = $state.raw<ResourceSubscription>();
	$effect(() => {
		const owner = resource;
		if (!pending || immediate) {
			visibleResource = undefined;
			return;
		}
		const timer = setTimeout(() => (visibleResource = owner), 400);
		return () => {
			clearTimeout(timer);
			visibleResource = undefined;
		};
	});
</script>

{#if pending && (immediate || visibleResource === resource)}
	<div class="my-2 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
		<p role="status">
			{resourceState?.error ||
				(transport === 'live'
					? 'Refreshing saved changes.'
					: `Saved changes synchronization is ${transport}.`)}
		</p>
		{#if resourceState?.error || transport === 'offline' || transport === 'recovering'}
			<button
				type="button"
				class="btn btn-secondary"
				disabled={resourceState?.refreshing}
				onclick={() => resource?.invalidate()}>Retry saved data</button
			>
		{/if}
	</div>
{/if}
