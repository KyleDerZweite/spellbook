<script lang="ts">
	import { getSearchSession } from '#lib/search/session.svelte.ts';
	import { snapshot } from '$app/navigation';
	import LandingBackdrop from './LandingBackdrop.svelte';
	import LandingCommander from './LandingCommander.svelte';
	import SearchBar from '#lib/components/search/SearchBar.svelte';

	const search = getSearchSession();
	let query = $state('');
	snapshot({
		id: 'landing-card-search',
		capture: () => query,
		restore: (value) => (query = value)
	});
</script>

<div class="public-landing backdrop-family">
	<LandingBackdrop action={searchAction} notice={supportNotice} deck={deckCard} />
</div>

{#snippet deckCard()}
	<LandingCommander />
{/snippet}

{#snippet searchAction()}
	<form
		class="landing-search"
		action="/mtg/search"
		method="GET"
		onsubmit={(event) => {
			event.preventDefault();
			search.open(query, event.currentTarget.querySelector('input') ?? undefined);
		}}
		role="search"
		aria-label="Card search"
	>
		<SearchBar
			value={query}
			onInput={(value) => (query = value)}
			name="q"
			placeholder="Search cards..."
			submitLabel="Search cards"
		/>
	</form>
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
		padding: 2rem 2rem 0.5rem;
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
	.landing-search {
		width: min(100%, clamp(320px, 28vw, 480px));
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
