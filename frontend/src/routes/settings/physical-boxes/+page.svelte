<script lang="ts">
	import { demoSaveError } from '#lib/demo/conflict.ts';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { updateDemo } from '#lib/demo/storage.ts';
	import { changePhysicalBoxes } from '#lib/demo/physical-boxes.ts';
	import { ValidationError } from '@spellbook/contracts/validation.ts';
	import { invalidate, invalidateAll } from '$app/navigation';
	import { useLanguage } from '#lib/i18n/context.ts';
	import type { PhysicalBox } from '@spellbook/contracts/physical-boxes.ts';
	import type { PageProps } from './$types';

	const language = useLanguage();
	let { data, form }: PageProps = $props();

	let pending = $state(false);
	let localError = $state<
		'physicalBoxes.nameError' | 'physicalBoxes.conditionError' | ReturnType<typeof demoSaveError>
	>();
	async function saveLocally(event: SubmitEvent) {
		const session = page.data.demoSession;
		if (!session) return;
		event.preventDefault();
		if (pending) return;
		const target = event.currentTarget as HTMLFormElement;
		const intent = new URL(target.action).search.slice(2);
		const values = new FormData(target, event.submitter);
		pending = true;
		localError = undefined;
		try {
			await updateDemo(
				session,
				'physical-boxes',
				data.seedBoxes,
				(boxes) => changePhysicalBoxes(boxes, intent, values),
				{ generation: page.data.demoWriteGeneration }
			);
			if (intent === 'create') target.reset();
			await invalidate('demo:physical-boxes');
		} catch (cause) {
			localError =
				cause instanceof ValidationError
					? intent === 'condition'
						? 'physicalBoxes.conditionError'
						: 'physicalBoxes.nameError'
					: demoSaveError(cause);
		} finally {
			pending = false;
		}
	}

	async function downloadDemoLabel(box: PhysicalBox) {
		try {
			const { renderPhysicalBoxLabel } = await import('#lib/mtg/physical-box-label.ts');
			const svg = await renderPhysicalBoxLabel(box);
			const link = document.createElement('a');
			link.href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
			link.download = `spellbook-box-${box.id}.svg`;
			link.click();
		} catch {
			localError = 'ui.Could.not.save.Try.again';
		}
	}

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
<form
	onsubmit={saveLocally}
	use:enhance={({ cancel }) => {
		if (page.data.demoSession) return cancel();
		return async ({ result, update }) => {
			if (result.type === 'failure' && result.status === 409) await invalidateAll();
			await update();
		};
	}}
	method="POST"
	action="?/create"
>
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
		value={form?.intent === 'create' ? form.name : ''}
	/>
	<button disabled={pending} type="submit">{language.t('physicalBoxes.create')}</button>
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

{#if localError}<p role="alert">{language.t(localError)}</p>{/if}

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
		{#if page.data.demoSession}
			<button type="button" onclick={() => downloadDemoLabel(box)}>
				{language.t('physicalBoxes.label')}
			</button>
		{:else}<a href={`/settings/physical-boxes/${box.id}/label.svg`} download>
				{language.t('physicalBoxes.label')}
			</a>{/if}
		<form
			onsubmit={saveLocally}
			use:enhance={({ cancel }) => {
				if (page.data.demoSession) cancel();
			}}
			method="POST"
			action="?/rename"
		>
			<input type="hidden" name="id" value={box.id} />
			<label for={`name-${box.id}`}>{language.t('ui.Name')}</label>
			<input id={`name-${box.id}`} name="name" required value={renameError?.name ?? box.name} />
			<button disabled={pending} type="submit">{language.t('ui.Rename')}</button>
			{#if renameError}<p role="alert">
					{language.t(
						renameError.validation ? 'physicalBoxes.nameError' : 'ui.Could.not.save.Try.again'
					)}
				</p>{/if}
		</form>
		<form
			onsubmit={saveLocally}
			use:enhance={({ cancel }) => {
				if (page.data.demoSession) cancel();
			}}
			method="POST"
			action="?/condition"
		>
			<input type="hidden" name="id" value={box.id} />
			<h3>{language.t('physicalBoxes.condition')}</h3>
			<p>{language.t('physicalBoxes.conditionHelp')}</p>
			<fieldset>
				<legend>{language.t('physicalBoxes.printedColor')}</legend>
				{#each colors as [value, key] (value)}
					<label>
						<input
							type="checkbox"
							name="printedColor"
							{value}
							checked={printedColor.includes(value)}
						/>
						{language.t(key)}
					</label>
				{/each}
			</fieldset>
			<fieldset>
				<legend>{language.t('ui.Rarity')}</legend>
				{#each rarities as value (value)}
					<label>
						<input type="checkbox" name="rarity" {value} checked={rarity.includes(value)} />
						{language.t(`rarity.${value}`)}
					</label>
				{/each}
			</fieldset>
			<label for={`set-${box.id}`}>{language.t('physicalBoxes.setCodes')}</label>
			<input id={`set-${box.id}`} name="setCode" value={setCodes} />
			<div class="buttons">
				<button disabled={pending} type="submit">{language.t('ui.Save')}</button>
				<button disabled={pending} type="submit" name="clear" value="1">
					{language.t('physicalBoxes.clear')}
				</button>
			</div>
			{#if conditionError}<p role="alert">
					{language.t(
						conditionError.validation
							? 'physicalBoxes.conditionError'
							: 'ui.Could.not.save.Try.again'
					)}
				</p>{/if}
		</form>
		{#if page.data.demoSession}
			<form method="POST" action="?/delete" onsubmit={saveLocally}>
				<input type="hidden" name="id" value={box.id} />
				<button type="submit" disabled={pending}>{language.t('ui.Delete.box')}</button>
			</form>
		{/if}
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
		gap: 0.5rem;
		min-height: 40px;
	}
	@media (max-width: 700px) {
		fieldset label {
			min-height: 44px;
		}
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
