<script lang="ts">
	import Avatar from './Avatar.svelte';
	import { getProfileArtwork } from '#lib/profile/artwork.ts';
	import type { ProfileTotals } from '#lib/profile/types.ts';

	let {
		username,
		avatarId,
		artworkId,
		totals
	}: {
		username: string;
		avatarId?: string;
		artworkId?: string;
		totals: ProfileTotals | null;
	} = $props();
	const number = new Intl.NumberFormat('en');
	let artwork = $derived(getProfileArtwork(artworkId));
</script>

<article class="profile-card" aria-label={`Private profile card for ${username}`}>
	<div class="profile-card-name">
		<h2>{username}</h2>
		<Avatar id={avatarId} size={32} />
	</div>
	<img
		class="profile-card-art"
		src={artwork.src}
		alt={artwork.label + ' profile artwork'}
		width="960"
		height="640"
	/>
	<div class="profile-card-type">
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.6"
			aria-hidden="true"
			><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg
		>
		<span>Private profile</span>
	</div>
	{#if totals}
		<dl class="profile-card-totals">
			<div class="primary-stat">
				<dt>Owned copies</dt>
				<dd>{number.format(totals.total)}</dd>
			</div>
			<div class="primary-stat">
				<dt>Card names</dt>
				<dd>{number.format(totals.names)}</dd>
			</div>
			<div>
				<dt>Printings</dt>
				<dd>{number.format(totals.printings)}</dd>
			</div>
			<div>
				<dt>Sets</dt>
				<dd>{number.format(totals.sets)}</dd>
			</div>
			<div>
				<dt>Foil copies</dt>
				<dd>{number.format(totals.foils)}</dd>
			</div>
			<div>
				<dt>Decks</dt>
				<dd>{number.format(totals.decks)}</dd>
			</div>
		</dl>
	{:else}
		<p class="profile-card-unavailable">Stats unavailable</p>
	{/if}
	<div class="profile-card-footer">
		<span>Magic: The Gathering</span><span class="font-display">Spellbook</span>
	</div>
</article>

<style>
	.profile-card {
		width: 100%;
		max-width: 340px;
		padding: 0.65rem;
		border: 1px solid var(--color-border);
		border-radius: 0.875rem;
		background: var(--color-stone);
		box-shadow: 0 12px 30px #0002;
		color: var(--color-text-primary);
	}
	.profile-card-name {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.3rem 0.4rem 0.6rem;
	}
	.profile-card-name h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.375rem;
		font-weight: 400;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}
	.profile-card-art {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 3 / 2;
		object-fit: cover;
		border-radius: 0.375rem;
	}
	.profile-card-type {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.7rem 0.4rem;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}
	.profile-card-totals {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.875rem 1rem;
		margin: 0;
		padding: 0.875rem 0.6rem;
		background: var(--color-slate);
		border-radius: 0.375rem;
	}
	.profile-card-totals dt {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}
	.profile-card-totals dd {
		margin: 0.2rem 0 0;
		font-size: 0.875rem;
		font-variant-numeric: tabular-nums;
	}
	.profile-card-totals .primary-stat dd {
		font-size: 1.75rem;
		line-height: 1.2;
	}
	.profile-card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.7rem 0.35rem 0.15rem;
		color: var(--color-text-secondary);
		font-size: 0.5625rem;
	}
	.profile-card-footer .font-display {
		font-size: 0.875rem;
	}
	.profile-card-unavailable {
		margin: 0;
		padding: 2rem 0.5rem;
		text-align: center;
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
	}
</style>
