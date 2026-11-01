<script lang="ts">
	import type {
		InventoryValueHistoryRequest,
		InventoryValueHistory
	} from '@spellbook/contracts/inventory-value.ts';
	let {
		query,
		history,
		onNavigate
	}: {
		query: InventoryValueHistoryRequest;
		history: InventoryValueHistory | null;
		onNavigate: (query: URLSearchParams) => void;
	} = $props();
	const identityKeys = ['printingId', 'finish', 'condition'] as const;
	function params(days: number) {
		const p = new URLSearchParams();
		for (const key of ['printingId', 'finish', 'condition'] as const)
			if (query[key]) p.set(key, query[key]!);
		p.set('days', String(days));
		return p;
	}
</script>

<div class="history-filters">
	<div class="periods" role="group" aria-label="History period">
		{#each [{ days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: 90, label: '90 days' }, { days: 366, label: '1 year' }] as period}<button
				type="button"
				aria-pressed={!query.from && (query.days ?? 30) === period.days}
				onclick={() => onNavigate(params(period.days))}>{period.label}</button
			>{/each}
	</div>
	<form
		onsubmit={(event) => {
			event.preventDefault();
			onNavigate(
				new URLSearchParams(
					[...new FormData(event.currentTarget)].map(([key, value]) => [key, String(value)])
				)
			);
		}}
	>
		{#each identityKeys as key}{#if query[key]}<input
					type="hidden"
					name={key}
					value={query[key]}
				/>{/if}{/each}
		<label
			>From <input
				type="date"
				name="from"
				required
				value={query.from ?? history?.window.from}
			/></label
		><label
			>To <input type="date" name="to" required value={query.to ?? history?.window.to} /></label
		><button class="btn btn-secondary" type="submit">Apply dates</button>
	</form>
</div>

<style>
	.history-filters {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	.periods {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.periods button {
		padding: 0.5rem 0.75rem;
		min-height: 40px;
		display: grid;
		place-items: center;
		border-radius: 0.5rem;
		color: var(--color-text-secondary);
		font-size: 0.75rem;
	}
	.periods button[aria-pressed='true'] {
		background: var(--color-muted);
		color: var(--color-text-primary);
	}
	form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: end;
	}
	label {
		display: grid;
		gap: 0.5rem;
		flex: 1 1 9rem;
		min-width: 0;
		font-size: 0.6875rem;
		color: var(--color-text-secondary);
	}
	input {
		width: 100%;
		min-width: 0;
		min-height: 44px;
		padding: 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-card);
		color: var(--color-text-primary);
	}
</style>
