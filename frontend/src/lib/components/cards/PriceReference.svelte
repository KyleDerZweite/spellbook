<script lang="ts">
	import Select from '#lib/components/ui/select/Select.svelte';
	import { page } from '$app/state';
	import { loadReferencePrice } from '#lib/valuation/read.ts';
	import type {
		PriceReference,
		PriceFinish,
		PricePublication
	} from '@spellbook/contracts/valuation.ts';
	import { formatReferenceEUR } from '#lib/valuation/money.ts';
	let {
		printingId,
		entryId,
		inventoryPriceRefreshKey
	}: { printingId: string; entryId?: string; inventoryPriceRefreshKey?: string } = $props();
	let requestGeneration = 0;
	let publication: PricePublication | null = $state(null);
	let finish: PriceFinish = $state('nonfoil'),
		reference: PriceReference | null = $state(null),
		quantity = $state(1),
		health = $state(''),
		loading = $state(false),
		readError = $state(''),
		retry = $state(0);
	const copyLabel = $derived(quantity === 1 ? 'copy' : 'copies');
	const reasons: Record<string, string> = {
		SourceUnavailable: 'No reference source has been published.',
		PrintingMissing: 'This printing is missing from the reference source.',
		AmountMissing: 'No EUR amount is available.',
		ReferenceExpired: 'The reference is more than seven days old.',
		UnsupportedFinish: 'No exact reference for this finish.',
		AmbiguousLanguageMapping: 'An English printing cannot be matched uniquely.',
		MissingVariantEvidence: 'There is not enough variant evidence for an English reference.'
	};
	$effect(() => {
		const selectedPrinting = printingId,
			selectedEntry = entryId,
			selectedFinish = finish,
			selectedAccount = page.data.user?.accountId;
		if (selectedEntry) void inventoryPriceRefreshKey;
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
		health = '';
		publication = null;
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
				health = result.refreshStatus.kind;
				publication = result.publications[0] ?? null;
			})
			.catch((cause) => {
				if (current())
					readError =
						cause instanceof Error ? cause.message : 'Reference prices could not be loaded.';
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

<section class="mt-3 rounded border border-border p-3 text-sm" aria-label="Reference price">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h3 class="font-medium">Reference price</h3>
		{#if !entryId}<Select
				label="Reference price finish"
				value={finish}
				options={[
					{ value: 'nonfoil', label: 'Nonfoil' },
					{ value: 'foil', label: 'Foil' }
				]}
				onchange={(value) => {
					if (value === 'nonfoil' || value === 'foil') finish = value;
				}}
				class="max-w-40"
			/>{/if}
	</div>
	{#if loading}<p role="status">Loading reference…</p>
	{:else if readError}<p role="alert">{readError}</p>
		<button type="button" class="btn btn-secondary mt-2" onclick={() => retry++}
			>Retry reference</button
		>
	{:else if reference}
		<p class="mt-2">
			{reference.finish === 'foil' ? 'Foil' : 'Nonfoil'} · {#if reference.kind === 'Known'}{formatReferenceEUR(
					reference.amount
				)} per copy{:else}Unknown EUR reference{/if}
		</p>
		{#if reference.kind === 'Known'}
			<p class="text-text-muted">
				{reference.measure === 'prices.eur_foil' ? 'Scryfall EUR foil' : 'Scryfall EUR'} · {reference.freshness ===
				'Stale'
					? 'Stale reference'
					: 'Fresh reference'} · Source {new Date(reference.sourceTime).toLocaleString()}
			</p>
			{#if reference.provenance === 'EnglishFallback'}<p>
					English printing reference · Same edition, collector number and variant
				</p>{/if}
			{#if entryId}<p>
					{quantity}
					{copyLabel} · Estimated reference total {formatReferenceEUR(reference.amount, quantity)}
				</p>
				<p class="text-text-muted">
					Coverage: {quantity} of {quantity}
					{copyLabel}{reference.freshness === 'Stale' ? ' (stale)' : ''}
				</p>{/if}
		{:else}<p class="text-text-muted">{reasons[reference.reason]}</p>
			{#if publication}<p class="text-text-muted">
					Scryfall EUR{reference.finish === 'foil' ? ' foil' : ''} source · {new Date(
						publication.sourceTime
					).toLocaleString()}
				</p>{/if}
			{#if entryId}<p class="text-text-muted">Coverage: 0 of {quantity} {copyLabel}</p>{/if}{/if}
		{#if health === 'Failed'}<p class="text-text-muted">
				Latest source refresh failed. Existing references keep their original source date.
			</p>{/if}
		{#if reference.links.length}<nav
				class="mt-2 flex flex-wrap gap-3"
				aria-label="External product links"
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
			Market reference estimate. No condition discount or guaranteed sale amount.
		</p>
	{/if}
</section>
