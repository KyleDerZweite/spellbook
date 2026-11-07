<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { translate, type MessageKey } from '#lib/i18n/messages.ts';
	const colorLabel = (id: string) => translate(language.locale, `color.${id}` as MessageKey);
	import { scaleLinear } from 'd3-scale';
	import { onMount } from 'svelte';
	import type { DeckCard } from '@spellbook/contracts/decks.ts';
	import type { CardDocument } from '#lib/search/types.ts';
	import { deckStatistics, type DeckStatisticsScope } from '#lib/decks/statistics.ts';
	import ProportionChart from '#lib/components/charts/ProportionChart.svelte';
	let { cards, documents }: { cards: DeckCard[]; documents: Record<string, CardDocument> } =
		$props();
	let enhanced = $state(false);
	onMount(() => {
		enhanced = true;
	});
	let scope = $state<DeckStatisticsScope>('deck');
	let colorMeasure = $state<'colors' | 'colorIdentity'>('colorIdentity');
	const statistics = $derived(deckStatistics(cards, documents, scope));
	const palette: Record<string, string> = {
		White: 'var(--color-chart-mana-white)',
		Blue: 'var(--color-chart-mana-blue)',
		Black: 'var(--color-chart-mana-black)',
		Red: 'var(--color-chart-mana-red)',
		Green: 'var(--color-chart-mana-green)',
		Multicolor: 'var(--color-chart-mana-gold)',
		Colorless: 'var(--color-chart-mana-colorless)',
		Unknown: 'var(--color-text-muted)'
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
	const colors = $derived(statistics[colorMeasure].filter((item) => item.quantity > 0));
	let inspectedMana = $state<string | null>(null);
	const colorUnknown = $derived(
		statistics[colorMeasure].find((item) => item.label === 'Unknown')?.quantity ?? 0
	);
	const maximum = $derived(Math.max(1, ...statistics.curve.map((item) => item.quantity)));
	const curveScale = $derived(scaleLinear().domain([0, maximum]).range([0, 100]));
	const inspectedBucket = $derived(statistics.curve.find((item) => item.label === inspectedMana));
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') inspectedMana = null;
	}}
/>

