<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack, onMount } from 'svelte';
	import type { SubmitFunction } from '$app/forms';
	import type { DeckWholeCategories } from '@spellbook/contracts/whole-categories.ts';
	import type { CategoryPreview } from '@spellbook/contracts/category-library.ts';
	import { describeCategoryRule } from '#lib/categories/rule-summary.ts';
	import { describeCategoryConsequence } from '#lib/categories/preview-label.ts';
	import Button from '#lib/components/ui/button/Button.svelte';
	import Select from '#lib/components/ui/select/Select.svelte';
	let {
		categories,
		preview = null,
		action,
		unavailable = '',
		selectedVersionId = null
	}: {
		categories: DeckWholeCategories;
		preview?: CategoryPreview | null;
		action: (name: string) => string;
		unavailable?: string;
		selectedVersionId?: string | null;
	} = $props();
	let selected = $state(
		untrack(
			() => selectedVersionId ?? categories.categories.find((c) => !c.suppressed)?.versionId ?? ''
		)
	);
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
	let mode = $state('Review');
	let manual = $state<'Include' | 'Exclude'>('Include');
	let name = $state(
		untrack(() => categories.categories.find((c) => c.versionId === selected)?.name ?? '')
	);
	let baseRevision = $state(untrack(() => categories.decisionRevision));
	let requestId = $state(crypto.randomUUID());
	let renameRequestId = $state(crypto.randomUUID());
	let busy = $state(false),
		message = $state(''),
		dirty = $state(false);
	const current = $derived(categories.categories.find((c) => c.versionId === selected));
	const scopedPreview = $derived(preview?.scope === 'deck' ? preview : null);
	function choose(value: string) {
		selected = value;
		name = categories.categories.find((c) => c.versionId === value)?.name ?? '';
		baseRevision = categories.decisionRevision;
		requestId = crypto.randomUUID();
		renameRequestId = crypto.randomUUID();
		dirty = false;
		message = '';
	}
	$effect(() => {
		if (!dirty && !busy) {
			baseRevision = categories.decisionRevision;
			name = current?.name ?? '';
		}
	});
	const submit: SubmitFunction = () => {
		busy = true;
		message = '';
		return async ({ result, update }) => {
			try {
				if (result.type === 'success') {
					await update({ reset: false });
					requestId = crypto.randomUUID();
					renameRequestId = crypto.randomUUID();
					dirty = false;
					baseRevision = categories.decisionRevision;
					message = 'Whole-deck category change saved.';
				} else {
					dirty = true;
					message = 'The change was not confirmed. Your draft and original revision are retained.';
					await update({ reset: false, invalidateAll: false });
				}
			} finally {
				busy = false;
			}
		};
	};
</script>

