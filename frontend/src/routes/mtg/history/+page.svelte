<script lang="ts">
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
	function periodURL(days: number) {
		const query = new URLSearchParams();
		for (const key of ['printingId', 'finish', 'condition'] as const) {
			const value = data.query[key];
			if (value) query.set(key, value);
		}
		query.set('days', String(days));
		return `/mtg/history?${query}`;
	}
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
	<div class="history-toolbar">
		<nav class="period-switch" aria-label="History period">
			{#each [{ days: 30, label: '30 days' }, { days: 90, label: '90 days' }, { days: 366, label: '1 year' }] as period}
				<a
					href={periodURL(period.days)}
					aria-current={!data.query.from && (data.query.days ?? 30) === period.days
						? 'page'
						: undefined}>{period.label}</a
				>
			{/each}
		</nav>
		<details class="custom-period" open={!!data.query.from}>
			<summary>Custom dates</summary>
			<form method="GET" class="date-fields">
				{#each ['printingId', 'finish', 'condition'] as key}
					{#if data.query[key as keyof typeof data.query]}<input
							type="hidden"
							name={key}
							value={data.query[key as keyof typeof data.query]}
						/>{/if}
				{/each}
				<label
					>From <input
						type="date"
						name="from"
						required
						value={data.query.from ?? history?.window.from}
					/></label
				>
				<label
					>To <input
						type="date"
						name="to"
						required
						value={data.query.to ?? history?.window.to}
					/></label
				>
				<button class="btn btn-secondary" type="submit">Apply dates</button>
			</form>
		</details>
	</div>
	<InventoryValueHistoryView
		{history}
		error={historyError}
		onRetry={() => subscription?.invalidate()}
		demo={data.demoMode}
	/>
</div>

<style>
	.history-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: start;
		justify-content: space-between;
		gap: 1rem;
	}
	.period-switch {
		display: flex;
		gap: 0.25rem;
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		padding: 0.25rem;
		background: var(--color-card);
	}
	.period-switch a {
		display: grid;
		place-items: center;
		min-height: 40px;
		padding: 0 1rem;
		border-radius: 0.5rem;
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}
	.period-switch a[aria-current='page'] {
		color: var(--color-text-primary);
		background: var(--color-stone);
		box-shadow: inset 0 0 0 1px var(--color-border);
	}
	.period-switch a:hover {
		color: var(--color-text-primary);
	}
	.custom-period {
		margin-left: auto;
	}
	.custom-period summary {
		cursor: pointer;
		min-height: 48px;
		align-content: center;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		text-align: right;
	}
	.date-fields {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: end;
		padding: 0.75rem 0;
	}
	.date-fields label {
		display: grid;
		gap: 0.4rem;
		font-size: 0.6875rem;
	}
	.date-fields input {
		min-height: 44px;
		padding: 0.5rem;
		border-radius: 0.5rem;
		border: 1px solid var(--color-border);
		background: var(--color-card);
		color: var(--color-text-primary);
	}
	@media (max-width: 540px) {
		.history-toolbar {
			gap: 0.5rem;
		}
		.period-switch {
			flex: 1;
		}
		.period-switch a {
			flex: 1;
			padding-inline: 0.65rem;
		}
		.custom-period {
			width: 100%;
		}
		.custom-period summary {
			min-height: 40px;
			text-align: left;
		}
		.date-fields label {
			flex: 1;
			min-width: 0;
		}
		.date-fields input {
			width: 100%;
			min-width: 0;
		}
	}
</style>