<section class="deck-statistics" aria-label={language.t('ui.Deck.statistics')}>
	<div class="statistics-heading">
		<h2>{language.t('ui.Deck.analysis')}</h2>
		<select
			class="input"
			aria-label={language.t('ui.Analysis.sections')}
			bind:value={scope}
			disabled={!enhanced}
		>
			<option value="deck">{language.t('ui.Main.commander')}</option><option value="main"
				>{language.t('ui.Main.deck')}</option
			><option value="sideboard">{language.t('ui.Sideboard')}</option><option value="companion"
				>{language.t('ui.Companion')}</option
			><option value="all">{language.t('ui.All.sections')}</option>
		</select>
	</div>
	<div class="analysis-grid">
		<section class="analysis-panel" aria-label={language.t('ui.Mana.curve')}>
			<div class="chart-heading">
				<h3>{language.t('ui.Mana.curve')}</h3>
				<span
					>{language.t('sentence.p0.nonland.copies', {
						p0: String(statistics.curveQuantity.toLocaleString(language.locale))
					})}</span
				>
			</div>
			{#if statistics.curveQuantity}<div
					class="curve"
					role="group"
					aria-label={language.t('ui.Copies.by.mana.value')}
				>
					{#each statistics.curve as item}<button
							type="button"
							class="curve-column"
							onfocus={() => (inspectedMana = item.label)}
							onpointerenter={() => (inspectedMana = item.label)}
							onclick={() => (inspectedMana = item.label)}
							aria-label={language.t('message.Mana.value.p0.p1.copies', {
								p0: String(item.label),
								p1: String(item.quantity.toLocaleString(language.locale))
							})}
							title={language.t('message.Mana.value.p0.p1.copies', {
								p0: String(item.label),
								p1: String(item.quantity.toLocaleString(language.locale))
							})}
						>
							<span class="curve-count">{item.quantity || ''}</span>
							<div class="bar-space">
								<span class="curve-bar" style:height={`${curveScale(item.quantity)}%`}></span>
							</div>
							<span class="mana-value">{item.label}</span>
						</button>{/each}
				</div>
				<p class="curve-readout" aria-live="polite">
					{#if inspectedBucket}{language.t('ui.Mana.value')}
						{inspectedBucket.label} · {inspectedBucket.quantity.toLocaleString(language.locale)}
						{language.t('ui.copies')}{/if}
				</p>{:else}<p class="empty-chart">
					{statistics.quantity
						? language.t('ui.No.resolved.nonland.mana.values')
						: language.t('ui.No.cards.in.this.section')}
				</p>{/if}
			<div class="chart-meta">
				<span
					>{language.t('ui.Average')}
					<strong
						>{statistics.averageManaValue === null
							? language.t('ui.Unavailable')
							: statistics.averageManaValue.toLocaleString(language.locale, {
									maximumFractionDigits: 2
								})}</strong
					></span
				><span
					>{statistics.lands.toLocaleString(language.locale)}
					{language.t('ui.lands.excluded')}{#if statistics.curveUnknown}
						· {statistics.curveUnknown.toLocaleString(language.locale)}
						{language.t('ui.unknown')}{/if}</span
				>
			</div>
		</section>
		<section class="analysis-panel" aria-label={language.t('ui.Color.distribution')}>
			<div class="chart-heading">
				<h3>{language.t('ui.Color.distribution')}</h3>
				<select
					class="input measure"
					aria-label={language.t('ui.Deck.color.measure')}
					bind:value={colorMeasure}
					disabled={!enhanced}
					><option value="colors">{language.t('ui.Colors')}</option><option value="colorIdentity"
						>{language.t('ui.Color.identity')}</option
					></select
				>
			</div>
			{#if statistics.quantity}<div class="color-distribution">
					<ProportionChart
						label={language.t('ui.Deck.color.distribution')}
						kind="ring"
						items={colors.map((item) => ({
							label: colorLabel(item.label),
							value: item.quantity,
							color: palette[item.label]
						}))}
					>
						{#snippet center()}<strong class="color-total"
								>{statistics.quantity.toLocaleString(language.locale)}</strong
							><span class="color-caption">{language.t('ui.copies')}</span>{/snippet}
					</ProportionChart>
					<dl class="color-key">
						{#each colors as item}<div>
								<dt>
									<i
										class={`ms ms-${symbols[item.label] ?? 'card'}`}
										aria-hidden="true"
										style:color={palette[item.label]}
									></i>{colorLabel(item.label)}
								</dt>
								<dd>{item.quantity.toLocaleString(language.locale)}</dd>
							</div>{/each}
					</dl>
				</div>
			{:else}<p class="empty-chart">{language.t('ui.No.cards.in.this.section')}</p>{/if}
			<p class="chart-meta">
				{statistics.quantity.toLocaleString(language.locale)}
				{language.t('ui.copies')}{#if colorUnknown}
					· {colorUnknown.toLocaleString(language.locale)}
					{language.t('ui.color.values.unknown')}{/if}
			</p>
		</section>
	</div>
</section>

<style>
	.deck-statistics {
		container-type: inline-size;
		min-width: 0;
		margin: 0 0 1.5rem;
	}
	.statistics-heading,
	.chart-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.statistics-heading {
		margin-bottom: 1rem;
	}
	h2 {
		font: 400 1.25rem var(--font-display);
	}
	h3 {
		font: 400 1rem var(--font-display);
	}
	.statistics-heading select {
		width: auto;
		max-width: 100%;
		font-size: 0.6875rem;
	}
	.analysis-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
		gap: 1rem;
	}
	.analysis-panel {
		min-width: 0;
		background: var(--color-surface);
		padding: 1rem;
		border-radius: 0.75rem;
	}
	.chart-heading {
		margin-bottom: 1rem;
	}
	.chart-heading > span {
		color: var(--color-text-secondary);
		font-size: 0.6875rem;
	}
	.curve {
		display: flex;
		align-items: end;
		gap: 0.5rem;
	}
	.curve-column {
		display: grid;
		grid-template-rows: 1rem 7rem 1.25rem;
		align-items: end;
		gap: 0.5rem;
		flex: 1;
		min-width: 0;
		text-align: center;
		font-size: 0.6875rem;
		border-radius: 0.25rem;
		font-variant-numeric: tabular-nums;
	}
	.curve-readout {
		min-height: 1rem;
		margin-top: 0.5rem;
		color: var(--color-text-secondary);
		font-size: 0.6875rem;
	}
	.curve-column:hover,
	.curve-column:focus-visible {
		background: var(--color-muted);
	}
	.curve-count {
		color: var(--color-text-secondary);
	}
	.bar-space {
		height: 100%;
		display: flex;
		align-items: end;
		border-bottom: 1px solid var(--color-border);
	}
	.curve-bar {
		display: block;
		width: 100%;
		border-radius: 0.25rem 0.25rem 0 0;
		background: var(--color-chart-primary);
	}
	.mana-value {
		color: var(--color-text-secondary);
	}
	.chart-meta {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 1rem;
		font-size: 0.6875rem;
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}
	.chart-meta strong {
		color: var(--color-text-primary);
		font-weight: 500;
	}
	.color-distribution {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: 1.5rem;
		min-height: 10.75rem;
	}
	.color-total {
		font: 400 1.75rem var(--font-display);
		font-variant-numeric: tabular-nums;
	}
	.color-caption {
		font-size: 0.6875rem;
		color: var(--color-text-secondary);
	}
	.color-key {
		display: grid;
		gap: 0.5rem;
		flex: 1 1 10rem;
		min-width: 0;
		font-size: 0.6875rem;
	}
	.color-key > div {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
	}
	dt {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	dd {
		font-variant-numeric: tabular-nums;
	}
	.color-key .ms {
		width: 1rem;
		text-align: center;
		font-size: 0.875rem;
	}
	.measure {
		width: auto;
		max-width: 100%;
		font-size: 0.6875rem;
	}
	.empty-chart {
		display: grid;
		min-height: 11rem;
		place-items: center;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		text-align: center;
	}
	@container (max-width: 760px) {
		.analysis-grid {
			grid-template-columns: 1fr;
		}
	}
	@container (max-width: 360px) {
		.color-distribution {
			gap: 0.75rem;
		}
	}
</style>
