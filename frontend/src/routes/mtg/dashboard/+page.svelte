<script lang="ts">
	import PlusIcon from '#lib/components/ui/PlusIcon.svelte';
	import WorkspaceHeader from '#lib/components/layout/WorkspaceHeader.svelte';
	import DashboardInsights from '#lib/components/dashboard/DashboardInsights.svelte';
	import { historyBoundaryTimer } from '#lib/valuation/history-boundary.ts';
	import MetricCards from '#lib/components/dashboard/MetricCards.svelte';
	import SavedStateStatus from '#lib/saved-state/SavedStateStatus.svelte';
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { workspaceSavedState } from '#lib/saved-state/workspace.svelte.ts';
	import { readSavedJSON } from '#lib/saved-state/read.ts';
	import type { ResourceSubscription } from '#lib/saved-state/workspace.ts';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	let retrying = $state(false);
	let dashboard = $state(untrack(() => data.dashboard));
	let loadError = $state(untrack(() => data.loadError));
	let subscription: ResourceSubscription | undefined = $state();
	let boundaryAccount = '';
	const boundaryTimer = historyBoundaryTimer(
		() => subscription?.invalidate(),
		() => workspaceSavedState.isActive(boundaryAccount) && document.visibilityState === 'visible'
	);
	$effect(() => {
		boundaryAccount = page.data.user?.accountId ?? '';
		boundaryTimer.schedule(dashboard?.inventoryValueHistory?.nextRefreshAt);
		return boundaryTimer.cancel;
	});

	onMount(() => {
		subscription = workspaceSavedState.subscribe({
			topics: ['inventory', 'decks', 'scan', 'values'],
			clear: () => {
				dashboard = null;
				loadError = '';
			},
			refresh: async (lease) => {
				const current = await readSavedJSON<NonNullable<typeof dashboard>>(
					'/api/v1/mtg/dashboard',
					lease
				);
				if (current && lease.current()) {
					dashboard = current;
					loadError = '';
				}
			}
		});
		return () => subscription?.dispose();
	});
	async function retry() {
		retrying = true;
		try {
			subscription?.invalidate();
		} finally {
			retrying = false;
		}
	}
</script>

<svelte:head
	><title>Dashboard | Spellbook</title><meta name="robots" content="noindex" /></svelte:head
>
<div class="workspace-container dashboard-page">
	<SavedStateStatus resource={subscription} />
	<WorkspaceHeader title="Dashboard" variant="overview">
		{#snippet actions()}<a href="/mtg/inventory" class="btn btn-secondary btn-sm">View inventory</a
			><a href="/mtg/search" class="btn btn-primary btn-sm"><PlusIcon />Add cards</a>{/snippet}
	</WorkspaceHeader>
	{#if loadError}
		<div class="dashboard-empty" role="alert">
			<p>{loadError}</p>
			<button class="btn btn-secondary btn-sm" onclick={retry} disabled={retrying}
				>{retrying ? 'Loading...' : 'Try again'}</button
			>
		</div>
	{:else if dashboard}
		<MetricCards {dashboard} demo={data.demoMode} />
		{#if dashboard.totals.total === 0}<div class="dashboard-empty">
				<p>Your inventory is empty. Add your first cards to start building your collection.</p>
				<a href="/mtg/search" class="btn btn-primary btn-sm">Find cards</a>
			</div>{/if}
		<DashboardInsights {dashboard} />
	{/if}
</div>

<style>
	.dashboard-page {
		width: min(calc(100% - 4.5rem), 100rem);
		padding-block: 68px 32px;
	}
	.dashboard-empty {
		padding: 24px;
		border: 1px solid var(--color-border);
		border-radius: 12px;
		color: var(--color-text-secondary);
		margin-bottom: 16px;
		font-size: 13px;
	}
	.dashboard-empty .btn {
		margin-top: 12px;
	}
	@media (max-width: 700px) {
		.dashboard-page {
			width: calc(100% - 2rem);
			padding-block: 24px 32px;
		}
	}
</style>
