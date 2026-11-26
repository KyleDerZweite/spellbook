<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { SvelteSet } from 'svelte/reactivity';
	import Button from '#lib/components/ui/button/Button.svelte';
	import { cachedCardImage, cardImageSrc } from '#lib/cards/card-image.ts';
	import { printCopies, printPages } from '#lib/decks/print-sheet.ts';
	import { useLanguage } from '#lib/i18n/context.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const language = useLanguage();
	const copies = $derived(printCopies(data.cards));
	const pages = $derived(printPages(copies));
	const settled = new SvelteSet<string>();
	const failed = new SvelteSet<string>();
	const withImage = $derived(copies.filter((copy) => copy.imageUri));
	const loaded = $derived(withImage.filter((copy) => settled.has(copy.key)).length);
	const ready = $derived(loaded === withImage.length);

	/** Settles each slot once its image loaded or failed, including loads finished before hydration. */
	const track =
		(key: string): Attachment<HTMLImageElement> =>
		(image) => {
			const settle = () => {
				if (image.naturalWidth === 0) failed.add(key);
				settled.add(key);
			};
			if (image.complete && image.getAttribute('src')) {
				settle();
				return;
			}
			image.addEventListener('load', settle, { once: true });
			image.addEventListener('error', settle, { once: true });
			return () => {
				image.removeEventListener('load', settle);
				image.removeEventListener('error', settle);
			};
		};
</script>

<svelte:head
	><title>{language.t('ui.Card.sheet')} {data.deck.name} | Spellbook</title><meta
		name="robots"
		content="noindex"
	/></svelte:head
>
<article class="card-sheets print-document workspace-container">
	<div class="print-actions">
		<h1>{data.deck.name}</h1>
		<p>
			{language.t(`cards.${language.plural(copies.length)}`, {
				count: language.number(copies.length)
			})} · {language.t(`printPages.${language.plural(pages.length)}`, {
				count: language.number(pages.length)
			})}
		</p>
		<div class="buttons">
			<Button onclick={() => window.print()} disabled={!ready || !copies.length}
				>{language.t('ui.Print.cards')}</Button
			><Button href={`/mtg/decks?deck=${data.deck.id}`} variant="secondary"
				>{language.t('ui.Back.to.deck')}</Button
			>
		</div>
		{#if copies.length}<p role="status">
				{ready
					? language.t('ui.Card.images.are.ready.to.print')
					: language.t('printSheet.loading', {
							loaded: language.number(loaded),
							total: language.number(withImage.length)
						})}
			</p>{/if}
		{#if failed.size}<p>{language.t('ui.Some.card.images.are.unavailable')}</p>{/if}
		<p>{language.t('ui.Print.on.A4.paper.at.100.scale')}</p>
	</div>
	{#if pages.length}<div class="sheet-list">
			{#each pages as page, index (index)}
				<section
					class="sheet"
					aria-label={language.t('printSheet.pageLabel', {
						page: language.number(index + 1),
						pages: language.number(pages.length)
					})}
				>
					{#each page as copy (copy.key)}
						<div class="card">
							{#if copy.imageUri && !failed.has(copy.key)}<img
									src={cardImageSrc(copy.imageUri)}
									{@attach cachedCardImage(copy.imageUri)}
									alt={copy.name}
									{@attach track(copy.key)}
								/>{:else}<span class="card-name">{copy.name}</span>{/if}
						</div>
					{/each}
				</section>
			{/each}
		</div>{:else}<p>{language.t('ui.No.cards')}</p>{/if}
</article>

<style>
	.card-sheets {
		padding-block: 2rem;
	}
	.print-actions {
		display: grid;
		gap: 0.75rem;
		margin-bottom: 2rem;
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	h1 {
		font-size: 2rem;
		font-family: var(--font-display);
		overflow-wrap: anywhere;
	}
	.sheet-list {
		display: grid;
		justify-items: start;
		gap: 1.5rem;
		overflow-x: auto;
	}
	/*
	 * Each sheet is one physical DIN A4 portrait page (210 × 297 mm): 3 × 3 cards of 63 × 88 mm
	 * with 3 mm gaps, centred by 7.5 mm side and 13.5 mm top and bottom margins. The page itself
	 * has no browser margin, so screen preview and print share this geometry. Nine slots per sheet
	 * must match `cardsPerPrintPage`.
	 */
	.sheet {
		box-sizing: border-box;
		display: grid;
		grid-template-columns: repeat(3, 63mm);
		grid-template-rows: repeat(3, 88mm);
		gap: 3mm;
		width: 210mm;
		height: 297mm;
		padding: 13.5mm 7.5mm;
		overflow: hidden;
		background: white;
		color: black;
		box-shadow: 0 0 0 1px var(--color-border);
	}
	.card {
		box-sizing: border-box;
		width: 63mm;
		height: 88mm;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.card img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.card-name {
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		padding: 4mm;
		border: 0.3mm solid black;
		font-size: 11pt;
		text-align: center;
		overflow-wrap: anywhere;
	}
	@media print {
		@page card-sheet {
			size: A4 portrait;
			margin: 0;
		}
		.card-sheets {
			width: auto;
			max-width: none;
			margin: 0;
			padding: 0;
		}
		.print-actions {
			display: none !important;
		}
		.sheet-list {
			display: block;
			overflow: visible;
		}
		.sheet {
			page: card-sheet;
			box-shadow: none;
			break-inside: avoid;
		}
		.sheet + .sheet {
			break-before: page;
		}
	}
</style>
