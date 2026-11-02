<script lang="ts">
	import { cardTypeSymbol } from '#lib/mtg/type-symbol.ts';
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import ProportionChart from '#lib/components/charts/ProportionChart.svelte';
	import DashboardDecks from './DashboardDecks.svelte';
	import DashboardQuickActions from './DashboardQuickActions.svelte';

	let { dashboard }: { dashboard: DashboardSummary } = $props();
	const typeColors: Record<string, string> = {
		Creature: '#35c897',
		Instant: '#5b9ff5',
		Sorcery: '#a77af4',
		Enchantment: '#f4865f',
		Artifact: '#ead88c',
		Land: '#929bad',
		Planeswalker: '#deb34b',
		Battle: '#d66d81',
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
	const typeOrder = [
		'Creature',
		'Instant',
		'Sorcery',
		'Enchantment',
		'Artifact',
		'Land',
		'Planeswalker',
		'Battle',
		'Other',
		'Unknown'
	];
	const visibleTypes = $derived(
		types
			.filter((item) => item.value > 0)
			.sort((a, b) => typeOrder.indexOf(a.label) - typeOrder.indexOf(b.label))
	);
	const visibleColors = $derived(
		colors.filter((item) => item.label !== 'Unknown' || item.quantity > 0)
	);
	let failedIcons = $state<string[]>([]);
	let colorRoot: HTMLDivElement | undefined = $state();
	let pinned = $state(false);
	function clearInspection() {
		inspected = null;
		pinned = false;
	}
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
		if (event.key === 'Escape') clearInspection();
	}}
	onpointerdown={(event) => {
		if (event.target instanceof Node && colorRoot && !colorRoot.contains(event.target))
			clearInspection();
	}}
/>

