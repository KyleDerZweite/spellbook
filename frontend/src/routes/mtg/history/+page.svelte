<script lang="ts">
	import Select from '#lib/components/ui/select/Select.svelte';
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
	$effect(() => {
		data;
		untrack(() => {
			history = data.history;
			historyError = data.historyError;
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
						`/api/mobile/v1/mtg/inventory/value-history${search}`,
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
	<header class="flex flex-wrap items-center justify-between gap-3">
		<h1>Inventory history</h1>
		<a class="underline" href="/mtg/dashboard">Dashboard</a>
	</header>
	<SavedStateStatus resource={subscription} />
	{#if data.query.printingId}<p class="text-sm text-text-muted">
			{data.printingName} · {data.query.finish ?? 'all finishes'} · {data.query.condition ??
				'all conditions'}.
			<a href="/mtg/history" class="underline">Full Inventory</a>
		</p>{/if}
	<form method="GET" class="flex flex-wrap items-end gap-3">
		{#each ['printingId', 'finish', 'condition'] as key}{#if data.query[key as keyof typeof data.query]}<input
					type="hidden"
					name={key}
					value={data.query[key as keyof typeof data.query]}
				/>{/if}{/each}
		<label class="flex flex-col gap-1 text-sm"
			>Window <Select
				native
				name="days"
				label="History window"
				value={String(data.query.days ?? 30)}
				options={[
					{ value: '30', label: '30 days' },
					{ value: '90', label: '90 days' },
					{ value: '366', label: '366 days' }
				]}
			/></label
		>
		<button class="btn btn-secondary" type="submit">Show history</button>
	</form>
	<details>
		<summary class="cursor-pointer text-sm">Choose calendar dates</summary>
		<form method="GET" class="mt-3 flex flex-wrap items-end gap-3">
			{#each ['printingId', 'finish', 'condition'] as key}{#if data.query[key as keyof typeof data.query]}<input
						type="hidden"
						name={key}
						value={data.query[key as keyof typeof data.query]}
					/>{/if}{/each}
			<label class="flex flex-col gap-1 text-sm"
				>From <input
					type="date"
					name="from"
					required
					value={data.query.from ?? history?.window.from}
					class="rounded border border-border bg-stone p-2"
				/></label
			>
			<label class="flex flex-col gap-1 text-sm"
				>To <input
					type="date"
					name="to"
					required
					value={data.query.to ?? history?.window.to}
					class="rounded border border-border bg-stone p-2"
				/></label
			>
			<button class="btn btn-secondary" type="submit">Show dates</button>
			<p class="text-xs text-text-muted">Up to 366 closed reporting dates.</p>
		</form>
	</details>
	<InventoryValueHistoryView
		{history}
		error={historyError}
		onRetry={() => subscription?.invalidate()}
	/>
</div>