<section class="whole-categories" aria-label="Whole-deck categories">
	<h3>Whole-deck categories</h3>
	<p class="muted">
		Decks can belong to several categories. Manual choices retain their exact version and meaning.
	</p>
	{#if unavailable}<p role="alert">{unavailable}</p>{/if}
	{#if message}<p role="status">{message}</p>{/if}
	{#if !categories.initialized}<p class="muted">
			Initialize this Deck's categories before reviewing whole-deck rules.
		</p>
	{:else}
		{#if categories.categories.length}
			<noscript
				><form method="GET" action="/mtg/decks">
					<input type="hidden" name="deck" value={categories.deckId} /><label
						>Inspect whole-deck version<select name="wholeCategoryVersion"
							>{#each categories.categories as category (category.versionId)}<option
									value={category.versionId}
									selected={category.versionId === selected}
									>{category.name}, version {category.definition.version}</option
								>{/each}</select
						></label
					><Button type="submit">Inspect version</Button>
				</form></noscript
			>
			<label
				>Inspect category<Select
					label="Inspect whole-deck category"
					native={!mounted}
					name="wholeCategorySelection"
					value={selected}
					onchange={choose}
					options={categories.categories.map((c) => ({
						value: c.versionId,
						label: `${c.name}, version ${c.definition.version}${c.suppressed ? ' (suppressed)' : !c.automaticActive ? ' (historical)' : ''}`
					}))}
					disabled={busy}
				/></label
			>
			{#if current}
				<p>{current.definition.meaning}</p>
				<p class="muted">
					{describeCategoryRule(current.definition.rule)} Roles: {current.definition.roles.join(
						', '
					)}.
				</p>
				<p>
					{current.suppressed
						? 'Suppressed'
						: current.decision?.state === 'Manual'
							? `Manual ${current.decision.manual}`
							: current.decision?.state === 'Pending'
								? `Pending, retained result ${current.decision.truth ?? 'none'}`
								: current.decision
									? `Automatic ${current.decision.truth}`
									: 'Awaiting initial evaluation'}
				</p>
				{#if current.decision?.evidence || current.decision?.previousEvaluation}
					<details>
						<summary>Saved rule evidence</summary>
						<p class="muted">
							Composition revision {(
								current.decision.previousEvaluation ?? current.decision.evidence
							)?.compositionRevision}. The evidence belongs to version {current.definition.version}.
						</p>
						<pre>{JSON.stringify(
								current.decision.previousEvaluation ?? current.decision.evidence,
								null,
								2
							)}</pre>
					</details>
				{/if}
				{#if !current.suppressed}
					<form method="POST" action={action('setWholeCategory')} use:enhance={submit}>
						<input type="hidden" name="deckId" value={categories.deckId} /><input
							type="hidden"
							name="versionId"
							value={selected}
						/><input type="hidden" name="requestId" value={requestId} /><input
							type="hidden"
							name="expectedDecisionRevision"
							value={baseRevision}
						/>
						<label
							>Manual choice<Select
								label="Manual choice"
								native={!mounted}
								name="manual"
								value={manual}
								onchange={(value) => {
									manual = value as 'Include' | 'Exclude';
									dirty = true;
									requestId = crypto.randomUUID();
								}}
								options={[
									{ value: 'Include', label: 'Include' },
									{ value: 'Exclude', label: 'Exclude' }
								]}
								disabled={busy}
							/></label
						>
						<Button type="submit" disabled={busy || !!unavailable}>Save Manual choice</Button>
					</form>
					<form method="POST" action={action('renameWholeCategory')} use:enhance={submit}>
						<input type="hidden" name="deckId" value={categories.deckId} /><input
							type="hidden"
							name="versionId"
							value={selected}
						/><input type="hidden" name="requestId" value={renameRequestId} /><input
							type="hidden"
							name="expectedDecisionRevision"
							value={baseRevision}
						/>
						<label
							>Local label<input
								name="name"
								bind:value={name}
								oninput={() => {
									dirty = true;
								}}
								maxlength="128"
								required
								disabled={busy}
							/></label
						><Button type="submit" disabled={busy || !!unavailable}>Rename local label</Button>
					</form>
					<form method="POST" action={action('removeWholeCategory')} use:enhance={submit}>
						<input type="hidden" name="deckId" value={categories.deckId} /><input
							type="hidden"
							name="versionId"
							value={selected}
						/><input type="hidden" name="requestId" value={crypto.randomUUID()} /><input
							type="hidden"
							name="expectedDecisionRevision"
							value={categories.decisionRevision}
						/><label
							><input type="checkbox" name="confirmRemoval" value="yes" required />Suppress this
							origin, including historical versions</label
						><Button type="submit" disabled={busy || !!unavailable}>Suppress origin</Button>
					</form>
				{/if}
			{/if}
		{:else}<p class="muted">
				No whole-deck definitions are adopted. Review to adopt your current Library.
			</p>{/if}
		<form method="POST" action={action('previewCategories')} use:enhance={submit}>
			<input type="hidden" name="deckId" value={categories.deckId} /><input
				type="hidden"
				name="scope"
				value="deck"
			/><input type="hidden" name="requestId" value={crypto.randomUUID()} />
			<label
				>Whole-deck scope<Select
					label="Whole-deck change"
					native={!mounted}
					name="mode"
					bind:value={mode}
					options={[
						{ value: 'Review', label: 'Review, preserve Manual' },
						{ value: 'Reset', label: 'Reset, release Manual' }
					]}
					disabled={busy}
				/></label
			>
			{#each [...new Map(categories.categories
						.filter((c) => c.suppressed)
						.map((c) => [c.originId, c])).values()] as suppressed (suppressed.originId)}<label
					><input type="checkbox" name="restoreOriginIds" value={suppressed.originId} />Restore {suppressed.name}</label
				>{/each}
			<Button type="submit" disabled={busy || !!unavailable}>Preview whole-deck changes</Button>
		</form>
		{#if scopedPreview}
			<p>{scopedPreview.total} reviewed consequences. {scopedPreview.status}.</p>
			{#each scopedPreview.differences as difference (difference.kind + ':' + difference.entityId)}<p
				>
					{difference.message}
					{describeCategoryConsequence(difference.before)} to {describeCategoryConsequence(
						difference.after
					)}.
				</p>{/each}
			{#if scopedPreview.offset > 0}<a
					href={`/mtg/decks?deck=${categories.deckId}&preview=${scopedPreview.id}&previewOffset=${Math.max(0, scopedPreview.offset - scopedPreview.limit)}`}
					>Previous consequences</a
				>{/if}
			{#if scopedPreview.offset + scopedPreview.limit < scopedPreview.total}<a
					href={`/mtg/decks?deck=${categories.deckId}&preview=${scopedPreview.id}&previewOffset=${scopedPreview.offset + scopedPreview.limit}`}
					>Next consequences</a
				>{/if}
			{#if scopedPreview.status === 'Ready'}<form
					method="POST"
					action={action('commitCategories')}
					use:enhance={submit}
				>
					<input type="hidden" name="deckId" value={categories.deckId} /><input
						type="hidden"
						name="previewId"
						value={scopedPreview.id}
					/><input type="hidden" name="requestId" value={crypto.randomUUID()} /><label
						><input type="checkbox" name="confirmPreview" value="yes" required />I reviewed the
						complete whole-deck change</label
					><Button type="submit" disabled={busy || !!unavailable}
						>Save whole-deck Review/Reset</Button
					>
				</form>{/if}
		{/if}
	{/if}
</section>

<style>
	.whole-categories {
		display: grid;
		gap: 0.75rem;
		min-width: 0;
		padding-block: 1rem;
		border-top: 1px solid var(--color-border, #333);
	}
	h3,
	p {
		margin: 0;
	}
	form {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.6rem;
	}
	label {
		display: grid;
		gap: 0.3rem;
		min-width: 0;
	}
	input:not([type='checkbox']) {
		padding: 0.5rem;
		max-width: 100%;
	}
	pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-size: 0.75rem;
	}
	.muted {
		opacity: 0.75;
	}
</style>
