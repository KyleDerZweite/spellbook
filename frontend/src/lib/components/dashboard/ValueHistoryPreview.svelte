<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { historyBoundaryTimer } from '#lib/valuation/history-boundary.ts';
	import type {
		InventoryValueHistory,
		InventoryValueHistoryRequest
	} from '@spellbook/contracts/inventory-value.ts';
	import type { ResourceSubscription } from '#lib/saved-state/workspace.ts';
	import { workspaceSavedState } from '#lib/saved-state/workspace.svelte.ts';
	import { readSavedJSON } from '#lib/saved-state/read.ts';
	import HistoryFilters from '#lib/components/valuation/HistoryFilters.svelte';
	import InventoryValueHistoryView from '#lib/components/valuation/InventoryValueHistory.svelte';
	let {
		initialHistory,
		demo = false
	}: { initialHistory: InventoryValueHistory | null; demo?: boolean } = $props();
	let history = $state(untrack(() => initialHistory));
	let query = $state<InventoryValueHistoryRequest>({ days: 30 });
	let error = $state('');
	let loading = $state(false);
	let subscription: ResourceSubscription | undefined;
	let parameters = $state(new URLSearchParams({ days: '30' }));
	let boundaryAccount = '';
	const boundaryTimer = historyBoundaryTimer(
		() => subscription?.invalidate(),
		() => workspaceSavedState.isActive(boundaryAccount) && document.visibilityState === 'visible'
	);
	$effect(() => {
		boundaryAccount = page.data.user?.accountId ?? '';
		boundaryTimer.schedule(history?.nextRefreshAt);
		return boundaryTimer.cancel;
	});
	onMount(() => {
		subscription = workspaceSavedState.subscribe({
			topics: ['values'],
			clear: () => {
				history = null;
				error = '';
			},
			refresh: async (lease) => {
				loading = true;
				try {
					const result = await readSavedJSON<InventoryValueHistory>(
						`/api/v1/mtg/inventory/value-history?${parameters}`,
						lease
					);
					if (result && lease.current()) {
						history = result;
						error = '';
					}
				} catch (cause) {
					if (lease.current())
						error = 'History could not be loaded. Choose a valid period and try again.';
					throw cause;
				} finally {
					if (lease.current()) loading = false;
				}
			}
		});
		return () => subscription?.dispose();
	});
	function navigate(params: URLSearchParams) {
		parameters = params;
		query = {
			...Object.fromEntries(params),
			...(params.has('days') ? { days: Number(params.get('days')) } : {})
		};
		history = null;
		error = '';
		subscription?.invalidate();
	}
</script>

<HistoryFilters {query} {history} onNavigate={navigate} />
<InventoryValueHistoryView
	{history}
	{error}
	{loading}
	{demo}
	onRetry={() => subscription?.invalidate()}
/>
<a class="btn btn-primary full-history" href={`/mtg/history?${parameters}`}>Open value history</a>

<style>
	.full-history {
		margin-top: 1rem;
	}
</style>
