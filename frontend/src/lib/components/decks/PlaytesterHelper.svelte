<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	import { translate, type MessageKey } from '#lib/i18n/messages.ts';
	import { scaleLinear } from 'd3-scale';
	import type { CardDocument } from '@spellbook/contracts/catalog.ts';
	import type { DeckCard } from '@spellbook/contracts/decks.ts';
	import { deckStatistics } from '#lib/decks/statistics.ts';
	import { handSummary, type PlaytestCard } from '#lib/decks/playtest.ts';

	const language = useLanguage();
	const colorLabel = (id: string) => translate(language.locale, `color.${id}` as MessageKey);

	let {
		hand,
		mulliganCount,
		cards,
		documents
	}: {
		hand: readonly PlaytestCard[];
		mulliganCount: number;
		cards: readonly DeckCard[];
		documents: Record<string, CardDocument>;
	} = $props();

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

	const summary = $derived(handSummary(hand));
	const statistics = $derived(deckStatistics([...cards], documents, 'deck'));
	const maxBucket = $derived(Math.max(1, ...statistics.curve.map((item) => item.quantity)));
	const curveScale = $derived(scaleLinear().domain([0, maxBucket]).range([0, 100]));
	const deckColors = $derived(statistics.colorIdentity.filter((item) => item.quantity > 0));
	const landRatio = $derived(
		statistics.quantity > 0 ? Math.round((statistics.lands / statistics.quantity) * 100) : null
	);
</script>

