<script lang="ts">
	import type { PageProps } from './$types';
	import Button from '#lib/components/ui/button/Button.svelte';
	let { data }: PageProps = $props();
	const sections = [
		{ role: 'commander', label: 'Commander' },
		{ role: 'main', label: 'Main Deck' },
		{ role: 'sideboard', label: 'Sideboard' },
		{ role: 'companion', label: 'Companion' }
	];
</script>

<svelte:head
	><title>Print {data.deck.name} | Spellbook</title><meta
		name="robots"
		content="noindex"
	/></svelte:head
>
<article class="deck-print workspace-container">
	<div class="print-actions">
		<Button onclick={() => window.print()}>Print deck</Button><Button
			href={`/mtg/decks?deck=${data.deck.id}`}
			variant="secondary">Back to deck</Button
		>
		<p>Use your browser's print command to print or save as PDF.</p>
	</div>
	<header>
		<h1>{data.deck.name}</h1>
		<p>{data.deck.format} · {data.cards.reduce((sum, card) => sum + card.quantity, 0)} cards</p>
	</header>
	{#if data.deck.description}<p class="description">{data.deck.description}</p>{/if}
	{#each sections as section}
		{@const cards = data.cards.filter((card) => card.role === section.role)}
		<section aria-label={section.label}>
			<h2>{section.label} · {cards.reduce((sum, card) => sum + card.quantity, 0)}</h2>
			{#if cards.length}<table>
					<thead
						><tr
							><th scope="col">Quantity</th><th scope="col">Card</th><th scope="col">Printing</th
							></tr
						></thead
					><tbody
						>{#each cards as card}<tr
								><td>{card.quantity}</td><td>{card.name}</td><td
									>{card.setCode.toUpperCase()}<br /><small>{card.catalogCardId}</small></td
								></tr
							>{/each}</tbody
					>
				</table>{:else}<p>No cards.</p>{/if}
		</section>
	{/each}
	<section class="tokens" aria-labelledby="tokens-title">
		<h2 id="tokens-title">Supplemental related Tokens</h2>
		<p>Reference appendix only. These Tokens are not Deck entries or quantity requirements.</p>
		{#if data.relatedTokens.items.length}<ul>
				{#each data.relatedTokens.items as token}<li>
						{token.name} · {token.setCode.toUpperCase()}
						{token.collectorNumber}
					</li>{/each}
			</ul>{:else}<p>No resolved Token references.</p>{/if}
		{#if data.relatedTokens.status !== 'available'}<p>
				Some Token references are unavailable.
			</p>{/if}
		{#if data.relatedTokens.unresolved.length}<ul>
				{#each data.relatedTokens.unresolved as token}<li>
						{token.name}, unavailable Printing {token.catalogCardId}
					</li>{/each}
			</ul>{/if}
	</section>
</article>

<style>
	.deck-print {
		max-width: 65rem;
		padding-block: 2rem;
		overflow-wrap: anywhere;
	}
	.print-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 2rem;
	}
	h1 {
		font-size: 2rem;
		font-family: var(--font-display);
	}
	h2 {
		margin-block: 1.5rem 0.5rem;
		font-size: 1.25rem;
	}
	.description {
		white-space: pre-wrap;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		table-layout: fixed;
	}
	th,
	td {
		text-align: left;
		vertical-align: top;
		padding: 0.4rem;
		border-bottom: 1px solid currentColor;
	}
	th:first-child {
		width: 5rem;
	}
	th:last-child {
		width: 35%;
	}
	small {
		font-size: 0.7rem;
	}
	@media print {
		@page {
			margin: 14mm;
			background: white;
		}
		:global(html:has(.deck-print)) {
			color-scheme: light;
		}
		:global(html:has(.deck-print)),
		:global(body:has(.deck-print)),
		:global(body:has(.deck-print) .app-shell) {
			background: white !important;
			color: black !important;
			min-height: 0;
			padding: 0;
		}
		:global(body:has(.deck-print) .app-shell > :not(main)),
		:global(body:has(.deck-print) .app-main > :not(.app-content)),
		:global(body:has(.deck-print) .app-content > :not(.deck-print)),
		.print-actions {
			display: none !important;
		}
		:global(body:has(.deck-print) .app-main),
		:global(body:has(.deck-print) .app-content) {
			display: block;
		}
		.deck-print {
			width: 100%;
			max-width: none;
			padding: 0;
			font-size: 10pt;
		}
		h1 {
			font-size: 18pt;
			line-height: 1.25;
		}
		h2 {
			font-size: 12pt;
		}
		h1,
		h2,
		thead {
			break-after: avoid;
		}
		thead {
			display: table-header-group;
		}
		tr {
			break-inside: avoid;
		}
		p {
			orphans: 3;
			widows: 3;
		}
	}
</style>
