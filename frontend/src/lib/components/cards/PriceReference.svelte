<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { untrack } from 'svelte';
	import { workspaceSavedState } from '#lib/saved-state/workspace.svelte.ts';
	import PriceHistory from './PriceHistory.svelte';
	import Select from '#lib/components/ui/select/Select.svelte';
	import { page } from '$app/state';
	import { loadReferencePrice } from '#lib/valuation/read.ts';
	import type {
		PriceReference,
		PriceFinish,
		PriceSourceStatus
	} from '@spellbook/contracts/valuation.ts';
	import { formatReferenceEUR } from '#lib/valuation/money.ts';
	let {
		printingId,
		entryId,
		inventoryPriceRefreshKey,
		historyEnabled = false
	}: {
		printingId: string;
		entryId?: string;
		inventoryPriceRefreshKey?: string;
		historyEnabled?: boolean;
	} = $props();
	let requestGeneration = 0;
	let finish: PriceFinish = $state('nonfoil'),
		reference: PriceReference | null = $state(null),
		quantity = $state(1),
		health: PriceSourceStatus[] = $state([]),
		loading = $state(false),
		readError = $state(''),
		retry = $state(0);
	$effect(() => {
		const selectedEntry = entryId,
			selectedPrinting = printingId,
			account = page.data.user?.accountId;
		if (!selectedEntry || !account) return;
		void inventoryPriceRefreshKey;
		void retry;
		reference = null;
		quantity = 1;
		health = [];
		loading = true;
		readError = '';
		const subscription = untrack(() =>
			workspaceSavedState.subscribe({
				topics: ['values'],
				clear: () => {
					reference = null;
					quantity = 1;
					health = [];
					readError = '';
					loading = false;
					requestGeneration++;
				},
				refresh: async (lease) => {
					const generation = ++requestGeneration;
					const current = () =>
						lease.current() &&
						generation === requestGeneration &&
						account === page.data.user?.accountId &&
						selectedEntry === entryId &&
						selectedPrinting === printingId;
					try {
						const result = await loadReferencePrice(
							{ printingId: selectedPrinting, entryId: selectedEntry, finish: 'nonfoil' },
							lease.signal,
							current,
							async (url, init) => {
								const response = await fetch(url, { ...init, cache: 'no-store' });
								if (response.status === 401 && current()) workspaceSavedState.expire();
								return response;
							}
						);
						if (!result || !current()) return;
						const first = result.results[0];
						if (first && 'reference' in first) {
							reference = first.reference;
							quantity = first.quantity;
						}
						health = result.sourceStatuses;
						readError = '';
						loading = false;
					} catch (cause) {
						if (current()) {
							reference = null;
							loading = false;
							readError =
								cause instanceof Error
									? language.message(cause.message)
									: language.t('ui.Reference.prices.could.not.be.loaded');
						}
						throw cause;
					}
				}
			})
		);
		return () => {
			subscription.dispose();
			requestGeneration++;
		};
	});
	const copyLabel = $derived(quantity === 1 ? language.t('unit.copy') : language.t('unit.copies'));
	const reasons: Record<string, string> = $derived({
		SourceUnavailable: language.t('ui.No.reference.source.has.been.published'),
		PrintingMissing: language.t('ui.This.printing.is.missing.from.the.reference.source'),
		AmountMissing: language.t('ui.No.EUR.amount.is.available'),
		ReferenceExpired: language.t('ui.The.reference.is.more.than.seven.days.old'),
		UnsupportedFinish: language.t('ui.No.exact.reference.for.this.finish'),
		AmbiguousLanguageMapping: language.t('ui.An.English.printing.cannot.be.matched.uniquely'),
		MissingVariantEvidence: language.t(
			'ui.There.is.not.enough.variant.evidence.for.an.English.reference'
		),
		AmbiguousSourceMapping: language.t('ui.The.provider.identity.cannot.be.matched.uniquely')
	});
	$effect(() => {
		const selectedPrinting = printingId,
			selectedEntry = entryId,
			selectedFinish = finish,
			selectedAccount = page.data.user?.accountId;
		if (selectedEntry) return;
		void retry;
		const controller = new AbortController();
		const generation = ++requestGeneration;
		const current = () =>
			!controller.signal.aborted &&
			generation === requestGeneration &&
			selectedAccount === page.data.user?.accountId;
		reference = null;
		readError = '';
		loading = true;
		health = [];
		quantity = 1;
		loadReferencePrice(
			{ printingId: selectedPrinting, entryId: selectedEntry, finish: selectedFinish },
			controller.signal,
			current
		)
			.then((result) => {
				if (!result || !current()) return;
				const first = result.results[0];
				if (first && 'reference' in first) {
					reference = first.reference;
					quantity = first.quantity;
				} else reference = first ?? null;
				health = result.sourceStatuses;
			})
			.catch((cause) => {
				if (current())
					readError =
						cause instanceof Error
							? language.message(cause.message)
							: language.t('ui.Reference.prices.could.not.be.loaded');
			})
			.finally(() => {
				if (current()) loading = false;
			});
		return () => {
			controller.abort();
			requestGeneration++;
		};
	});