{#snippet heading(title: string)}<h2>{title}</h2>{/snippet}

<div class="insights">
	<section class="panel dashboard-surface">
		<header>{@render heading('Card Types')}</header>
		{#if !dashboard.catalogBreakdown}<p>Catalog breakdown unavailable.</p>{:else}
			<div class="type-layout">
				<div class="donut">
					<ProportionChart
						label="Physical copies by exclusive primary card type"
						kind="ring"
						items={[...visibleTypes, ...types.filter((item) => item.value === 0)]}
					>
						{#snippet center()}<strong class="total">{typeTotal.toLocaleString()}</strong><span
								class="center-label">copies</span
							>{/snippet}
					</ProportionChart>
				</div>
				<dl class="legend">
					{#each visibleTypes as item}
						{@const symbol = cardTypeSymbol(item.label)}
						<div title={`${item.label}: ${item.value} copies`}>
							<dt>
								{#if symbol}<i class={`ms ms-${symbol}`} style:color={item.color} aria-hidden="true"
									></i>{:else}<i
										class="type-swatch"
										style:background={item.color}
										aria-hidden="true"
									></i>{/if}{item.label}
							</dt>
							<dd>
								<span class="sr-only">{item.value} copies, </span>{percent(item.value, typeTotal)}
							</dd>
						</div>{/each}
				</dl>
			</div>
			{#if !typeTotal}<p>No owned cards yet.</p>{/if}
		{/if}
	</section>
	<section class="panel dashboard-surface">
		<header>{@render heading('Mana Color Identity')}</header>
		{#if !dashboard.catalogBreakdown}<p>Catalog breakdown unavailable.</p>{:else}
			<div
				bind:this={colorRoot}
				class="color-chart"
				onfocusout={(event) => {
					if (
						!pinned &&
						!(event.relatedTarget instanceof Node && colorRoot?.contains(event.relatedTarget))
					)
						clearInspection();
				}}
				onpointerleave={() => {
					if (!pinned && !colorRoot?.contains(document.activeElement)) inspected = null;
				}}
				role="group"
				aria-label="Physical copies by color identity"
			>
				<div class="columns">
					{#each visibleColors as item}<button
							type="button"
							aria-label={`${item.label}: ${item.quantity} copies, ${percent(item.quantity, dashboard.totals.total)}`}
							aria-pressed={pinned && inspected === item.label}
							title={`${item.label}: ${item.quantity} copies`}
							onpointerenter={() => {
								if (!pinned) inspected = item.label;
							}}
							onfocus={() => {
								inspected = item.label;
								pinned = false;
							}}
							onclick={() => {
								if (pinned && inspected === item.label) clearInspection();
								else {
									inspected = item.label;
									pinned = true;
								}
							}}
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
						)}{:else}<span class="sr-only">Select a color to inspect</span>{/if}
				</p>
			</div>
		{/if}
	</section>
	<section class="panel dashboard-surface sets">
		<header>
			{@render heading('Collection by Set')}<a class="view-all" href="/mtg/inventory"
				>View all <span aria-hidden="true">→</span></a
			>
		</header>
		<div class="set-list">
			{#each sets.slice(0, 5) as item}
				<div class="set-row">
					<span class="set-symbol" aria-hidden="true"
						>{#if /^[a-z0-9]{2,8}$/i.test(item.label) && !failedIcons.includes(item.label)}<img
								src={`https://svgs.scryfall.io/sets/${encodeURIComponent(item.label.toLowerCase())}.svg`}
								alt=""
								width="32"
								height="32"
								loading="lazy"
								onerror={() => (failedIcons = [...failedIcons, item.label])}
							/>{:else}<span>{item.label.toUpperCase()}</span>{/if}</span
					>
					<span class="set-name">{setName(item.label)}</span>
					<div
						class="track"
						role="img"
						aria-label={`${setName(item.label)}: ${item.quantity} copies`}
					>
						<i style:width={`${(item.quantity / setMaximum) * 100}%`}></i>
					</div>
					<strong>{item.quantity.toLocaleString()}</strong>
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
		</footer>
	</section>
	<DashboardQuickActions />
	<div class="dashboard-secondary">
		<DashboardDecks {dashboard} />
		<section class="panel dashboard-surface recent">
			<header>
				{@render heading('Recent activity')}<a class="view-all" href="/mtg/inventory"
					>View all <span aria-hidden="true">→</span></a
				>
			</header>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (Native scrolling region needs keyboard access.) -->
			<div class="entries" role="region" aria-label="Recent inventory updates" tabindex="0">
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
							<span class="entry-title">{entry.name}</span><span class="entry-context"
								>{`Inventory updated · ${entry.setCode.toUpperCase()} · ${entry.quantity.toLocaleString()} ${entry.quantity === 1 ? 'copy' : 'copies'}`}</span
							><time
								class="entry-time"
								datetime={entry.updatedAt}
								title={timestamp(entry.updatedAt)}>{timestamp(entry.updatedAt)}</time
							>
						</div>
						<span class="chevron" aria-hidden="true">›</span></a
					>{:else}<p>No recent inventory updates.</p>{/each}
			</div>
		</section>
	</div>
</div>

<style>
	.insights {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 16px;
	}
	.dashboard-secondary {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
		gap: 16px;
		min-width: 0;
	}
	.recent {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.recent header {
		flex-wrap: wrap;
	}
	.panel {
		min-width: 0;
		min-height: 414px;
		padding: 24px 18px;
		border-radius: 10px;
		color: var(--color-text-primary);
		font: 400 13px/1.4 var(--font-interface);
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		margin-bottom: 24px;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0;
		font: 400 20px/1.3 var(--font-display);
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
		gap: 24px;
		margin-top: 32px;
	}
	.set-row {
		display: grid;
		grid-template-columns: 28px minmax(0, 1.15fr) minmax(48px, 1fr) 24px;
		gap: 12px;
		align-items: center;
		min-height: 32px;
	}
	.set-row span {
		overflow-wrap: anywhere;
	}
	.set-row strong {
		font-weight: 500;
	}
	.track {
		height: 22px;
		background: var(--color-chart-track);
		border-radius: 3px;
		overflow: hidden;
	}
	.track i {
		display: block;
		height: 100%;
		background: var(--color-chart-dashboard-accent);
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
		flex: 1.45;
		min-width: 0;
	}
	.donut :global(.proportion-ring) {
		width: 100%;
		height: auto;
		aspect-ratio: 1;
	}
	.total {
		font-size: 32px;
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
	.legend .type-swatch {
		width: 9px;
		height: 9px;
		border-radius: 3px;
		flex: none;
	}
	.legend .ms {
		width: 16px;
		font-size: 14px;
		text-align: center;
		flex: none;
	}
	.color-chart {
		padding-top: 16px;
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
		background: transparent;
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
		min-height: 16px;
		margin: 8px 0 0;
		font-size: 11px;
		text-align: center;
	}
	.entries {
		display: grid;
		align-content: start;
		min-height: 0;
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
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 4px;
	}
	.entry-title {
		grid-column: 1;
		grid-row: 1;
	}
	.entry-context {
		grid-column: 1;
		grid-row: 2;
		color: var(--color-text-secondary);
		font-size: 11px;
	}
	.entry-text > span {
		display: block;
		overflow-wrap: anywhere;
	}
	.entry-time {
		grid-column: 1;
		grid-row: 3;
		align-self: center;
		color: var(--color-text-muted);
		font-size: 11px;
		overflow-wrap: anywhere;
	}
	.chevron {
		color: var(--color-text-muted);
		font-size: 22px;
	}
	.entries:focus-visible,
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
			font-size: 11px;
		}
		.legend div {
			padding: 3px 0;
		}
	}
	@media (min-width: 1150px) {
		.recent {
			box-sizing: border-box;
			height: 480px;
		}
		.entries {
			overflow-y: auto;
			scrollbar-gutter: stable;
			padding: 4px;
		}
	}
	@media (max-width: 1149px) {
		.insights {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.dashboard-secondary {
			grid-template-columns: minmax(0, 1fr);
		}
		.recent {
			min-height: 0;
		}
	}
	@media (max-width: 620px) {
		.entry-text {
			grid-template-columns: minmax(0, 1fr);
		}
		.entry-time {
			grid-column: 1;
			grid-row: 3;
		}
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

	.view-all {
		display: inline-flex;
		gap: 8px;
		align-items: center;
		flex-shrink: 0;
		font-size: 11px;
	}
	.set-symbol {
		width: 28px;
		display: grid;
		place-items: center;
		font-size: 9px;
		color: var(--color-text-secondary);
	}
	.set-symbol img {
		width: 28px;
		height: 28px;
		object-fit: contain;
		filter: brightness(0) invert(0.85);
	}
	:global(html:not(.dark)) .set-symbol img {
		filter: brightness(0);
		opacity: 0.75;
	}
	@media (min-width: 1150px) and (max-width: 1450px) {
		h2 {
			font-size: 17px;
			gap: 8px;
		}
		.set-row {
			gap: 8px;
			grid-template-columns: 24px minmax(0, 1fr) minmax(40px, 0.8fr) 22px;
		}
		.set-symbol,
		.set-symbol img {
			width: 24px;
			height: 24px;
		}
	}
</style>
