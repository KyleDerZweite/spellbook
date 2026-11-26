<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import type {
		MissingCardsExportResponse,
		MissingExportFormat,
		MissingExportMode
	} from '@spellbook/contracts/decks.ts';
	import {
		buildBulkEbaySearchUrl,
		fetchMissingCardsExport,
		missingExportFilename
	} from '#lib/decks/missing-export.ts';
	import DeckDialog from './DeckDialog.svelte';
	import Button from '#lib/components/ui/button/Button.svelte';

	let {
		open = $bindable(false),
		deckIds,
		returnFocus = null
	}: {
		open?: boolean;
		deckIds: string[];
		returnFocus?: HTMLElement | null;
	} = $props();

	let shareAcrossDecks = $state(false);
	let includePrinting = $state(false);
	let format = $state<MissingExportFormat>('cardmarket');
	let loading = $state(false);
	let error = $state('');
	let result = $state<MissingCardsExportResponse | null>(null);
	let copyStatus = $state('');

	const mode = $derived<MissingExportMode>(shareAcrossDecks ? 'max' : 'sum');
	const activeText = $derived(result ? result.exports[format] : '');
	const bulkHint = $derived(
		result && result.bulkHintEligible
			? buildBulkEbaySearchUrl(
					language.locale,
					result.missingBasicLandCopies,
					result.missingBudgetCardCopies
				)
			: null
	);
	const deckNamesSummary = $derived.by(() => {
		if (!result || !result.decks.length) return '';
		const names = result.decks.map((d) => d.name);
		const display =
			names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
		return language.t(`missingExport.decksIncluded.${language.plural(names.length)}`, {
			count: language.number(names.length),
			names: display
		});
	});

	$effect(() => {
		if (!open || !deckIds.length) return;
		const ids = [...deckIds];
		const currentMode = mode;
		const currentPrinting = includePrinting;
		const controller = new AbortController();
		loading = true;
		error = '';
		copyStatus = '';
		void fetchMissingCardsExport(
			{ deckIds: ids, mode: currentMode, includePrinting: currentPrinting },
			controller.signal
		)
			.then((data) => {
				if (controller.signal.aborted) return;
				result = data;
			})
			.catch((cause) => {
				if (controller.signal.aborted) return;
				result = null;
				error =
					cause instanceof Error && cause.message
						? language.message(cause.message)
						: language.t('missingExport.error');
			})
			.finally(() => {
				if (!controller.signal.aborted) loading = false;
			});
		return () => controller.abort();
	});

	async function copyText() {
		if (!activeText) return;
		copyStatus = '';
		try {
			await navigator.clipboard.writeText(activeText);
			copyStatus = language.t('missingExport.copied');
		} catch {
			copyStatus = language.t('missingExport.copyFailed');
		}
	}

	function downloadText() {
		if (!activeText || !result) return;
		const blob = new Blob([activeText], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = missingExportFilename(
			format,
			result.decks.map((d) => d.name)
		);
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(url);
	}
</script>

<DeckDialog
	title={language.t('missingExport.title')}
	description={language.t('missingExport.description')}
	variant="import"
	{returnFocus}
	bind:open
>
	<div class="missing-export">
		{#if deckNamesSummary}
			<p class="deck-scope muted">{deckNamesSummary}</p>
		{/if}

		<div class="options">
			{#if deckIds.length > 1}
				<label class="option-toggle">
					<input type="checkbox" bind:checked={shareAcrossDecks} />
					<span>
						<strong>{language.t('missingExport.shareAcrossDecks')}</strong>
						<small class="muted">{language.t('missingExport.shareAcrossDecksHelp')}</small>
					</span>
				</label>
			{/if}
			<label class="option-toggle">
				<input type="checkbox" bind:checked={includePrinting} />
				<span>
					<strong>{language.t('missingExport.includePrinting')}</strong>
					<small class="muted">{language.t('missingExport.includePrintingHelp')}</small>
				</span>
			</label>
		</div>

		<div class="format-tabs" role="group" aria-label={language.t('missingExport.formatLabel')}>
			{#each ['cardmarket', 'tcgplayer', 'text'] as const as tab}
				<Button
					variant={format === tab ? 'default' : 'secondary'}
					aria-pressed={format === tab}
					onclick={() => {
						format = tab;
						copyStatus = '';
					}}
				>
					{language.t(`missingExport.format.${tab}`)}
				</Button>
			{/each}
		</div>

		{#if loading}
			<p role="status" class="muted">{language.t('missingExport.loading')}</p>
		{:else if error}
			<p role="alert" class="error-text">{error}</p>
		{:else if result}
			{#if result.totalMissingCopies === 0}
				<p role="status" class="empty-note">{language.t('missingExport.noneMissing')}</p>
			{:else}
				<p class="summary-line">
					{language.t('missingExport.summary', {
						copies: language.number(result.totalMissingCopies),
						unique: language.number(result.uniqueMissingCards)
					})}
				</p>

				{#if format === 'cardmarket' && includePrinting}
					<p class="muted">{language.t('missingExport.cardmarketSetOnlyNote')}</p>
				{/if}

				<textarea
					class="input export-output"
					rows="10"
					readonly
					aria-label={language.t('missingExport.outputLabel')}
					value={activeText}></textarea>

				<div class="export-actions">
					<Button variant="default" onclick={copyText}>{language.t('missingExport.copy')}</Button>
					<Button variant="secondary" onclick={downloadText}>
						{language.t('missingExport.download')}
					</Button>
					{#if copyStatus}
						<span role="status" class="muted copy-status">{copyStatus}</span>
					{/if}
				</div>

				{#if bulkHint}
					<aside class="bulk-hint" aria-label={language.t('missingExport.bulkHintBadge')}>
						<span class="bulk-badge">{language.t('missingExport.bulkHintBadge')}</span>
						<p class="muted">
							{#if bulkHint.reason === 'both'}
								{language.t('missingExport.bulkHintBoth', {
									lands: language.number(result.missingBasicLandCopies),
									budget: language.number(result.missingBudgetCardCopies)
								})}
							{:else if bulkHint.reason === 'basic_lands'}
								{language.t('missingExport.bulkHintLands', {
									lands: language.number(result.missingBasicLandCopies)
								})}
							{:else}
								{language.t('missingExport.bulkHintBudget', {
									budget: language.number(result.missingBudgetCardCopies)
								})}
							{/if}
						</p>
						<a class="bulk-link" href={bulkHint.url} target="_blank" rel="noopener noreferrer">
							{language.t('missingExport.bulkHintLink', { domain: bulkHint.domain })}
							<svg
								aria-hidden="true"
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.8"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
								<polyline points="15 3 21 3 21 9" />
								<line x1="10" y1="14" x2="21" y2="3" />
							</svg>
						</a>
					</aside>
				{/if}
			{/if}
		{/if}
	</div>
</DeckDialog>

<style>
	.missing-export {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}
	.deck-scope {
		margin: 0;
	}
	.options {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}
	.option-toggle {
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
		cursor: pointer;
		font-size: 0.8125rem;
	}
	.option-toggle input {
		margin-top: 0.2rem;
		flex: 0 0 auto;
	}
	.option-toggle span {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}
	.option-toggle strong {
		font-weight: 500;
	}
	.format-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.summary-line {
		margin: 0;
		font-size: 0.8125rem;
		font-weight: 500;
	}
	.export-output {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		line-height: 1.5;
		resize: vertical;
	}
	.export-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.copy-status {
		margin-left: 0.25rem;
	}
	.empty-note {
		padding: 1rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		font-size: 0.875rem;
		margin: 0;
	}
	.error-text {
		color: var(--color-danger, var(--color-warning));
		font-size: 0.8125rem;
		margin: 0;
	}
	.muted {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}
	.bulk-hint {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 0.75rem 0.875rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-surface);
	}
	.bulk-hint p {
		margin: 0;
	}
	.bulk-badge {
		align-self: flex-start;
		font-size: 0.6875rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
	}
	.bulk-link {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.8125rem;
		font-weight: 500;
		width: fit-content;
	}
</style>
