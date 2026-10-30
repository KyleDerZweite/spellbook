<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { PageProps } from './$types';
	import WorkspaceHeader from '#lib/components/layout/WorkspaceHeader.svelte';
	import SavedStateStatus from '#lib/saved-state/SavedStateStatus.svelte';
	import { workspaceSavedState } from '#lib/saved-state/workspace.svelte.ts';
	import { readSavedJSON } from '#lib/saved-state/read.ts';
	import type { ResourceSubscription } from '#lib/saved-state/workspace.ts';
	import PrototypeSelector from '#lib/components/dashboard/prototypes/PrototypeSelector.svelte';
	import Design1 from '#lib/components/dashboard/prototypes/Dashboard1.prototype.svelte';
	import Design2 from '#lib/components/dashboard/prototypes/Dashboard2.prototype.svelte';
	import Design3 from '#lib/components/dashboard/prototypes/Dashboard3.prototype.svelte';
	import Design4 from '#lib/components/dashboard/prototypes/Dashboard4.prototype.svelte';
	import Design5 from '#lib/components/dashboard/prototypes/Dashboard5.prototype.svelte';
	import Design6 from '#lib/components/dashboard/prototypes/Dashboard6.prototype.svelte';
	import Design7 from '#lib/components/dashboard/prototypes/Dashboard7.prototype.svelte';
	import Design8 from '#lib/components/dashboard/prototypes/Dashboard8.prototype.svelte';
	let { data }: PageProps = $props();
	let dashboard = $state(untrack(() => data.dashboard));
	let subscription: ResourceSubscription | undefined = $state();
	const designs = [Design1, Design2, Design3, Design4, Design5, Design6, Design7, Design8];
	const Design = $derived(designs[data.design - 1]);
	onMount(() => {
		subscription = workspaceSavedState.subscribe({
			topics: ['inventory', 'decks', 'values'],
			clear: () => {
				dashboard = null;
			},
			refresh: async (lease) => {
				const current = await readSavedJSON<NonNullable<typeof dashboard>>(
					'/api/v1/mtg/dashboard',
					lease
				);
				if (current && lease.current()) dashboard = current;
			}
		});
		return () => subscription?.dispose();
	});
</script>

<svelte:head
	><title>Dashboard {data.design} | Spellbook</title><meta
		name="robots"
		content="noindex"
	/></svelte:head
>
<div class="workspace-container dashboard-prototype-page">
	<SavedStateStatus resource={subscription} /><WorkspaceHeader title="Dashboard"
		>{#snippet actions()}<a href="/mtg/search" class="btn btn-primary btn-sm">Add cards</a
			>{/snippet}</WorkspaceHeader
	>
	{#if dashboard}<div class="prototype-content" data-design={data.design}>
			<Design {dashboard} />
		</div>{:else}<div class="prototype-empty" role="status">
			<p>{data.loadError ?? 'Dashboard unavailable.'}</p>
			<button class="btn btn-secondary btn-sm" onclick={() => subscription?.invalidate()}
				>Try again</button
			>
		</div>{/if}
</div>
<PrototypeSelector design={data.design} />

<style>
	.dashboard-prototype-page {
		padding-bottom: 6rem;
	}
	.prototype-content {
		margin-top: 1.5rem;
		font-family: var(--font-interface);
		min-width: 0;
	}
	.prototype-empty {
		display: grid;
		justify-items: start;
		gap: 1rem;
		padding: 3rem 0;
		color: var(--color-text-secondary);
	}
</style>
