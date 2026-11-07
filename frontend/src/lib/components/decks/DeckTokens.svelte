<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import type { DeckRelatedTokens } from '@spellbook/contracts/deck-tokens.ts';
	import type { DeckCard } from '@spellbook/contracts/decks.ts';
	let { tokens, entries }: { tokens: DeckRelatedTokens; entries: DeckCard[] } = $props();
	const items = $derived([
		...new Map(tokens.items.map((token) => [token.catalogCardId, token])).values()
	]);
	function sources(ids: string[]) {
		return [
			...new Set(entries.filter((entry) => ids.includes(entry.id)).map((entry) => entry.name))
		].join(', ');
	}
</script>

<section aria-label={language.t('ui.Related.tokens')} class="tokens">
	<h2>{language.t('ui.Related.tokens')}</h2>
	<p>
		{language.t(
			'ui.Tokens.referenced.by.cards.in.this.Deck.Other.token.interactions.may.not.be.listed'
		)}
	</p>
	{#if tokens.status === 'unavailable'}<p role="status">
			{language.t('ui.Token.source.references.are.unavailable')}
		</p>{:else if tokens.status === 'partial'}<p role="status">
			{language.t('ui.Some.token.source.references.or.artwork.records.are.unavailable')}
		</p>{:else if !items.length && !tokens.unresolved.length}<p>
			{language.t('ui.No.directly.linked.tokens.were.found.in.the.available.source')}
		</p>{/if}
	<div class="token-grid">
		{#each items as token (token.catalogCardId)}
			<article>
				<h3>{token.name}</h3>
				<small>{token.setCode.toUpperCase()} · {token.collectorNumber}</small>
				{#each token.faces as face, index}
					{#if index === 0}
						{#if face.name !== token.name}<h4>{face.name}</h4>{/if}
						{#if face.imageUri || face.imageUriSmall}<img
								src={face.imageUri ?? face.imageUriSmall ?? ''}
								alt={face.name}
								loading="lazy"
								width="244"
								height="340"
							/>{:else}<p>
								{language.t('sentence.Artwork.unavailable.for.p0', { p0: String(face.name) })}
							</p>{/if}
					{:else}<details>
							<summary>{face.name}</summary>{#if face.imageUri || face.imageUriSmall}<img
									src={face.imageUri ?? face.imageUriSmall ?? ''}
									alt={face.name}
									loading="lazy"
									width="244"
									height="340"
								/>{:else}<p>{language.t('ui.Artwork.unavailable')}</p>{/if}
							<p>{face.typeLine}</p>
							<p>{face.oracleText}</p>
						</details>{/if}
				{/each}
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
		font-size: 0.75rem;
	}
	h2 {
		font: 400 1.25rem var(--font-display);
		margin-bottom: 0.5rem;
	}
	h3 {
		font-weight: 500;
	}
	.token-sources {
		font-size: 0.6875rem;
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
