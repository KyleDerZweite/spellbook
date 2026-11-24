<script lang="ts">
	import { enhance } from '$app/forms';
	import { useLanguage } from '#lib/i18n/context.ts';
	import type { PageProps } from './$types';

	const language = useLanguage();
	let { data, form }: PageProps = $props();

	const colors = [
		['white', 'color.White'],
		['blue', 'color.Blue'],
		['black', 'color.Black'],
		['red', 'color.Red'],
		['green', 'color.Green'],
		['multicolor', 'color.Multicolor'],
		['colorless', 'color.Colorless']
	] as const;
	const rarities = ['common', 'uncommon', 'rare', 'mythic', 'special', 'bonus'] as const;
</script>

<svelte:head><title>{language.t('physicalBoxes.title')} | Spellbook</title></svelte:head>
<div class="page-title"><h1>{language.t('physicalBoxes.title')}</h1></div>
<form use:enhance method="POST" action="?/create">
	<input
		type="hidden"
		name="requestId"
		value={form?.intent === 'create' ? form.requestId : data.requestId}
	/>
	<label for="new-box-name">{language.t('ui.Name')}</label>
	<input
		id="new-box-name"
		name="name"
		required
		maxlength="64"
		value={form?.intent === 'create' ? form.name : ''}
	/>
	<button type="submit">{language.t('physicalBoxes.create')}</button>
	{#if form?.intent === 'create'}
		<p role="alert">
			{language.t(
				form.conflict
					? 'physicalBoxes.createConflict'
					: form.validation
						? 'physicalBoxes.nameError'
						: 'ui.Could.not.save.Try.again'
			)}
		</p>
	{/if}
</form>

{#if data.boxes.length === 0}
	<p>{language.t('physicalBoxes.empty')}</p>
{/if}
{#each data.boxes as box (box.id)}
	{@const conditionError = form?.intent === 'condition' && form.id === box.id ? form : null}
	{@const renameError = form?.intent === 'rename' && form.id === box.id ? form : null}
	{@const printedColor =
		conditionError?.printedColor ??
		box.condition?.find(({ field }) => field === 'printedColor')?.oneOf ??
		[]}
	{@const rarity =
		conditionError?.rarity ?? box.condition?.find(({ field }) => field === 'rarity')?.oneOf ?? []}
	{@const setCodes =
		conditionError?.setCodes ??
		box.condition?.find(({ field }) => field === 'setCode')?.oneOf.join(', ') ??
		''}
	<section aria-labelledby={`box-${box.id}`}>
		<h2 id={`box-${box.id}`}>{box.name}</h2>
		<a href={`/settings/physical-boxes/${box.id}/label.svg`} download>
			{language.t('physicalBoxes.label')}
		</a>
		<form use:enhance method="POST" action="?/rename">
			<input type="hidden" name="id" value={box.id} />
			<label for={`name-${box.id}`}>{language.t('ui.Name')}</label>
			<input
				id={`name-${box.id}`}
				name="name"
				required
				maxlength="64"
				value={renameError?.name ?? box.name}
			/>
			<button type="submit">{language.t('ui.Rename')}</button>
			{#if renameError}<p role="alert">
					{language.t(
						renameError.validation ? 'physicalBoxes.nameError' : 'ui.Could.not.save.Try.again'
					)}
				</p>{/if}
		</form>
		<form use:enhance method="POST" action="?/condition">
			<input type="hidden" name="id" value={box.id} />
			<h3>{language.t('physicalBoxes.condition')}</h3>
			<p>{language.t('physicalBoxes.conditionHelp')}</p>
			<fieldset>
				<legend>{language.t('physicalBoxes.printedColor')}</legend>
				{#each colors as [value, key] (value)}
					<label
						><input
							type="checkbox"
							name="printedColor"
							{value}
							checked={printedColor.includes(value)}
						/>
						{language.t(key)}</label
					>
				{/each}
			</fieldset>
			<fieldset>
				<legend>{language.t('ui.Rarity')}</legend>
				{#each rarities as value (value)}
					<label
						><input type="checkbox" name="rarity" {value} checked={rarity.includes(value)} />
						{language.t(`rarity.${value}`)}</label
					>
				{/each}
			</fieldset>
			<label for={`set-${box.id}`}>{language.t('physicalBoxes.setCodes')}</label>
			<input id={`set-${box.id}`} name="setCode" value={setCodes} />
			<div class="buttons">
				<button type="submit">{language.t('ui.Save')}</button>
				<button type="submit" name="clear" value="1">{language.t('physicalBoxes.clear')}</button>
			</div>
			{#if conditionError}<p role="alert">
					{language.t(
						conditionError.validation
							? 'physicalBoxes.conditionError'
							: 'ui.Could.not.save.Try.again'
					)}
				</p>{/if}
		</form>
	</section>
{/each}

<style>
	section {
		margin-block: 1.5rem;
		padding-block: 1rem;
		border-top: 1px solid var(--color-text-secondary);
	}
	h2,
	h3 {
		font-weight: 600;
	}
	a {
		text-decoration: underline;
	}
	form {
		display: grid;
		gap: 0.5rem;
		justify-items: start;
		margin-block: 1rem;
	}
	fieldset {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
	}
	fieldset label {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		min-height: 32px;
	}
	input:not([type='checkbox'], [type='hidden']),
	button {
		min-height: 44px;
		max-width: 100%;
		border: 1px solid var(--color-text-secondary);
		border-radius: 0.25rem;
		padding: 0.25rem 0.5rem;
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
