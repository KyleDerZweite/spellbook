<script lang="ts">
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import ProportionChart from '#lib/components/charts/ProportionChart.svelte';
	let {
		dashboard,
		presentation = 'pie'
	}: { dashboard: DashboardSummary; presentation?: 'pie' | 'bars' } = $props();
	const colors = [
		'var(--color-chart-primary)',
		'var(--color-violet)',
		'var(--color-success)',
		'var(--color-warning)',
		'var(--color-chart-rose)'
	];
	const items = $derived([
		...dashboard.sets
			.slice(0, 5)
			.map((s, i) => ({ label: s.label.toUpperCase(), value: s.quantity, color: colors[i] })),
		...(dashboard.sets.length > 5
			? [
					{
						label: `Other · ${dashboard.sets.length - 5} sets`,
						value: dashboard.sets.slice(5).reduce((n, s) => n + s.quantity, 0),
						color: 'var(--color-text-muted)'
					}
				]
			: [])
	]);
</script>

<section class="prototype-sets">
	<header>
		<h2>Sets</h2>
		<details>
			<summary aria-label="All sets">•••</summary>
			<dl>
				{#each dashboard.sets as set}<div>
						<dt>{set.label.toUpperCase()}</dt>
						<dd>{set.quantity.toLocaleString()}</dd>
					</div>{/each}
			</dl>
		</details>
	</header>
	{#if dashboard.totals.total === 0}<p class="empty">
			No cards yet
		</p>{:else if presentation === 'pie'}<div class="pie-wrap">
			<ProportionChart label="Owned copies by set" {items} />
		</div>{:else}<div class="set-bars">
			{#each items as item}<div>
					<span>{item.label}</span><strong>{item.value.toLocaleString()}</strong><i
						style:width={`${(item.value / dashboard.totals.total) * 100}%`}
						style:background={item.color}
					></i>
				</div>{/each}
		</div>{/if}
</section>

<style>
	.prototype-sets {
		padding: 1.25rem;
		background: var(--color-card);
		border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
		border-radius: 0.85rem;
		min-width: 0;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	h2 {
		font: 500 1rem var(--font-interface);
		color: var(--color-text-primary);
	}
	details {
		position: relative;
		font: 0.75rem var(--font-interface);
	}
	summary {
		cursor: pointer;
		list-style: none;
		color: var(--color-text-muted);
		padding: 0.2rem 0.4rem;
		min-width: 28px;
		text-align: center;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	dl {
		position: absolute;
		right: 0;
		top: 100%;
		z-index: 40;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 0.6rem;
		padding: 0.8rem;
		width: 200px;
		max-height: 260px;
		overflow: auto;
		box-shadow: 0 4px 16px #0002;
	}
	dl div {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.3rem 0;
	}
	.pie-wrap {
		display: flex;
		justify-content: center;
		padding: 0.5rem 0;
	}
	.empty {
		font: 0.8125rem var(--font-interface);
		color: var(--color-text-muted);
		padding: 2rem 0;
	}
	.set-bars {
		display: grid;
		gap: 1rem;
	}
	.set-bars div {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.35rem;
		font: 0.6875rem var(--font-interface);
		color: var(--color-text-secondary);
	}
	.set-bars strong {
		font-weight: 500;
		color: var(--color-text-primary);
	}
	.set-bars i {
		display: block;
		grid-column: 1/-1;
		height: 7px;
		border-radius: 2px;
		max-width: 100%;
	}
</style>
