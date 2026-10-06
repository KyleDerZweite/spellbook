<script lang="ts">
	import Avatar from './Avatar.svelte';
	import ProfileCardText from './ProfileCardText.svelte';
	import ManaCost from '#lib/components/cards/ManaCost.svelte';
	import { getProfileArtwork } from '#lib/profile/artwork.ts';
	import {
		defaultProfileCard,
		resolveProfileText,
		validProfileManaCost,
		PROFILE_CARD_RARITIES,
		type ProfileCardDefinition
	} from '#lib/profile/card.ts';
	import type { ProfileTotals } from '#lib/profile/types.ts';
	let {
		username,
		avatarId,
		artworkId,
		totals,
		definition
	}: {
		username: string;
		avatarId?: string;
		artworkId?: string;
		totals: ProfileTotals | null;
		definition?: ProfileCardDefinition;
	} = $props();
	let artwork = $derived(getProfileArtwork(artworkId));
	let card = $derived(definition ?? defaultProfileCard(username));
	let rarity = $derived(PROFILE_CARD_RARITIES.find((r) => r.value === card.rarity));
</script>

<article
	class="profile-card"
	class:legendary={card.legendary}
	data-frame={card.frame}
	aria-label={`Profile card for ${username}`}
>
	<div class="profile-card-frame">
		<div class="card-name">
			<h2>{card.name || username}</h2>
			{#if validProfileManaCost(card.manaCost)}<ManaCost
					cost={card.manaCost}
					class="card-mana flex-wrap justify-end"
				/>{/if}
		</div>
		<img
			class="card-art"
			src={artwork.src}
			alt={artwork.label + ' profile artwork'}
			width="960"
			height="640"
		/>
		<div class="card-type">
			<span>{card.typeLine || 'Collector'}</span><span
				class="rarity"
				data-rarity={card.rarity}
				role="img"
				aria-label={`${rarity?.label ?? 'Unknown'} rarity`}
				><i class="ms ms-rarity" aria-hidden="true"></i></span
			>
		</div>
		<div class="card-rules">
			<ProfileCardText text={card.rulesText} {totals} />
			{#if card.flavorText}<div class="card-flavor">
					<ProfileCardText text={card.flavorText} {totals} />
				</div>{/if}
			{#if card.power || card.toughness}<div class="card-stats">
					<span>{resolveProfileText(card.power, totals) || '…'}</span><span>/</span><span
						>{resolveProfileText(card.toughness, totals) || '…'}</span
					>
				</div>{/if}
		</div>
		<div class="card-footer">
			<span class="card-owner"><Avatar id={avatarId} size={18} /><span>@{username}</span></span
			><span class="font-display">Spellbook</span>
		</div>
	</div>
</article>

<style>
	.profile-card {
		--frame-dark: #264535;
		--frame-light: #829178;
		--paper: #e8ebda;
		width: 100%;
		max-width: 420px;
		padding: 12px;
		color: #201d19;
		border-radius: 20px;
		background: #101111;
		container-type: inline-size;
	}
	.profile-card[data-frame='white'] {
		--frame-dark: #8e815e;
		--frame-light: #ded2ac;
		--paper: #f3eddc;
	}
	.profile-card[data-frame='blue'] {
		--frame-dark: #244962;
		--frame-light: #88a8b5;
		--paper: #e4edf1;
	}
	.profile-card[data-frame='black'] {
		--frame-dark: #2b2633;
		--frame-light: #817582;
		--paper: #e4dfe5;
	}
	.profile-card[data-frame='red'] {
		--frame-dark: #78382c;
		--frame-light: #cf9070;
		--paper: #f3e4da;
	}
	.profile-card[data-frame='gold'] {
		--frame-dark: #796031;
		--frame-light: #c8b57e;
		--paper: #f2e9d2;
	}
	.profile-card[data-frame='colorless'] {
		--frame-dark: #4b5758;
		--frame-light: #a4b5b4;
		--paper: #e6e8e3;
	}
	.profile-card-frame {
		position: relative;
		display: flex;
		flex-direction: column;
		padding: 10px 8px 5px;
		min-height: 140cqw;
		border-radius: 12px 12px 6px 6px;
		border: 1px solid #101111;
		background: linear-gradient(
			110deg,
			var(--frame-dark),
			var(--frame-light) 34%,
			var(--frame-dark) 72%,
			var(--frame-light)
		);
	}
	.legendary .profile-card-frame {
		padding-top: 18px;
	}
	.legendary .profile-card-frame::before {
		content: '';
		position: absolute;
		top: 5px;
		left: 24%;
		right: 24%;
		height: 13px;
		border: 2px solid var(--paper);
		border-bottom: 0;
		border-radius: 50% 50% 0 0;
		box-shadow: 0 -2px 0 #141615;
	}
	.card-name,
	.card-type {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		padding: 5px 8px;
		background: var(--paper);
		border: 2px solid #252824;
		box-shadow: inset 0 1px 0 #fff9;
	}
	.card-name {
		position: relative;
		justify-content: space-between;
		flex-wrap: wrap;
		border-radius: 12px 12px 5px 5px;
	}
	.card-name h2 {
		flex: 1 1 8rem;
		min-width: 0;
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.125rem, 6cqw, 1.6rem);
		font-weight: 400;
		line-height: 1.15;
		overflow-wrap: anywhere;
	}
	.card-name :global(.card-mana) {
		max-width: 100%;
		margin-left: auto;
		font-size: clamp(0.875rem, 4.2cqw, 1.125rem);
	}
	.card-art {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 3 / 2;
		object-fit: contain;
		border: 2px solid #202720;
		border-top: 0;
		border-bottom: 0;
	}
	.card-type {
		justify-content: space-between;
		margin-inline: -2px;
		border-radius: 7px;
		font-family: var(--font-display);
		font-size: clamp(0.875rem, 4cqw, 1.05rem);
		line-height: 1.25;
	}
	.card-type > span:first-child {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.rarity {
		display: grid;
		place-items: center;
		width: 20px;
		height: 22px;
		flex-shrink: 0;
		color: #9c772d;
		font-size: 19px;
		filter: drop-shadow(0 1px 0 #fff9);
	}
	.rarity[data-rarity='common'] {
		color: #292a28;
	}
	.rarity[data-rarity='uncommon'] {
		color: #74777d;
	}
	.rarity[data-rarity='mythic'] {
		color: #ba4f24;
	}
	.card-rules {
		display: flex;
		flex: 1 0 auto;
		flex-direction: column;
		gap: 0.75rem;
		min-height: 145px;
		padding: 13px 10px 9px;
		border: 2px solid #252824;
		border-top: 0;
		background: var(--paper);
		font-family: var(--font-display);
		font-size: clamp(0.9375rem, 4.35cqw, 1.125rem);
		line-height: 1.4;
	}
	.card-rules :global(.ms) {
		font-size: 0.84em;
	}
	.card-flavor {
		font-style: italic;
	}
	.card-stats {
		display: flex;
		flex-wrap: wrap;
		align-self: flex-end;
		justify-content: flex-end;
		gap: 0.3rem;
		max-width: 100%;
		margin-top: auto;
		padding: 2px 10px;
		border: 2px solid #40463c;
		border-radius: 8px 3px 8px 3px;
		background: var(--paper);
		box-shadow: inset 0 1px 0 #fff9;
		font-size: 1.1em;
		font-variant-numeric: tabular-nums;
	}
	.card-stats span {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 4px;
		padding: 4px 5px;
		border-radius: 0 0 3px 3px;
		background: #1c211d;
		color: #f1f0e8;
		font-size: 10px;
	}
	.card-owner {
		display: flex;
		align-items: center;
		min-width: 0;
		gap: 0.4rem;
		overflow-wrap: anywhere;
	}
	.card-footer .font-display {
		font-size: 15px;
	}
</style>