<section class="helper-panel" aria-label={language.t('playtest.helper.title')}>
	<div class="helper-grid">
		<div class="helper-card">
			<h3>{language.t('playtest.helper.handSection')}</h3>
			<dl class="metric-row">
				<div>
					<dt>{language.t('playtest.helper.lands')}</dt>
					<dd>{summary.lands.toLocaleString(language.locale)}</dd>
				</div>
				<div>
					<dt>{language.t('playtest.helper.nonlands')}</dt>
					<dd>{summary.nonlands.toLocaleString(language.locale)}</dd>
				</div>
				<div>
					<dt>{language.t('playtest.helper.avgMana')}</dt>
					<dd>
						{summary.averageManaValue === null
							? language.t('ui.Unavailable')
							: summary.averageManaValue.toLocaleString(language.locale, {
									maximumFractionDigits: 2
								})}
					</dd>
				</div>
				<div>
					<dt>{language.t('playtest.helper.mulligans')}</dt>
					<dd>{mulliganCount.toLocaleString(language.locale)}</dd>
				</div>
			</dl>

			<div class="sub-block">
				<span class="sub-label">{language.t('playtest.helper.manaThresholds')}</span>
				<div class="pill-row">
					<span class="stat-pill">≤ 1: {summary.manaValueThresholds.le1}</span>
					<span class="stat-pill">≤ 2: {summary.manaValueThresholds.le2}</span>
					<span class="stat-pill">≤ 3: {summary.manaValueThresholds.le3}</span>
				</div>
			</div>

			<div class="sub-block">
				<span class="sub-label">{language.t('playtest.helper.handColors')}</span>
				{#if summary.colors.length}
					<div class="pill-row">
						{#each summary.colors as item (item.label)}
							<span class="color-pill">
								<i
									class={`ms ms-${symbols[item.label] ?? 'card'}`}
									aria-hidden="true"
									style:color={palette[item.label]}
								></i>
								{colorLabel(item.label)}: {item.count.toLocaleString(language.locale)}
							</span>
						{/each}
					</div>
				{:else}
					<p class="muted-text">{language.t('playtest.helper.noColors')}</p>
				{/if}
			</div>
		</div>

		<div class="helper-card">
			<div class="deck-helper-head">
				<h3>{language.t('playtest.helper.deckSection')}</h3>
				<span class="muted-text">
					{language.t('playtest.helper.avgMana')}:
					<strong>
						{statistics.averageManaValue === null
							? language.t('ui.Unavailable')
							: statistics.averageManaValue.toLocaleString(language.locale, {
									maximumFractionDigits: 2
								})}
					</strong>
					· {language.t('playtest.helper.landRatio')}:
					<strong>
						{landRatio === null
							? language.t('ui.Unavailable')
							: `${statistics.lands}/${statistics.quantity} (${landRatio}%)`}
					</strong>
				</span>
			</div>

			{#if statistics.curveQuantity}
				<div class="curve-bars" role="group" aria-label={language.t('ui.Copies.by.mana.value')}>
					{#each statistics.curve as item (item.label)}
						<div
							class="curve-col"
							title={language.t('message.Mana.value.p0.p1.copies', {
								p0: String(item.label),
								p1: String(item.quantity.toLocaleString(language.locale))
							})}
						>
							<span class="curve-count">{item.quantity || ''}</span>
							<div class="curve-track">
								<span class="curve-fill" style:height={`${curveScale(item.quantity)}%`}></span>
							</div>
							<span class="curve-label">{item.label}</span>
						</div>
					{/each}
				</div>
			{:else}
				<p class="muted-text">{language.t('ui.No.resolved.nonland.mana.values')}</p>
			{/if}

			{#if deckColors.length}
				<div class="pill-row deck-colors">
					{#each deckColors as item (item.label)}
						<span class="color-pill">
							<i
								class={`ms ms-${symbols[item.label] ?? 'card'}`}
								aria-hidden="true"
								style:color={palette[item.label]}
							></i>
							{colorLabel(item.label)}: {item.quantity.toLocaleString(language.locale)}
						</span>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</section>

<style>
	.helper-panel {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		padding: 1rem;
	}
	.helper-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr);
		gap: 1rem;
	}
	.helper-card {
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: 0.625rem;
		padding: 0.875rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		min-width: 0;
	}
	h3 {
		font-family: var(--font-display);
		font-size: var(--text-body);
		line-height: var(--text-body--line-height);
		font-weight: 400;
		margin: 0;
	}
	.deck-helper-head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
	}
	.metric-row {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.5rem;
		margin: 0;
	}
	.metric-row > div {
		background: var(--color-surface);
		border-radius: 0.5rem;
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	dt {
		font-size: var(--text-meta);
		line-height: var(--text-meta--line-height);
		color: var(--color-text-secondary);
	}
	dd {
		margin: 0;
		font-size: var(--text-body);
		line-height: var(--text-body--line-height);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.sub-block {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	.sub-label {
		font-size: var(--text-meta);
		line-height: var(--text-meta--line-height);
		color: var(--color-text-secondary);
	}
	.pill-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}
	.stat-pill,
	.color-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.2rem 0.5rem;
		border-radius: 999px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		font-size: var(--text-meta);
		line-height: var(--text-meta--line-height);
		font-variant-numeric: tabular-nums;
	}
	.muted-text {
		margin: 0;
		font-size: var(--text-meta);
		line-height: var(--text-meta--line-height);
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}
	.muted-text strong {
		color: var(--color-text-primary);
		font-weight: 500;
	}
	.curve-bars {
		display: flex;
		align-items: end;
		gap: 0.375rem;
	}
	.curve-col {
		display: grid;
		grid-template-rows: 1rem 4.75rem 1rem;
		align-items: end;
		gap: 0.25rem;
		flex: 1;
		min-width: 0;
		text-align: center;
		font-size: var(--text-meta);
		line-height: var(--text-meta--line-height);
		font-variant-numeric: tabular-nums;
	}
	.curve-count,
	.curve-label {
		color: var(--color-text-secondary);
	}
	.curve-track {
		height: 100%;
		display: flex;
		align-items: end;
		border-bottom: 1px solid var(--color-border);
	}
	.curve-fill {
		display: block;
		width: 100%;
		border-radius: 0.2rem 0.2rem 0 0;
		background: var(--color-chart-primary);
		transition: height 160ms ease;
	}
	.deck-colors {
		margin-top: auto;
	}
	@media (max-width: 900px) {
		.helper-grid {
			grid-template-columns: 1fr;
		}
		.metric-row {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.curve-fill {
			transition: none;
		}
	}
</style>
