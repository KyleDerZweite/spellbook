<script lang="ts">
	import LandingBackdrop from './LandingBackdrop.svelte';
	import LandingCommander from './LandingCommander.svelte';
</script>

<div class="public-landing backdrop-family">
	<LandingBackdrop action={searchAction} notice={supportNotice} deck={deckCard} />
</div>

{#snippet deckCard()}
	<LandingCommander />
{/snippet}

{#snippet arrow()}
	<svg
		aria-hidden="true"
		width="18"
		height="18"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.6"
		stroke-linecap="round"
		stroke-linejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg
	>
{/snippet}
{#snippet searchAction()}
	<div class="landing-actions">
		<a class="btn btn-primary search-action" href="/mtg/search">Search cards {@render arrow()}</a>
		<button class="btn btn-ghost app-action" type="button" disabled>
			<svg
				aria-hidden="true"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="round"
				stroke-linejoin="round"
				><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></svg
			>
			App coming soon
		</button>
	</div>
{/snippet}
{#snippet supportNotice()}
	<p class="support-note">
		<i class="ms ms-planeswalker" aria-hidden="true"></i>Magic: The Gathering only for now.
	</p>
{/snippet}

<style>
	.public-landing {
		--landing-heading-weight: 400;
		--landing-deck-width: clamp(324px, 15vw, 384px);
		--landing-card-width: clamp(147px, 7vw, 180px);
		font-family: var(--font-body);
		display: flex;
		flex: 1;
		flex-direction: column;
		width: 100%;
		max-width: var(--layout-wide-width);
		margin: auto;
		padding: 2rem;
	}
	.backdrop-family {
		--backdrop-inset: 2rem;
		max-width: var(--layout-wide-width);
		padding-inline: var(--backdrop-inset);
	}
	.public-landing :global(h1) {
		font-weight: var(--landing-heading-weight, 500);
		font-synthesis: none;
	}
	.landing-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.search-action {
		gap: 1rem;
		min-height: 44px;
		padding-inline: 1rem;
		font-size: 0.875rem;
	}
	.app-action {
		min-height: 44px;
		gap: 0.5rem;
		padding-inline: 0.625rem;
		color: var(--color-text-secondary);
		font-size: 0.8125rem;
		opacity: 1;
	}
	.support-note {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: fit-content;
		max-width: 100%;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		background: var(--color-surface);
		border-radius: 0.375rem;
		padding: 0.625rem 0.75rem;
		margin-top: 1rem;
		line-height: 1.5;
	}
	.support-note i {
		color: var(--color-warning);
		font-size: 0.9rem;
		flex-shrink: 0;
	}
	@media (max-width: 1000px) {
		.public-landing {
			padding: 1.5rem;
		}
	}
	@media (max-width: 1100px) {
		.backdrop-family {
			--backdrop-inset: 1rem;
			padding-inline: var(--backdrop-inset);
		}
	}
	@media (max-width: 760px) {
		.public-landing {
			padding: 1.25rem 1rem 2rem;
		}
	}
	@media (max-width: 700px) {
		.backdrop-family {
			--backdrop-inset: 0.75rem;
			padding-inline: var(--backdrop-inset);
		}
	}
</style>
