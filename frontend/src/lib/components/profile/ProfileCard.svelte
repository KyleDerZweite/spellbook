<script lang="ts">
	import Avatar from './Avatar.svelte';
	import ProfileCardText from './ProfileCardText.svelte';
	import ProfileFrameRegion from './ProfileFrameRegion.svelte';
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
	let assetPrefix = $derived(
		`/profile/frames/${card.frame === 'gold' ? 'multicolored' : card.frame}${card.legendary ? '-legendary' : ''}`
	);
	let frame = $derived(`${assetPrefix}-spell.webp`);
	let creatureFrame = $derived(`${assetPrefix}-creature.webp`);
</script>

<article class="profile-card" data-frame={card.frame} aria-label={`Profile card for ${username}`}>
	<div class="card-name frame-section">
		<ProfileFrameRegion src={frame} box={[0, 0, 745, 120]} start={56} end={14} />
		<div class="card-name-content frame-content">
			<h2>{card.name || username}</h2>
			{#if validProfileManaCost(card.manaCost)}<ManaCost
					cost={card.manaCost}
					class="card-mana flex-wrap justify-end"
				/>{/if}
		</div>
	</div>
	<div class="card-art-section frame-section">
		<img
			class="card-art"
			src={artwork.src}
			alt={artwork.label + ' profile artwork'}
			width="960"
			height="640"
		/>
		<ProfileFrameRegion src={frame} box={[0, 120, 745, 456]} />
	</div>
	<div class="card-type frame-section">
		<ProfileFrameRegion src={frame} box={[0, 576, 745, 79]} start={18} end={19} />
		<div class="card-type-content frame-content">
			<span>{card.typeLine || 'Collector'}</span><span
				class="rarity"
				data-rarity={card.rarity}
				role="img"
				aria-label={`${rarity?.label ?? 'Unknown'} rarity`}
				><i class="ms ms-rarity" aria-hidden="true"></i></span
			>
		</div>
	</div>
	<div class="card-rules frame-section">
		<ProfileFrameRegion src={frame} box={[0, 655, 745, 270]} />
		<div class="card-rules-content frame-content">
			<ProfileCardText text={card.rulesText} {totals} />
			{#if card.flavorText}<div class="card-flavor">
					<ProfileCardText text={card.flavorText} {totals} />
				</div>{/if}
		</div>
	</div>
	<div class="card-bottom frame-section">
		<ProfileFrameRegion src={frame} box={[0, 925, 745, 115]} start={50} end={40} />
		{#if card.power || card.toughness}<div class="card-stats">
				<ProfileFrameRegion
					src={creatureFrame}
					box={[575, 925, 132, 64]}
					start={12}
					end={12}
					horizontal
				/>
				<div class="card-stats-content frame-content">
					<span>{resolveProfileText(card.power, totals) || '…'}</span><span>/</span><span
						>{resolveProfileText(card.toughness, totals) || '…'}</span
					>
				</div>
			</div>{/if}
		<div class="card-footer frame-content">
			<span class="card-owner"><Avatar id={avatarId} size={14} /><span>@{username}</span></span
			><span class="font-display">Spellbook</span>
		</div>
	</div>
</article>

<style>
	.profile-card {
		width: 100%;
		max-width: 420px;
		color: #191b18;
		container-type: inline-size;
		font-family: var(--font-display);
	}
	.frame-section {
		position: relative;
	}
	.frame-content {
		position: relative;
		z-index: 1;
		min-width: 0;
	}
	.card-name {
		min-height: 16.1074cqw;
		padding: 6.4429cqw 7.7852cqw 2.1477cqw;
	}
	.card-name-content {
		display: flex;
		align-items: flex-start;
		gap: 1.2cqw;
	}
	.card-name h2 {
		flex: 1 1 0;
		min-width: 0;
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1rem, 5cqw, 1.375rem);
		font-weight: 400;
		line-height: 1.15;
		overflow-wrap: anywhere;
	}
	.card-name :global(.card-mana) {
		flex: 0 1 auto;
		max-width: 43%;
		margin-left: auto;
		font-size: clamp(0.75rem, 3.8cqw, 1rem);
	}
	.card-art-section {
		height: 61.2081cqw;
	}
	.card-art {
		position: absolute;
		inset: 0 auto 0 7.7852%;
		display: block;
		width: 84.4295%;
		height: 100%;
		object-fit: contain;
		background: #17201a;
	}
	.card-type {
		min-height: 10.604cqw;
		padding: 2.5503cqw 7.7852cqw 2.1477cqw;
	}
	.card-type-content {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.2cqw;
		font-size: clamp(0.8125rem, 4cqw, 1.05rem);
		line-height: 1.25;
	}
	.card-type-content > span:first-child {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.rarity {
		display: grid;
		place-items: center;
		flex: 0 0 5cqw;
		color: #946b20;
		font-size: 4.8cqw;
		filter: drop-shadow(0 1px 0 #fff9);
	}
	.rarity[data-rarity='common'] {
		color: #292a28;
	}
	.rarity[data-rarity='uncommon'] {
		color: #62656a;
	}
	.rarity[data-rarity='mythic'] {
		color: #a6411a;
	}
	.card-rules {
		min-height: 36.2416cqw;
		padding: 2.5cqw 9cqw 1cqw;
		font-size: clamp(0.875rem, 4.2cqw, 1.125rem);
		line-height: 1.45;
	}
	.card-rules-content {
		display: flex;
		flex-direction: column;
		gap: 3cqw;
	}
	.card-rules :global(.ms) {
		font-size: 0.84em;
	}
	.card-flavor {
		font-style: italic;
	}
	.card-bottom {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		justify-content: flex-end;
		min-height: 15.4362cqw;
		padding: 0.5cqw 5.1cqw 2.3cqw;
	}
	.card-stats {
		position: relative;
		min-width: 17.7181cqw;
		max-width: 90%;
		min-height: 8.5906cqw;
		margin-bottom: 1.5cqw;
		font-size: clamp(0.875rem, 4.3cqw, 1.125rem);
		font-variant-numeric: tabular-nums;
		line-height: 1.25;
	}
	.card-stats-content {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.6cqw;
		padding: 1.9cqw 2cqw;
	}
	.card-stats-content span {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1cqw;
		width: 100%;
		padding-inline: 2.7cqw;
		color: #f1f0e8;
		font-family: var(--font-body);
		font-size: clamp(0.5rem, 2.5cqw, 0.625rem);
		line-height: 1.4;
	}
	.card-owner {
		display: flex;
		align-items: center;
		min-width: 0;
		gap: 0.7cqw;
		overflow-wrap: anywhere;
	}
	.card-footer .font-display {
		font-size: 3.4cqw;
	}
</style>
