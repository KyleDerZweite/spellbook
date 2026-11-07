<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import type { PriceFinish, PriceHistoryResponse } from '@spellbook/contracts/valuation.ts';
	import { formatReferenceEUR } from '#lib/valuation/money.ts';
	let { printingId, finish }: { printingId: string; finish: PriceFinish } = $props();
	let open = $state(false),
		retry = $state(0),
		loading = $state(false),
		error = $state('');
	let history: PriceHistoryResponse | null = $state(null);
	let generation = 0;
	$effect(() => {
		const id = printingId,
			selectedFinish = finish;
		void retry;
		const controller = new AbortController(),
			requestGeneration = ++generation;
		const current = () => !controller.signal.aborted && requestGeneration === generation;
		history = null;
		error = '';
		if (open) {
			loading = true;
			fetch(
				`/api/v1/mtg/prices/history?${new URLSearchParams({ printingId: id, finish: selectedFinish, days: '30' })}`,
				{ signal: controller.signal }
			)
				.then(async (response) => {
					if (!current()) return;
					if (!response.ok) throw new Error(language.t('ui.Source.history.could.not.be.loaded'));
					const result: PriceHistoryResponse = await response.json();
					if (current()) history = result;
				})
				.catch((cause) => {
					if (current())
						error =
							cause instanceof Error
								? language.message(cause.message)
								: language.t('ui.Source.history.could.not.be.loaded');
				})
				.finally(() => {
					if (current()) loading = false;
				});
		}
		return () => {
			controller.abort();
			generation++;
		};
	});
</script>

<details class="mt-3" bind:open>
	<summary class="cursor-pointer">{language.t('ui.Public.source.history.30.days')}</summary>
	<p class="mt-2 text-xs text-text-muted">
		{language.t(
			'ui.Dated.market.references.not.historical.holdings.Missing.dates.are.gaps.Cardmarket.and'
		)}
		{#if history?.sourceStatuses.some((status) => status.source === 'Demo')}{language.t(
				'ui.Illustrative.Demo.history.based.on.a.fixed.card.price.snapshot'
			)}{:else}{language.t(
				'ui.Scryfall.history.begins.with.recorded.imports.MTGJSON.may.supply.earlier.source.points'
			)}{/if}
	</p>
	{#if loading}<p role="status">{language.t('ui.Loading.source.history')}</p>
	{:else if error}<p role="alert">{language.message(error)}</p>
		<button type="button" class="btn btn-secondary" onclick={() => retry++}
			>{language.t('ui.Retry.history')}</button
		>
	{:else if history}
		{#if !history.points.length}<p>{language.t('ui.No.source.points.in.this.window')}</p>
		{:else}<div class="mt-2 max-h-64 overflow-auto">
				<table class="w-full text-left text-xs">
					<thead
						><tr
							><th
								>{history.sourceStatuses.some((status) => status.source === 'Demo')
									? 'Example day'
									: language.t('ui.Source.date')}</th
							><th>{language.t('ui.Source.measure')}</th><th>EUR</th></tr
						></thead
					><tbody>
						{#each history.points as point}<tr
								><td class="py-1"
									>{point.source === 'Demo'
										? point.day
										: point.timePrecision === 'Day'
											? `${point.sourceDate} (day)`
											: new Date(point.sourceTime).toLocaleString(language.locale)}</td
								><td
									>{point.source} · {point.measure}{point.provenance === 'EnglishFallback'
										? ' · English printing'
										: ''}{point.source === 'MTGJSON' ? ' · upstream Cardmarket' : ''}</td
								><td>{formatReferenceEUR(point.amount, 1, language.locale)}</td></tr
							>{/each}
					</tbody>
				</table>
			</div>{/if}
	{/if}
</details>
