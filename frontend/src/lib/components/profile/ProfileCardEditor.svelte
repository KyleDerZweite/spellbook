<script lang="ts">
	import Select from '#lib/components/ui/select/Select.svelte';
	import ProfileTextField from './ProfileTextField.svelte';
	import ArtworkPicker from './ArtworkPicker.svelte';
	import {
		PROFILE_CARD_FRAMES,
		PROFILE_CARD_RARITIES,
		PROFILE_CARD_LIMITS,
		type ProfileCardDefinition,
		type ProfileCardErrors
	} from '#lib/profile/card.ts';
	import type { ProfileTotals } from '#lib/profile/types.ts';
	let {
		card = $bindable(),
		artworkId = $bindable(),
		disabled = false,
		errors = {},
		totals
	}: {
		card: ProfileCardDefinition;
		artworkId: string;
		disabled?: boolean;
		errors?: ProfileCardErrors;
		totals: ProfileTotals | null;
	} = $props();
</script>

<input type="hidden" name="template" value="mtg" />
<div class="editor-fields">
	<div class="field-row">
		<div>
			<label class="label" for="card-name">Name</label><input
				class="input"
				id="card-name"
				name="name"
				bind:value={card.name}
				required
				maxlength={PROFILE_CARD_LIMITS.name}
				{disabled}
				aria-invalid={!!errors.name}
				aria-describedby="card-name-error"
			/>
			<p class="field-count">{card.name.length}/{PROFILE_CARD_LIMITS.name}</p>
			<p id="card-name-error" class="field-error">{errors.name ?? ''}</p>
		</div>
		<div>
			<label class="label" for="card-mana">Mana cost</label><input
				class="input"
				id="card-mana"
				name="manaCost"
				bind:value={card.manaCost}
				maxlength={PROFILE_CARD_LIMITS.manaCost}
				{disabled}
				aria-invalid={!!errors.manaCost}
				aria-describedby="card-mana-help card-mana-error"
			/>
			<p id="card-mana-help" class="field-help">{'Up to 8 symbols: {2}{U}, {W/U}, {G/P}'}</p>
			<p id="card-mana-error" class="field-error">{errors.manaCost ?? ''}</p>
		</div>
	</div>
	<div class="field-row">
		<div>
			<label class="label" for="card-frame">Frame</label><Select
				id="card-frame"
				name="frame"
				label="Frame color"
				options={[...PROFILE_CARD_FRAMES]}
				bind:value={card.frame}
				{disabled}
			/>
			<p class="field-error">{errors.frame ?? ''}</p>
		</div>
		<div>
			<label class="label" for="card-rarity">Rarity</label><Select
				id="card-rarity"
				name="rarity"
				label="Rarity"
				options={[...PROFILE_CARD_RARITIES]}
				bind:value={card.rarity}
				{disabled}
			/>
			<p class="field-error">{errors.rarity ?? ''}</p>
		</div>
	</div>
	<label class="legendary-control"
		><input type="checkbox" name="legendary" bind:checked={card.legendary} {disabled} /> Legendary frame</label
	>
	<ArtworkPicker bind:selected={artworkId} {disabled} compact />
	<div>
		<label class="label" for="card-type">Type line</label><input
			class="input"
			id="card-type"
			name="typeLine"
			bind:value={card.typeLine}
			required
			maxlength={PROFILE_CARD_LIMITS.typeLine}
			{disabled}
			aria-invalid={!!errors.typeLine}
			aria-describedby="card-type-error"
		/>
		<p class="field-count">{card.typeLine.length}/{PROFILE_CARD_LIMITS.typeLine}</p>
		<p id="card-type-error" class="field-error">{errors.typeLine ?? ''}</p>
	</div>
	<ProfileTextField
		name="rulesText"
		label="Rules text"
		bind:value={card.rulesText}
		multiline
		rows={4}
		limit={PROFILE_CARD_LIMITS.rulesText}
		{disabled}
		error={errors.rulesText}
		{totals}
		help={'KPIs update from your collection. Mana and action symbols use braces: {G}, {T}, {Q}, {E}.'}
	/>
	<ProfileTextField
		name="flavorText"
		label="Flavor text"
		bind:value={card.flavorText}
		multiline
		rows={2}
		limit={PROFILE_CARD_LIMITS.flavorText}
		{disabled}
		error={errors.flavorText}
		{totals}
	/>
	<div class="field-row">
		<ProfileTextField
			name="power"
			label="Power"
			bind:value={card.power}
			limit={PROFILE_CARD_LIMITS.power}
			{disabled}
			error={errors.power}
			{totals}
			help="Number, *, X or KPI. Fill both or leave both empty."
		/>
		<ProfileTextField
			name="toughness"
			label="Toughness"
			bind:value={card.toughness}
			limit={PROFILE_CARD_LIMITS.toughness}
			{disabled}
			error={errors.toughness}
			{totals}
			help="Number, *, X or KPI. Fill both or leave both empty."
		/>
	</div>
	{#if errors.form || errors.template || errors.legendary}<p class="field-error" role="alert">
			{errors.form ?? errors.template ?? errors.legendary}
		</p>{/if}
</div>

<style>
	.editor-fields {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-width: 0;
	}
	.field-row {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}
	.field-row > div {
		min-width: 0;
	}
	.legendary-control {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		width: fit-content;
	}
	.legendary-control input {
		width: 16px;
		height: 16px;
		accent-color: var(--color-text-primary);
	}
	.field-help {
		margin: 0.35rem 0 0;
		color: var(--color-text-muted);
		font-size: 0.6875rem;
		line-height: 1.5;
	}
	.field-count {
		margin: 0.35rem 0 0;
		color: var(--color-text-muted);
		text-align: right;
		font-size: 0.6875rem;
		font-variant-numeric: tabular-nums;
	}
	.field-error {
		margin: 0.3rem 0 0;
		color: var(--color-error);
		font-size: 0.75rem;
	}
	.field-error:empty {
		display: none;
	}
	@media (max-width: 420px) {
		.field-row {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.75rem;
		}
	}
</style>
