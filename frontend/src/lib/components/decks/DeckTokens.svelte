<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import type { DeckRelatedTokens } from '@spellbook/contracts/deck-tokens.ts';
	import type { DeckCard } from '@spellbook/contracts/decks.ts';
	import { cachedCardImage, cardImageSrc } from '#lib/cards/card-image.ts';
	import { enhance, type SubmitFunction } from '$app/forms';
	import Button from '#lib/components/ui/button/Button.svelte';

	let {
		tokens,
		entries,
		deckId,
		autoRefresh = true,
		formAction,
		save,
		busy = false
	}: {
		tokens: DeckRelatedTokens;
		entries: DeckCard[];
		deckId?: string;
		autoRefresh?: boolean;
		formAction?: string;
		save?: SubmitFunction;
		busy?: boolean;
	} = $props();
	let quantityDrafts = $state<Record<string, { base: number; value: number | undefined }>>({});
	const items = $derived([
		...new Map(tokens.items.map((token) => [token.catalogCardId, token])).values()
	]);
	$effect(() => {
		const saved = new Map(items.map((token) => [token.catalogCardId, token.effectiveQuantity]));
		for (const [id, draft] of Object.entries(quantityDrafts)) {
			if (saved.get(id) !== draft.base) delete quantityDrafts[id];
		}
	});

	function sources(ids: string[]) {
		return [
			...new Set(entries.filter((entry) => ids.includes(entry.id)).map((entry) => entry.name))
		].join(', ');
	}
</script>

