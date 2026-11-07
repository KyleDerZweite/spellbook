<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import type { PageProps } from './$types';
	import Button from '#lib/components/ui/button/Button.svelte';
	import WorkspaceHeader from '#lib/components/layout/WorkspaceHeader.svelte';
	let { data, form }: PageProps = $props();
	const preview = $derived(form && 'preview' in form ? form.preview : undefined);
	const blocked = $derived(
		!preview || preview.unresolved.length > 0 || preview.ambiguous.length > 0
	);
</script>

<svelte:head><title>{language.t('ui.Import.Deck.Spellbook')}</title></svelte:head>
<div class="workspace-container exchange">
	<WorkspaceHeader title={language.t('ui.Import.a.new.Deck')}>
		{#snippet actions()}<Button href="/mtg/decks" variant="secondary"
				>{language.t('ui.All.decks')}</Button
			>{/snippet}
	</WorkspaceHeader>
	<p>
		{language.t(
			'ui.Paste.or.upload.Arena.text.simple.quantity.name.text.Spellbook.CSV.or.Spellbook.Deck.JSON.v1.Preview.every.record.before.creating.the.complete.Deck'
		)}
	</p>
	<p>
		{language.t(
			'ui.CSV.and.Spellbook.JSON.preserve.exact.printings.and.roles.Simple.text.loses.printing.choices.roles.and.Deck.details.Hosted.links.and.share.codes.are.not.imported'
		)}
	</p>
	{#if form && 'message' in form}<p role="alert">{form.message}</p>{/if}
	{#if form && 'retryCommit' in form && form.retryCommit}
		<form method="POST">
			<input type="hidden" name="requestId" value={form.requestId} />
			<input type="hidden" name="text" value={form.text} />
			<input type="hidden" name="name" value={form.name} />
			<input type="hidden" name="format" value={form.format} />
			<input type="hidden" name="description" value={form.description} />
			<Button type="submit" name="intent" value="commit"
				>{language.t('ui.Retry.creating.the.same.Deck')}</Button
			>
		</form>
	{/if}
	<form method="POST" enctype="multipart/form-data" class="form-stack">
		<input type="hidden" name="requestId" value={form?.requestId || data.requestId} />
		<label class="label" for="deck-source">{language.t('ui.Decklist')}</label>
		<textarea
			class="input"
			id="deck-source"
			name="text"
			maxlength="100000"
			rows="10"
			value={form?.text ?? ''}></textarea>
		<label class="label" for="deck-file">{language.t('ui.Or.upload.a.UTF.8.file')}</label>
		<input
			id="deck-file"
			name="file"
			type="file"
			accept=".txt,.csv,.json,text/plain,text/csv,application/json"
		/>
		<p>{language.t('ui.Maximum.100.000.characters.400.000.file.bytes.and.1.000.card.records')}</p>
		<details open={!preview?.metadata}>
			<summary>{language.t('ui.Details.for.text.imports')}</summary>
			<p>
				{language.t(
					'ui.CSV.and.JSON.supply.their.own.details.An.Arena.About.Name.header.supplies.its.name'
				)}
			</p>
			<label class="label" for="deck-name">{language.t('ui.Deck.name')}</label>
			<input class="input" id="deck-name" name="name" maxlength="200" value={form?.name ?? ''} />
			<label class="label" for="deck-format">{language.t('ui.Format')}</label>
			<input
				class="input"
				id="deck-format"
				name="format"
				maxlength="100"
				value={form?.format ?? 'Commander'}
			/>
			<label class="label" for="deck-description">{language.t('ui.Description')}</label>
			<textarea
				class="input"
				id="deck-description"
				name="description"
				maxlength="4000"
				rows="3"
				value={form?.description ?? ''}></textarea>
		</details>
		<Button type="submit" variant="secondary" name="intent" value="preview"
			>{language.t('ui.Preview.import')}</Button
		>
	</form>
	{#if preview}
		<section aria-labelledby="preview-title" class="form-stack">
			<h2 id="preview-title">{language.t('ui.Import.preview')}</h2>
			{#if preview.metadata}<h3>{preview.metadata.name}</h3>
				<p>{preview.metadata.format}</p>
				<p class="description">{preview.metadata.description}</p>{/if}
			<p>
				{language.t('sentence.p0.matched.copies.in.p1.records', {
					p0: String(preview.resolved.reduce((total, item) => total + item.line.quantity, 0)),
					p1: String(preview.resolved.length)
				})}
			</p>
			{#if blocked}<p role="alert">
					{language.t('ui.Resolve.every.record.before.creating.the.Deck')}
				</p>{/if}
			<ul>
				{#each preview.unresolved as item}<li>
						<code>{item.line.raw}</code>: {item.reason}
					</li>{/each}
				{#each preview.ambiguous as item}<li>
						<code>{item.line.raw}</code>{language.t(
							'ui.Multiple.matches.Add.a.set.code.and.collector.number'
						)}
					</li>{/each}
			</ul>
			<details open>
				<summary>{language.t('ui.Matched.cards')}</summary>
				<ul>
					{#each preview.resolved as item}<li>
							{item.line.quantity}
							{item.card.name}, {item.line.role}, {item.card.set_code.toUpperCase()}
							{item.card.collector_number}
						</li>{/each}
				</ul>
			</details>
			{#if preview.warnings.length}<details>
					<summary>{language.t('ui.Format.warnings')}</summary>
					<ul>
						{#each preview.warnings as warning}<li>{warning.message}</li>{/each}
					</ul>
				</details>{/if}
			<form method="POST">
				<input type="hidden" name="requestId" value={form?.requestId || data.requestId} />
				<input type="hidden" name="text" value={form?.text ?? ''} />
				<input type="hidden" name="name" value={form?.name ?? ''} />
				<input type="hidden" name="format" value={form?.format ?? 'Commander'} />
				<input type="hidden" name="description" value={form?.description ?? ''} />
				<Button type="submit" name="intent" value="commit" disabled={blocked}
					>{language.t('ui.Create.complete.Deck')}</Button
				>
			</form>
		</section>
	{/if}
</div>

<style>
	.exchange {
		max-width: 60rem;
		padding-block: 2rem;
	}
	.form-stack {
		display: grid;
		gap: 0.75rem;
		margin-block: 1.5rem;
	}
	.description {
		white-space: pre-wrap;
	}
	code {
		overflow-wrap: anywhere;
	}
</style>