</script>

<section
	class="mt-3 rounded border border-border p-3 text-sm"
	aria-label={language.t('ui.Reference.price')}
>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h3 class="font-medium">{language.t('ui.Reference.price')}</h3>
		{#if !entryId}<Select
				label={language.t('ui.Reference.price.finish')}
				value={finish}
				options={[
					{ value: 'nonfoil', label: language.t('notice.Nonfoil') },
					{ value: 'foil', label: language.t('notice.Foil') }
				]}
				onchange={(value) => {
					if (value === 'nonfoil' || value === 'foil') finish = value;
				}}
				class="max-w-40"
			/>{/if}
	</div>
	{#if loading}<p role="status">{language.t('ui.Loading.reference')}</p>
	{:else if readError}<p role="alert">{language.message(readError)}</p>
		<button type="button" class="btn btn-secondary mt-2" onclick={() => retry++}
			>{language.t('ui.Retry.reference')}</button
		>
	{:else if reference}
		<p class="mt-2">
			{reference.finish === 'foil' ? language.t('notice.Foil') : language.t('notice.Nonfoil')} · {#if reference.kind === 'Known'}{formatReferenceEUR(
					reference.amount,
					1,
					language.locale
				)}
				{language.t('ui.per.copy')}{:else}{language.t('ui.Unknown.EUR.reference')}{/if}
		</p>
		{#if reference.kind === 'Known'}
			<p class="text-text-muted">
				{reference.source} EUR · {reference.measure} · {reference.freshness === 'Static'
					? language.t('ui.Static.Demo.reference')
					: reference.freshness === 'Stale'
						? language.t('ui.Stale.reference')
						: language.t('ui.Fresh.reference')}
				{language.t('ui.Source')}
				{reference.timePrecision === 'Instant'
					? new Date(reference.sourceTime).toLocaleString(language.locale)
					: language.t('message.p0.day.precision', { p0: String(reference.sourceDate) })}
			</p>
			{#if reference.provenance === 'EnglishFallback'}<p>
					{language.t('ui.English.printing.reference.Same.edition.collector.number.and.variant')}
				</p>{/if}
			{#if entryId}<p>
					{language.t('sentence.p0.p1.Estimated.reference.total.p2', {
						p0: String(quantity),
						p1: String(copyLabel),
						p2: String(formatReferenceEUR(reference.amount, quantity, language.locale))
					})}
				</p>
				<p class="text-text-muted">
					{language.t('sentence.Coverage.p0.of.p1.p2.p3', {
						p0: String(quantity),
						p1: String(quantity),
						p2: String(copyLabel),
						p3: String(reference.freshness === 'Stale' ? ' (stale)' : '')
					})}
				</p>{/if}
		{:else}<p class="text-text-muted">{reasons[reference.reason]}</p>

			{#if entryId}<p class="text-text-muted">
					{language.t('sentence.Coverage.0.of.p0.p1', {
						p0: String(quantity),
						p1: String(copyLabel)
					})}
				</p>{/if}{/if}
		{#each health as status}<p class="text-text-muted text-xs">
				{status.source}: {status.kind === 'Failed'
					? 'Latest refresh failed; original source age applies.'
					: status.kind === 'Disabled'
						? 'Disabled'
						: status.kind === 'NeverAttempted'
							? language.t('ui.No.successful.publication')
							: 'Published'}
			</p>{/each}
		{#if reference.kind === 'Known' && reference.timePrecision === 'Day'}<p
				class="text-text-muted text-xs"
			>
				{language.t('sentence.Freshness.uses.a.conservative.UTC.day.bound.evaluated.p0', {
					p0: String(new Date(reference.asOf).toLocaleString(language.locale))
				})}
			</p>{/if}
		{#if reference.kind === 'Known' && reference.source === 'MTGJSON'}<p
				class="text-text-muted text-xs"
			>
				{language.t('ui.Upstream.Cardmarket.These.sources.are.not.independent.confirmations')}
			</p>{/if}
		{#if reference.links.length}<nav
				class="mt-2 flex flex-wrap gap-3"
				aria-label={language.t('ui.External.product.links')}
			>
				{#each reference.links as link}<a
						class="underline hover:text-gold"
						href={link.url}
						target="_blank"
						rel="noopener noreferrer"
						>{link.provider}{link.provenance === 'EnglishFallback' ? ' (English printing)' : ''}</a
					>{/each}
			</nav>{/if}
		<p class="mt-2 text-xs text-text-muted">
			{language.t('ui.Market.reference.estimate.No.condition.discount.or.guaranteed.sale.amount')}
		</p>
	{/if}
	{#if historyEnabled}<PriceHistory {printingId} {finish} />{/if}
</section>