<section aria-label={language.t('deck.tokens.title')} class="tokens">
	<h2>{language.t('deck.tokens.title')}</h2>
	<p>
		{language.t(
			'ui.Tokens.referenced.by.cards.in.this.Deck.Other.token.interactions.may.not.be.listed'
		)}
	</p>
	<p>{language.t('deck.tokens.estimates')}</p>
	{#if formAction}
		<form method="POST" action={formAction} use:enhance={save} class="token-actions">
			<input type="hidden" name="deckId" value={deckId} />
			<input type="hidden" name="enabled" value={String(!autoRefresh)} />
			<Button
				type="submit"
				name="op"
				value="auto"
				variant="secondary"
				disabled={busy}
				aria-pressed={autoRefresh}
			>
				{language.t('deck.tokens.autoRefresh')}
			</Button>
			<Button type="submit" name="op" value="refresh" variant="secondary" disabled={busy}>
				{language.t('deck.tokens.refresh')}
			</Button>
		</form>
	{/if}
	{#if tokens.status === 'unavailable'}<p role="status">
			{language.t('ui.Token.source.references.are.unavailable')}
		</p>{:else if tokens.status === 'partial'}<p role="status">
			{language.t('ui.Some.token.source.references.or.artwork.records.are.unavailable')}
		</p>{:else if !items.length && !tokens.unresolved.length}<p>
			{language.t('ui.No.directly.linked.tokens.were.found.in.the.available.source')}
		</p>{/if}
	<div class="token-grid">
		{#each items as token (token.catalogCardId)}
			<article class:orphaned={token.suggestedQuantity === 0}>
				<h3>{token.name}</h3>
				<small>{token.setCode.toUpperCase()} · {token.collectorNumber}</small>
				{#each token.faces as face, index}
					{#if index === 0}
						{#if face.name !== token.name}<h4>{face.name}</h4>{/if}
						{#if face.imageUri || face.imageUriSmall}{@const faceUrl =
								face.imageUri ?? face.imageUriSmall ?? ''}<img
								src={cardImageSrc(faceUrl)}
								{@attach cachedCardImage(faceUrl)}
								alt={face.name}
								loading="lazy"
								width="244"
								height="340"
							/>{:else}<p>
								{language.t('sentence.Artwork.unavailable.for.p0', { p0: String(face.name) })}
							</p>{/if}
					{:else}<details>
							<summary>
								{face.name}
							</summary>{#if face.imageUri || face.imageUriSmall}{@const faceUrl =
									face.imageUri ?? face.imageUriSmall ?? ''}<img
									src={cardImageSrc(faceUrl)}
									{@attach cachedCardImage(faceUrl)}
									alt={face.name}
									loading="lazy"
									width="244"
									height="340"
								/>{:else}<p>{language.t('ui.Artwork.unavailable')}</p>{/if}
							<p>{face.typeLine}</p>
							<p>{face.oracleText}</p>
						</details>{/if}
				{/each}
				{#if token.suggestedQuantity === 0}
					<p>{language.t('deck.tokens.orphaned')}</p>
				{/if}
				<p>
					{language.t('deck.tokens.suggested')}
					{token.suggestedQuantity.toLocaleString(language.locale)}
				</p>
				{#if formAction}
					<form method="POST" action={formAction} use:enhance={save} class="token-actions">
						<input type="hidden" name="deckId" value={deckId} />
						<input type="hidden" name="catalogCardId" value={token.catalogCardId} />
						<input type="hidden" name="included" value={String(!token.includeWhenOrphaned)} />
						{#key token.effectiveQuantity}
							<label>
								{language.t('ui.Quantity')}
								<input
									type="number"
									name="quantity"
									min="0"
									max="2147483647"
									step="1"
									required
									bind:value={
										() =>
											quantityDrafts[token.catalogCardId]?.base === token.effectiveQuantity
												? quantityDrafts[token.catalogCardId].value
												: token.effectiveQuantity,
										(value) => {
											quantityDrafts[token.catalogCardId] = {
												base: token.effectiveQuantity,
												value
											};
										}
									}
									disabled={busy}
								/>
							</label>
						{/key}
						<Button type="submit" name="op" value="quantity" variant="secondary" disabled={busy}>
							{language.t('deck.tokens.saveQuantity')}
						</Button>
						{#if token.userDelta !== 0}
							<Button
								type="submit"
								name="op"
								value="reset"
								variant="secondary"
								disabled={busy}
								formnovalidate
							>
								{language.t('deck.tokens.reset')}
							</Button>
						{/if}
						{#if token.suggestedQuantity === 0}
							<Button
								type="submit"
								name="op"
								value="include"
								variant="secondary"
								disabled={busy}
								formnovalidate
								aria-pressed={token.includeWhenOrphaned}
							>
								{language.t('deck.tokens.include')}
							</Button>
							<Button
								type="submit"
								name="op"
								value="remove"
								variant="secondary"
								disabled={busy}
								formnovalidate
							>
								{language.t('deck.tokens.remove')}
							</Button>
						{/if}
					</form>
				{/if}
				{#if sources(token.sourceEntryIds)}<details class="token-sources">
						<summary>{language.t('ui.Referenced.by')}</summary>
						<p>{sources(token.sourceEntryIds)}</p>
					</details>{/if}
			</article>
		{/each}
	</div>
	{#if tokens.unresolved.length}<ul>
			{#each tokens.unresolved as token}<li>
					{token.name}{language.t('ui.Token.record.unavailable')}{#if sources(token.sourceEntryIds)}
						{language.t('ui.Referenced.by')} {sources(token.sourceEntryIds)}.{/if}
				</li>{/each}
		</ul>{/if}
</section>

<style>
	.tokens {
		margin-top: 2rem;
		border-top: 1px solid var(--color-border);
		padding-top: 1rem;
	}
	.tokens > p,
	article p,
	small {
		color: var(--color-text-secondary);
		font-size: var(--text-meta);
		line-height: var(--text-meta--line-height);
	}
	h2 {
		font-family: var(--font-display);
		font-size: var(--text-section-title);
		line-height: var(--text-section-title--line-height);
		font-weight: 400;
		margin-bottom: 0.5rem;
	}
	h3 {
		font-weight: 500;
	}
	.token-sources {
		font-size: var(--text-meta);
		line-height: var(--text-meta--line-height);
		color: var(--color-text-secondary);
	}
	.token-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
		gap: 1rem;
		margin-top: 1rem;
	}
	article {
		min-width: 0;
	}
	.orphaned img {
		filter: grayscale(1);
		opacity: 0.55;
	}
	.orphaned h3 {
		color: var(--color-text-secondary);
	}
	.token-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: end;
	}
	.token-actions :global(button) {
		max-width: 100%;
		white-space: normal;
	}
	.token-actions label {
		display: grid;
		gap: 0.25rem;
	}
	.token-actions input[type='number'] {
		width: 8rem;
		border: 1px solid var(--color-border);
		padding: 0.25rem;
	}
	img {
		max-width: 100%;
		height: auto;
		border-radius: 0.5rem;
	}
	summary {
		cursor: pointer;
		padding: 0.5rem 0;
	}
</style>
