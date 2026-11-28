<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '$app/forms';
	import { goto } from '$app/navigation';
	import type {
		DeckDiscoveryInventoryMode,
		DeckDiscoveryItem,
		DeckDiscoveryResponse,
		DeckDiscoverySort
	} from '@spellbook/contracts/reference-decks.ts';
	import { cachedCardImage, cardImageSrc } from '#lib/cards/card-image.ts';
	import Button from '#lib/components/ui/button/Button.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import {
		DISCOVERY_PAGE_SIZE,
		discoveryHref,
		hasActiveDiscoveryFilters,
		safeHttpUrl,
		type DiscoveryUrlState
	} from '#lib/decks/discovery-query.ts';
	import { useLanguage } from '#lib/i18n/context.ts';
	import { formatValueEUR } from '#lib/valuation/money.ts';

	const language = useLanguage();

	let {
		discovery,
		state: urlState,
		demo = false,
		readError = ''
	}: {
		discovery: DeckDiscoveryResponse | null;
		state: DiscoveryUrlState;
		readError?: string;
		demo?: boolean;
	} = $props();

	let searchQuery = $state('');
	let selectedFormat = $state('');
	let budgetInput = $state('');
	let minOwnershipInput = $state('');
	let selectedSort = $state<DeckDiscoverySort>('missing_cost:asc');
	let inventoryMode = $state<DeckDiscoveryInventoryMode>('all');
	let copyingDeckId = $state<string | null>(null);
	let copyError = $state('');

	$effect(() => {
		searchQuery = urlState.query;
		selectedFormat = urlState.format;
		budgetInput = urlState.maxMissingCost === null ? '' : String(urlState.maxMissingCost);
		minOwnershipInput = urlState.minOwnership === null ? '' : String(urlState.minOwnership);
		selectedSort = urlState.sort;
		inventoryMode = urlState.inventoryMode;
	});

	const availableFormats = $derived(
		discovery?.availableFormats ?? [
			'standard',
			'pioneer',
			'modern',
			'legacy',
			'vintage',
			'commander',
			'pauper',
			'brawl'
		]
	);

	const minOwnershipOptions = $derived([
		{ value: '', label: language.t('deckDiscovery.minOwnershipAny') },
		{
			value: '25',
			label: language.t('deckDiscovery.minOwnershipAtLeast', { percent: language.number(25) })
		},
		{
			value: '50',
			label: language.t('deckDiscovery.minOwnershipAtLeast', { percent: language.number(50) })
		},
		{
			value: '75',
			label: language.t('deckDiscovery.minOwnershipAtLeast', { percent: language.number(75) })
		},
		{
			value: '90',
			label: language.t('deckDiscovery.minOwnershipAtLeast', { percent: language.number(90) })
		},
		{
			value: '100',
			label: language.t('deckDiscovery.minOwnershipAtLeast', { percent: language.number(100) })
		}
	]);

	const sortOptions = $derived<{ value: DeckDiscoverySort; label: string }[]>([
		{ value: 'missing_cost:asc', label: language.t('deckDiscovery.sort.missingCost') },
		{ value: 'ownership:desc', label: language.t('deckDiscovery.sort.ownership') },
		{ value: 'meta_share:desc', label: language.t('deckDiscovery.sort.metaShare') },
		{ value: 'name:asc', label: language.t('deckDiscovery.sort.name') }
	]);

	const activeFilters = $derived(hasActiveDiscoveryFilters(urlState));
	const total = $derived(discovery?.total ?? 0);
	const totalPages = $derived(Math.max(1, Math.ceil(total / DISCOVERY_PAGE_SIZE)));
	const currentPage = $derived(Math.min(urlState.page, totalPages));
	const assembledDeckCount = $derived(discovery?.assembledDeckCount ?? 0);
	const indexEmpty = $derived(
		!readError &&
			discovery !== null &&
			discovery.total === 0 &&
			!activeFilters &&
			discovery.sources.every((source) => source.deckCount === 0)
	);

	function parseBudget(): number | null {
		const normalized = budgetInput.trim().replace(',', '.');
		if (!normalized) return null;
		const parsed = Number(normalized);
		return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1_000_000 ? parsed : null;
	}

	function parseMinOwnership(): number | null {
		if (!minOwnershipInput) return null;
		const parsed = Number(minOwnershipInput);
		return Number.isFinite(parsed) && parsed > 0 && parsed <= 100 ? parsed : null;
	}

	function navigateFilters(overrides: Partial<DiscoveryUrlState> = {}) {
		const next: Partial<DiscoveryUrlState> = {
			format: selectedFormat as DiscoveryUrlState['format'],
			source: urlState.source,
			query: searchQuery.trim(),
			maxMissingCost: parseBudget(),
			minOwnership: parseMinOwnership(),
			inventoryMode,
			sort: selectedSort,
			page: 1,
			...overrides
		};
		goto(discoveryHref(next));
	}

	function handleFilterSubmit(event: SubmitEvent) {
		event.preventDefault();
		navigateFilters({ page: 1 });
	}

	function formatLabel(format: string): string {
		return format ? `${format[0].toUpperCase()}${format.slice(1)}` : '';
	}

	function missingCostText(deck: DeckDiscoveryItem): string {
		if (deck.missingCards === 0) return formatValueEUR('0.00', language.locale);
		if (deck.missingValue.coveredQuantity === 0) {
			return language.t('deckDiscovery.missingCostUnknown');
		}
		return formatValueEUR(deck.missingValue.coveredValue, language.locale);
	}

	function enhanceCopy(deckId: string): SubmitFunction {
		return () => {
			copyingDeckId = deckId;
			copyError = '';
			return async ({ result, update }) => {
				if (result.type === 'failure') {
					copyingDeckId = null;
					const message =
						typeof result.data?.message === 'string'
							? result.data.message
							: language.t('deckDiscovery.copyFailed');
					copyError = message;
					return;
				}
				if (result.type === 'error') {
					copyingDeckId = null;
					copyError = language.t('deckDiscovery.copyFailed');
					return;
				}
				await update();
				copyingDeckId = null;
			};
		};
	}
