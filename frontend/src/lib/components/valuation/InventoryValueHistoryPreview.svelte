<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
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
		initialQuery = { days: 30 },
		demo = false
	}: {
		initialHistory: InventoryValueHistory | null;
		initialQuery?: InventoryValueHistoryRequest;
		demo?: boolean;
	} = $props();
	let history = $state(untrack(() => initialHistory));
	let query = $state<InventoryValueHistoryRequest>(untrack(() => ({ days: 30, ...initialQuery })));
	let error = $state('');
	let loading = $state(false);
	let subscription: ResourceSubscription | undefined;
	let parameters = $state(
		untrack(
			() => new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)]))
		)
	);
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
						error = language.t(
							'ui.History.could.not.be.loaded.Choose.a.valid.period.and.try.again'
						);
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
	embedded
	onRetry={() => subscription?.invalidate()}
/>
