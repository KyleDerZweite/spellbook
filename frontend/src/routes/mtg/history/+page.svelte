<script lang="ts">
	import HistoryFilters from '#lib/components/valuation/HistoryFilters.svelte';
	import WorkspaceHeader from '#lib/components/layout/WorkspaceHeader.svelte';
	import { historyBoundaryTimer } from '#lib/valuation/history-boundary.ts';
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import type { InventoryValueHistory } from '@spellbook/contracts/inventory-value.ts';
	import type { ResourceSubscription } from '#lib/saved-state/workspace.ts';
	import { workspaceSavedState } from '#lib/saved-state/workspace.svelte.ts';
	import { readSavedJSON } from '#lib/saved-state/read.ts';
	import SavedStateStatus from '#lib/saved-state/SavedStateStatus.svelte';
	import InventoryValueHistoryView from '#lib/components/valuation/InventoryValueHistory.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	let history = $state<InventoryValueHistory | null>(untrack(() => data.history));
	let historyError = $state(untrack(() => data.historyError));
	let subscription: ResourceSubscription | undefined = $state();
	let boundaryAccount = '';
	const boundaryTimer = historyBoundaryTimer(
		() => subscription?.invalidate(),
		() => workspaceSavedState.isActive(boundaryAccount) && document.visibilityState === 'visible'
	);
	$effect(() => {
		boundaryAccount = page.data.user?.accountId ?? '';
		page.url.search;
		boundaryTimer.schedule(history?.nextRefreshAt);
		return boundaryTimer.cancel;
	});

	let serverScope = untrack(() => `${data.user?.accountId ?? ''}:${page.url.search}`);
	$effect(() => {
		const scope = `${data.user?.accountId ?? ''}:${page.url.search}`;
		data;
		untrack(() => {
			if (scope !== serverScope) {
				serverScope = scope;
				history = data.history;
				historyError = data.historyError;
			}
			subscription?.invalidate();
		});
	});
	onMount(() => {
		subscription = workspaceSavedState.subscribe({
			topics: ['values'],
			clear: () => {
				history = null;
				historyError = '';
			},
			refresh: async (lease) => {
				const account = page.data.user?.accountId,
					search = page.url.search;
				const current = () =>
					lease.current() && account === page.data.user?.accountId && search === page.url.search;
				try {
					const result = await readSavedJSON<InventoryValueHistory>(
						`/api/v1/mtg/inventory/value-history${search}`,
						{ signal: lease.signal, current }
					);
					if (result && current()) {
						history = result;
						historyError = '';
					}
				} catch (cause) {
					if (current()) historyError = 'Inventory history could not be loaded. Try again.';
					throw cause;
				}
			}
		});
		return () => subscription?.dispose();
	});
</script>

<svelte:head
	><title>Inventory history | Spellbook</title><meta name="robots" content="noindex" /></svelte:head
>
<div class="workspace-container space-y-4">
	<WorkspaceHeader title="Inventory history">
		{#snippet actions()}<a class="btn btn-secondary btn-sm" href="/mtg/dashboard">Dashboard</a
			>{/snippet}
	</WorkspaceHeader>
	<SavedStateStatus resource={subscription} />
	{#if data.query.printingId}<p class="text-sm text-text-muted">
			{data.printingName} · {data.query.finish ?? 'all finishes'} · {data.query.condition ??
				'all conditions'}.
			<a href="/mtg/history" class="underline">Full Inventory</a>
		</p>{/if}
	<HistoryFilters query={data.query} {history} />
	<InventoryValueHistoryView
		{history}
		error={historyError}
		onRetry={() => subscription?.invalidate()}
		demo={data.demoMode}
	/>
</div>