</script>

<section class="superbrew-discovery" aria-labelledby="superbrew-discovery-title">
	<header class="discovery-intro">
		<div>
			<h2 id="superbrew-discovery-title" class="discovery-heading">
				{language.t('deckDiscovery.title')}
			</h2>
			<p class="discovery-subtitle">{language.t('deckDiscovery.subtitle')}</p>
		</div>
		{#if discovery && !readError}
			<p class="discovery-count" role="status">
				{language.t(`deckDiscovery.resultCount.${language.plural(total)}`, {
					count: language.number(total)
				})}
			</p>
		{/if}
	</header>

	<form method="GET" action="/mtg/decks" class="discovery-controls" onsubmit={handleFilterSubmit}>
		<input type="hidden" name="tab" value="discovery" />
		{#if urlState.source}
			<input type="hidden" name="discSource" value={urlState.source} />
		{/if}

		<div class="control-field search-field">
			<label class="label" for="disc-q">{language.t('deckDiscovery.searchLabel')}</label>
			<input
				id="disc-q"
				name="discQ"
				type="search"
				class="input"
				maxlength="200"
				placeholder={language.t('deckDiscovery.searchPlaceholder')}
				bind:value={searchQuery}
			/>
		</div>

		<div class="control-field">
			<label class="label" for="disc-format">{language.t('deckDiscovery.formatLabel')}</label>
			<select
				id="disc-format"
				name="discFormat"
				class="input"
				bind:value={selectedFormat}
				onchange={() => navigateFilters({ page: 1 })}
			>
				<option value="">{language.t('deckDiscovery.formatAll')}</option>
				{#each availableFormats as format}
					<option value={format}>{formatLabel(format)}</option>
				{/each}
			</select>
		</div>

		<div class="control-field">
			<label class="label" for="disc-budget">{language.t('deckDiscovery.budgetLabel')}</label>
			<input
				id="disc-budget"
				name="discBudget"
				type="number"
				class="input"
				min="0"
				max="1000000"
				step="0.01"
				inputmode="decimal"
				placeholder={language.t('deckDiscovery.budgetPlaceholder')}
				bind:value={budgetInput}
			/>
		</div>

		<div class="control-field">
			<label class="label" for="disc-min-owned">
				{language.t('deckDiscovery.minOwnershipLabel')}
			</label>
			<select
				id="disc-min-owned"
				name="discMinOwned"
				class="input"
				bind:value={minOwnershipInput}
				onchange={() => navigateFilters({ page: 1 })}
			>
				{#each minOwnershipOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>

		<div class="control-field">
			<label class="label" for="disc-sort">{language.t('deckDiscovery.sortLabel')}</label>
			<select
				id="disc-sort"
				name="discSort"
				class="input"
				bind:value={selectedSort}
				onchange={() => navigateFilters({ page: 1 })}
			>
				{#each sortOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>

		<div class="control-field mode-field">
			<span class="label" id="disc-mode-label">
				{language.t('deckDiscovery.inventoryModeLabel')}
			</span>
			<div class="mode-toggle" role="group" aria-labelledby="disc-mode-label">
				<input type="hidden" name="discMode" value={inventoryMode} />
				<Button
					type="button"
					variant={inventoryMode === 'all' ? 'default' : 'secondary'}
					aria-pressed={inventoryMode === 'all'}
					onclick={() => {
						inventoryMode = 'all';
						navigateFilters({ inventoryMode: 'all', page: 1 });
					}}
				>
					{language.t('deckDiscovery.inventoryMode.all')}
				</Button>
				<Button
					type="button"
					variant={inventoryMode === 'free' ? 'default' : 'secondary'}
					aria-pressed={inventoryMode === 'free'}
					onclick={() => {
						inventoryMode = 'free';
						navigateFilters({ inventoryMode: 'free', page: 1 });
					}}
				>
					{language.t('deckDiscovery.inventoryMode.free')}
				</Button>
			</div>
		</div>

		<div class="control-actions">
			<Button type="submit" variant="secondary">
				{language.t('deckDiscovery.applyFilters')}
			</Button>
			{#if activeFilters}
				<Button href={discoveryHref({})} variant="ghost">
					{language.t('deckDiscovery.clearFilters')}
				</Button>
			{/if}
		</div>
	</form>

	{#if inventoryMode === 'free' && assembledDeckCount > 0}
		<p class="discovery-hint">
			{language.t(
				`deckDiscovery.inventoryMode.assembledHint.${language.plural(assembledDeckCount)}`,
				{ count: language.number(assembledDeckCount) }
			)}
		</p>
	{/if}

	{#if copyError}
		<p class="discovery-alert" role="alert">{copyError}</p>
	{/if}

	{#if readError}
		<p class="discovery-alert" role="alert">{language.t('deckDiscovery.readError')}</p>
	{:else if discovery && !discovery.valuationAvailable}
		<p class="discovery-warning" role="status">
			{language.t('deckDiscovery.valuationUnavailable')}
		</p>
	{/if}

	{#if !readError && discovery}
		{#if discovery.decks.length === 0}
			<div class="discovery-empty">
				<p>
					{indexEmpty
						? language.t('deckDiscovery.emptyIndex')
						: language.t('deckDiscovery.emptyFiltered')}
				</p>
				{#if activeFilters}
					<Button href={discoveryHref({})} variant="secondary">
						{language.t('deckDiscovery.clearFilters')}
					</Button>
				{/if}
			</div>
		{:else}
			<ul class="discovery-grid">
				{#each discovery.decks as deck (deck.id)}
					{@const externalSourceUrl = safeHttpUrl(deck.sourceUrl)}
					<li class="discovery-card">
						<div class="card-header">
							{#if deck.coverImageUri}
								<img
									class="card-cover"
									src={cardImageSrc(deck.coverImageUri)}
									alt=""
									width="72"
									height="52"
									loading="lazy"
									{@attach cachedCardImage(deck.coverImageUri)}
								/>
							{:else}
								<div class="card-cover card-cover-placeholder" aria-hidden="true"></div>
							{/if}
							<div class="card-title-group">
								<h3 class="card-name" title={deck.name}>{deck.name}</h3>
								<div class="card-badges">
									<span class="badge format-badge">{formatLabel(deck.format)}</span>
									{#if deck.archetype && deck.archetype.toLowerCase() !== deck.name.toLowerCase()}
										<span class="badge">{deck.archetype}</span>
									{/if}
									{#if deck.metaShare !== null}
										<span class="badge">
											{language.t('deckDiscovery.metaShare', {
												share: deck.metaShare.toLocaleString(language.locale, {
													maximumFractionDigits: 1
												})
											})}
										</span>
									{/if}
									<span class="badge source-badge">{deck.source}</span>
								</div>
							</div>
						</div>

						<div class="ownership-block">
							<div class="ownership-row">
								<span class="ownership-text">
									{language.t('deckDiscovery.ownedSummary', {
										owned: language.number(deck.ownedCards),
										total: language.number(deck.cardCount),
										percent: deck.ownershipPercent.toLocaleString(language.locale, {
											maximumFractionDigits: 1
										})
									})}
								</span>
								<span class="missing-text" class:complete={deck.missingCards === 0}>
									{deck.missingCards === 0
										? language.t('deckDiscovery.completeOwned')
										: language.t(
												`deckDiscovery.missingCount.${language.plural(deck.missingCards)}`,
												{ count: language.number(deck.missingCards) }
											)}
								</span>
							</div>
							<div
								class="ownership-bar"
								role="progressbar"
								aria-valuenow={deck.ownershipPercent}
								aria-valuemin={0}
								aria-valuemax={100}
								aria-label={language.t('deckDiscovery.ownedSummary', {
									owned: language.number(deck.ownedCards),
									total: language.number(deck.cardCount),
									percent: deck.ownershipPercent.toLocaleString(language.locale, {
										maximumFractionDigits: 1
									})
								})}
							>
								<span
									class="ownership-bar-fill"
									style={`width: ${Math.max(0, Math.min(100, deck.ownershipPercent))}%`}
								></span>
							</div>
						</div>

						<div class="cost-block">
							<div class="cost-row">
								<span class="cost-label">{language.t('deckDiscovery.missingCostLabel')}</span>
								<strong class="cost-amount">{missingCostText(deck)}</strong>
							</div>
							{#if deck.missingCards > 0 && !deck.missingValue.complete}
								<p class="price-coverage-warning">
									{deck.missingValue.coveredQuantity === 0
										? language.t('deckDiscovery.priceCoverageUnknown', {
												total: language.number(deck.missingValue.totalQuantity)
											})
										: language.t('deckDiscovery.priceCoverageIncomplete', {
												covered: language.number(deck.missingValue.coveredQuantity),
												total: language.number(deck.missingValue.totalQuantity)
											})}
								</p>
							{/if}
						</div>

						<div class="card-footer">
							<form
								method="POST"
								action="?/copyReferenceDeck"
								use:enhance={enhanceCopy(deck.id)}
								class="copy-form"
							>
								<input type="hidden" name="referenceDeckId" value={deck.id} />
								<Button type="submit" variant="default" disabled={demo || copyingDeckId !== null}>
									<Plus size={16} aria-hidden="true" />{demo
										? language.t('demo.disabled')
										: copyingDeckId === deck.id
											? language.t('deckDiscovery.addingToLibrary')
											: language.t('deckDiscovery.addToLibrary')}
								</Button>
							</form>
							{#if externalSourceUrl}
								<a
									class="source-link"
									href={externalSourceUrl}
									target="_blank"
									rel="noopener noreferrer"
								>
									{language.t('deckDiscovery.sourceLink')}
								</a>
							{/if}
						</div>
					</li>
				{/each}
			</ul>

			{#if totalPages > 1}
				<nav class="discovery-pagination" aria-label={language.t('deckDiscovery.title')}>
					{#if currentPage > 1}
						<Button
							href={discoveryHref({ ...urlState, page: currentPage - 1 })}
							variant="secondary"
						>
							{language.t('deckDiscovery.previousPage')}
						</Button>
					{/if}
					<span class="pagination-status">
						{language.t('deckDiscovery.pageStatus', {
							page: language.number(currentPage),
							pages: language.number(totalPages)
						})}
					</span>
					{#if currentPage < totalPages}
						<Button
							href={discoveryHref({ ...urlState, page: currentPage + 1 })}
							variant="secondary"
						>
							{language.t('deckDiscovery.nextPage')}
						</Button>
					{/if}
				</nav>
			{/if}
		{/if}
	{/if}
</section>

<style>
	.superbrew-discovery {
		display: flex;
		flex-direction: column;
		gap: var(--space-section, 1.5rem);
	}
	.discovery-intro {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-control-gap, 0.5rem) var(--space-page-margin, 1rem);
	}
	.discovery-heading {
		font-family: var(--font-display);
		font-size: var(--text-section-title);
		line-height: var(--text-section-title--line-height);
		font-weight: 400;
		margin: 0;
	}
	.discovery-subtitle {
		margin: 0.25rem 0 0;
		font-size: var(--text-body-compact);
		line-height: var(--text-body-compact--line-height);
		color: var(--color-text-secondary);
	}
	.discovery-count {
		margin: 0;
		font-size: var(--text-meta);
		line-height: var(--text-meta--line-height);
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}
	.discovery-controls {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: var(--space-toolbar-group, 0.75rem);
		align-items: end;
		padding: var(--space-page-margin, 1rem);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
	}
	.control-field {
		display: flex;
		flex-direction: column;
		gap: var(--space-control-inline, 0.25rem);
		min-width: 0;
	}
	.search-field {
		grid-column: span 2;
	}
	.mode-field {
		grid-column: span 2;
	}
	.mode-toggle {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-control-gap, 0.5rem);
		align-items: center;
	}
	.control-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-control-gap, 0.5rem);
		align-items: center;
	}
	.discovery-hint {
		margin: -0.75rem 0 0;
		font-size: var(--text-meta);
		line-height: var(--text-meta--line-height);
		color: var(--color-text-secondary);
	}
	.discovery-alert,
	.discovery-warning {
		margin: 0;
		padding: var(--space-toolbar-group, 0.75rem) var(--space-page-margin, 1rem);
		border-radius: 0.5rem;
		font-size: var(--text-body-compact);
		line-height: var(--text-body-compact--line-height);
	}
	.discovery-alert {
		background: color-mix(in srgb, var(--color-danger, #c62828) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-danger, #c62828) 35%, transparent);
	}
	.discovery-warning {
		background: color-mix(in srgb, var(--color-warning) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-warning) 35%, transparent);
		color: var(--color-warning);
	}
	.discovery-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-page-margin, 1rem);
		padding: var(--space-section-lg, 2rem) var(--space-page-margin, 1rem);
		text-align: center;
		color: var(--color-text-secondary);
		font-size: var(--text-body-compact);
		line-height: var(--text-body-compact--line-height);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
	}
	.discovery-grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(19.5rem, 1fr));
		gap: var(--space-page-margin, 1rem);
	}
	.discovery-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-toolbar-group, 0.75rem);
		padding: var(--space-page-margin, 1rem);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		min-width: 0;
	}
	.card-header {
		display: flex;
		gap: var(--space-toolbar-group, 0.75rem);
		align-items: flex-start;
		min-width: 0;
	}
	.card-cover {
		width: 4.5rem;
		height: 3.25rem;
		object-fit: cover;
		border-radius: 0.375rem;
		flex-shrink: 0;
		background: var(--color-surface-elevated, var(--color-background));
		border: 1px solid var(--color-border);
	}
	.card-cover-placeholder {
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-accent) 16%, transparent),
			var(--color-background)
		);
	}
	.card-title-group {
		min-width: 0;
		flex: 1;
	}
	.card-name {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-section-title);
		line-height: 1.3;
		font-weight: 400;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.card-badges {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-control-inline, 0.25rem);
		margin-top: 0.25rem;
	}
	.badge {
		display: inline-flex;
		align-items: center;
		padding: 0.125rem 0.5rem;
		border-radius: 999px;
		font-size: var(--text-meta);
		line-height: var(--text-meta--line-height);
		color: var(--color-text-secondary);
		background: var(--color-background);
		border: 1px solid var(--color-border);
	}
	.format-badge {
		color: var(--color-text-primary);
		font-weight: 500;
	}
	.ownership-block {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	.ownership-row {
		display: flex;
		justify-content: space-between;
		gap: var(--space-control-gap, 0.5rem);
		font-size: var(--text-meta);
		line-height: var(--text-meta--line-height);
		font-variant-numeric: tabular-nums;
	}
	.ownership-text {
		color: var(--color-text-primary);
		font-weight: 500;
	}
	.missing-text {
		color: var(--color-text-secondary);
	}
	.missing-text.complete {
		color: var(--color-success, var(--color-accent));
		font-weight: 500;
	}
	.ownership-bar {
		height: 4px;
		border-radius: 999px;
		background: var(--color-border);
		overflow: hidden;
	}
	.ownership-bar-fill {
		display: block;
		height: 100%;
		background: var(--color-accent);
	}
	.cost-block {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding-top: var(--space-control-gap, 0.5rem);
		border-top: 1px solid var(--color-border);
	}
	.cost-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--space-control-gap, 0.5rem);
	}
	.cost-label {
		font-size: var(--text-meta);
		line-height: var(--text-meta--line-height);
		color: var(--color-text-secondary);
	}
	.cost-amount {
		font-size: var(--text-body-compact);
		line-height: var(--text-body-compact--line-height);
		font-variant-numeric: tabular-nums;
	}
	.price-coverage-warning {
		margin: 0;
		font-size: var(--text-meta);
		line-height: var(--text-meta--line-height);
		color: var(--color-warning);
	}
	.card-footer {
		margin-top: auto;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-control-gap, 0.5rem);
		padding-top: var(--space-control-gap, 0.5rem);
	}
	.copy-form {
		display: inline-flex;
	}
	.source-link {
		display: inline-flex;
		align-items: center;
		min-height: var(--target-min, 2.75rem);
		font-size: var(--text-control);
		line-height: var(--text-control--line-height);
		color: var(--color-text-secondary);
	}
	.discovery-pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-page-margin, 1rem);
	}
	.pagination-status {
		font-size: var(--text-meta);
		line-height: var(--text-meta--line-height);
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}
	@media (max-width: 760px) {
		.search-field,
		.mode-field {
			grid-column: auto;
		}
	}
</style>
