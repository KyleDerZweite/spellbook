<script lang="ts">
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import ProportionChart from '#lib/components/charts/ProportionChart.svelte';

	let { dashboard }: { dashboard: DashboardSummary } = $props();
	const typeColors: Record<string, string> = {
		Creature: '#48bf91',
		Instant: '#62a5ed',
		Sorcery: '#ab86e8',
		Enchantment: '#ee956d',
		Artifact: '#e4d68f',
		Land: '#929bad',
		Planeswalker: '#d3af59',
		Battle: '#cb7683',
		Other: '#727b8b',
		Unknown: '#999999'
	};
	const symbols: Record<string, string> = {
		White: 'w',
		Blue: 'u',
		Black: 'b',
		Red: 'r',
		Green: 'g',
		Multicolor: 'multicolor',
		Colorless: 'c'
	};
	const manaColors: Record<string, string> = {
		White: 'var(--color-chart-mana-white)',
		Blue: 'var(--color-chart-mana-blue)',
		Black: 'var(--color-chart-mana-black)',
		Red: 'var(--color-chart-mana-red)',
		Green: 'var(--color-chart-mana-green)',
		Multicolor: 'var(--color-chart-mana-gold)',
		Colorless: 'var(--color-chart-mana-colorless)'
	};
	const sets = $derived(dashboard.sets);
	const setMaximum = $derived(Math.max(1, ...sets.map((item) => item.quantity)));
	const types = $derived(
		(dashboard.catalogBreakdown?.primaryTypes ?? []).map((item) => ({
			label: item.label,
			value: item.quantity,
			color: typeColors[item.label] ?? '#727b8b'
		}))
	);
	const typeTotal = $derived(types.reduce((sum, item) => sum + item.value, 0));
	const colors = $derived(dashboard.catalogBreakdown?.colorIdentity ?? []);
	const colorMaximum = $derived(Math.max(1, ...colors.map((item) => item.quantity)));
	let inspected = $state<string | null>(null);
	const active = $derived(colors.find((item) => item.label === inspected));
	const percent = (value: number, total: number) =>
		`${(total ? (value / total) * 100 : 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
	const setName = (code: string) =>
		dashboard.catalogBreakdown?.setNames[code] ?? code.toUpperCase();
	function timestamp(value: string) {
		const date = new Date(value);
		return Number.isNaN(date.getTime())
			? value || 'Edit time unavailable'
			: date.toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) +
					' UTC';
	}
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') inspected = null;
	}}
/>

{#snippet heading(kind: string, title: string)}
	<h2>
		<svg
			viewBox="0 0 24 24"
			width="24"
			height="24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.7"
			aria-hidden="true"
		>
			{#if kind === 'sets'}<path d="m3 19 6-11 4 6 3-4 5 9H3Z" /><path d="m8 10 2 3 2-2" />
			{:else if kind === 'types'}<rect x="8" y="3" width="12" height="18" rx="2" /><path
					d="m6 5-3 1 2 15 3-1"
				/>
			{:else if kind === 'mana'}<path d="M12 2S5 11 5 15a7 7 0 0 0 14 0c0-4-7-13-7-13Z" /><path
					d="M9 14c-1 3 1 4 3 4"
				/>
			{:else}<circle cx="12" cy="12" r="9" /><path d="M12 6v6h5" />{/if}
		</svg><span>{title}</span>
	</h2>
{/snippet}

<div class="insights">
	<section class="panel sets">
		<header>{@render heading('sets', 'Collection by Set')}</header>
		<div class="set-list">
			{#each sets.slice(0, 5) as item}
				<div class="set-row">
					<span>{setName(item.label)}</span><strong>{item.quantity.toLocaleString()}</strong>
					<div
						class="track"
						role="img"
						aria-label={`${setName(item.label)}: ${item.quantity} copies`}
					>
						<i style:width={`${(item.quantity / setMaximum) * 100}%`}></i>
					</div>
				</div>
			{:else}<p>No owned cards yet.</p>{/each}
		</div>
		<footer>
			<details>
				<summary>All set quantities</summary>
				<dl>
					{#each sets as item}<div>
							<dt>{setName(item.label)}</dt>
							<dd>{item.quantity.toLocaleString()} copies</dd>
						</div>{:else}<p>No sets yet.</p>{/each}
				</dl>
			</details>
			<a href="/mtg/inventory">View all Inventory →</a>
		</footer>
	</section>
	<section class="panel">
		<header>{@render heading('types', 'Card Types')}</header>
		{#if !dashboard.catalogBreakdown}<p>Catalog breakdown unavailable.</p>{:else}
			<div class="type-layout">
				<div class="donut">
					<ProportionChart
						label="Physical copies by exclusive primary card type"
						kind="ring"
						items={types}
					>
						{#snippet center()}<strong class="total">{typeTotal.toLocaleString()}</strong><span
								class="center-label">copies</span
							>{/snippet}
					</ProportionChart>
				</div>
				<dl class="legend">
					{#each types as item}<div title={`${item.label}: ${item.value} copies`}>
							<dt><i style:background={item.color}></i>{item.label}</dt>
							<dd>
								<span class="sr-only">{item.value} copies, </span>{percent(item.value, typeTotal)}
							</dd>
						</div>{/each}
				</dl>
			</div>
			{#if !typeTotal}<p>No owned cards yet.</p>{/if}
		{/if}
	</section>
	<section class="panel">
		<header>{@render heading('mana', 'Mana Color Identity')}</header>
		{#if !dashboard.catalogBreakdown}<p>Catalog breakdown unavailable.</p>{:else}
			<div class="color-chart" role="group" aria-label="Physical copies by color identity">
				<div class="columns">
					{#each colors as item}<button
							type="button"
							aria-label={`${item.label}: ${item.quantity} copies, ${percent(item.quantity, dashboard.totals.total)}`}
							aria-pressed={inspected === item.label}
							title={`${item.label}: ${item.quantity} copies`}
							onpointerenter={() => (inspected = item.label)}
							onfocus={() => (inspected = item.label)}
							onclick={() => (inspected = inspected === item.label ? null : item.label)}
						>
							<span class="plot"
								><i
									style:height={`${(item.quantity / colorMaximum) * 100}%`}
									style:background={manaColors[item.label] ?? 'var(--color-text-muted)'}
								></i></span
							>
							<span class="mana" aria-hidden="true"
								>{#if symbols[item.label]}<i
										class={`ms ms-${symbols[item.label]}`}
										class:ms-cost={item.label !== 'Multicolor'}
									></i>{:else}?{/if}</span
							><strong>{item.quantity.toLocaleString()}</strong>
						</button>{/each}
				</div>
				<p class="inspection" aria-live="polite">
					{#if active}{active.label} · {active.quantity.toLocaleString()} copies · {percent(
							active.quantity,
							dashboard.totals.total
						)}{:else}Select a color to inspect{/if}
				</p>
			</div>
		{/if}
	</section>
	<section class="panel recent">
		<header>{@render heading('recent', 'Recently edited')}</header>
		<div class="entries">
			{#each dashboard.recentEntries.slice(0, 4) as entry}<a
					class="entry"
					href={`/mtg/inventory/${encodeURIComponent(entry.id)}`}
					><div class="thumbnail">
						{#if entry.imageUri}<img
								src={entry.imageUri}
								alt=""
								width="46"
								height="64"
								loading="lazy"
							/>{:else}<span>{entry.setCode.toUpperCase()}</span>{/if}
					</div>
					<div class="entry-text">
						<span>{entry.name}</span><time datetime={entry.updatedAt}
							>{timestamp(entry.updatedAt)}</time
						>
					</div>
					<span class="chevron" aria-hidden="true">›</span></a
				>{:else}<p>No recently edited cards.</p>{/each}
		</div>
	</section>
</div>

<style>
	.insights {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 16px;
	}
	.panel {
		min-width: 0;
		min-height: 414px;
		padding: 20px 18px;
		border: 1px solid var(--color-border);
		border-radius: 10px;
		background: var(--color-card);
		color: var(--color-text-primary);
		font: 400 13px/1.4 var(--font-interface);
	}
	header {
		margin-bottom: 24px;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0;
		font: 500 18px/1.3 var(--font-display);
	}
	h2 svg {
		flex: none;
		color: var(--color-chart-primary);
	}
	p {
		color: var(--color-text-muted);
	}
	strong,
	dd {
		font-variant-numeric: tabular-nums;
	}
	.set-list {
		display: grid;
		gap: 19px;
	}
	.set-row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 6px 12px;
	}
	.set-row span {
		overflow-wrap: anywhere;
	}
	.set-row strong {
		font-weight: 500;
	}
	.track {
		grid-column: 1/-1;
		height: 14px;
		background: var(--color-chart-track);
		border-radius: 3px;
		overflow: hidden;
	}
	.track i {
		display: block;
		height: 100%;
		background: var(--color-chart-primary);
		border-radius: 3px;
	}
	footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		margin-top: 20px;
		font-size: 11px;
	}
	a {
		color: var(--color-text-secondary);
		text-decoration: none;
	}
	a:hover {
		text-decoration: underline;
	}
	details {
		position: relative;
	}
	summary {
		cursor: pointer;
		color: var(--color-text-secondary);
	}
	details dl {
		position: absolute;
		left: 0;
		bottom: 100%;
		width: 260px;
		max-width: 75vw;
		max-height: 280px;
		overflow: auto;
		z-index: 30;
		padding: 14px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 6px;
	}
	details dl div {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		padding: 5px 0;
	}
	dd {
		margin: 0;
		white-space: nowrap;
	}
	.type-layout {
		display: flex;
		align-items: center;
		gap: 14px;
		height: 300px;
	}
	.donut {
		flex: 1;
		min-width: 0;
	}
	.donut :global(.proportion-ring) {
		width: 100%;
		height: auto;
		aspect-ratio: 1;
	}
	.total {
		font-size: 25px;
		font-weight: 500;
	}
	.center-label {
		font-size: 11px;
		color: var(--color-text-secondary);
	}
	.legend {
		flex: 1;
		margin: 0;
		font-size: 11px;
	}
	.legend div {
		display: flex;
		justify-content: space-between;
		gap: 6px;
		padding: 5px 0;
	}
	.legend dt {
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.legend i {
		width: 9px;
		height: 9px;
		border-radius: 3px;
		flex: none;
	}
	.color-chart {
		padding-top: 24px;
	}
	.columns {
		display: flex;
		gap: 7px;
		background: repeating-linear-gradient(
			to top,
			transparent 0,
			transparent 49px,
			var(--color-border) 50px
		);
	}
	.columns button {
		display: grid;
		grid-template-rows: 190px 28px 22px;
		justify-items: center;
		gap: 10px;
		min-width: 0;
		flex: 1;
		border: 0;
		padding: 0;
		background: var(--color-card);
		color: var(--color-text-primary);
		cursor: pointer;
		font: 400 11px var(--font-interface);
	}
	.plot {
		display: flex;
		align-items: end;
		justify-content: center;
		width: 100%;
		background: repeating-linear-gradient(
			to top,
			transparent 0,
			transparent 49px,
			var(--color-border) 50px
		);
		border-bottom: 1px solid var(--color-border);
	}
	.plot i {
		display: block;
		width: 86%;
		border-radius: 3px 3px 0 0;
	}
	.mana {
		display: grid;
		place-items: center;
		font-size: 21px;
	}
	.columns strong {
		font-size: 11px;
		font-weight: 400;
	}
	.inspection {
		min-height: 32px;
		margin: 15px 0 0;
		font-size: 11px;
		text-align: center;
	}
	.entries {
		display: grid;
	}
	.entry {
		display: flex;
		gap: 12px;
		align-items: center;
		min-height: 78px;
		padding: 7px 0;
		border-bottom: 1px solid var(--color-border);
	}
	.entry:last-child {
		border: 0;
	}
	.thumbnail {
		flex: none;
		width: 46px;
		height: 64px;
		border-radius: 4px;
		overflow: hidden;
		background: var(--color-surface);
		display: grid;
		place-items: center;
		font-size: 10px;
	}
	.thumbnail img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.entry-text {
		min-width: 0;
		flex: 1;
	}
	.entry-text > span {
		display: block;
		overflow-wrap: anywhere;
	}
	time {
		display: block;
		color: var(--color-text-muted);
		font-size: 11px;
		margin-top: 6px;
	}
	.chevron {
		color: var(--color-text-muted);
		font-size: 22px;
	}
	button:focus-visible,
	a:focus-visible,
	summary:focus-visible {
		outline: 2px solid var(--color-chart-primary);
		outline-offset: 4px;
	}
	@media (min-width: 1150px) and (max-width: 1450px) {
		.type-layout {
			flex-direction: column;
			gap: 8px;
			height: auto;
		}
		.donut {
			width: 150px;
			flex: none;
		}
		.legend {
			width: 100%;
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 0 10px;
			font-size: 10px;
		}
		.legend div {
			padding: 3px 0;
		}
	}
	@media (max-width: 1149px) {
		.insights {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 620px) {
		.insights {
			grid-template-columns: minmax(0, 1fr);
		}
		.panel {
			min-height: 0;
		}
		.type-layout {
			height: auto;
			min-height: 260px;
		}
	}
</style>
