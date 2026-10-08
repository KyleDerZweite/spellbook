<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack, onMount, onDestroy } from 'svelte';
	import type { SubmitFunction } from '$app/forms';
	import type { WriteHandle } from '#lib/saved-state/workspace.ts';
	import type { WholeCategoryDraft } from '#lib/decks/whole-drafts.ts';
	import type {
		DeckWholeCategories,
		WholeCategory
	} from '@spellbook/contracts/whole-categories.ts';
	import type { CategoryPreview } from '@spellbook/contracts/category-library.ts';
	import { describeCategoryRule } from '#lib/categories/rule-summary.ts';
	import { describeWholeCategoryConsequence } from '#lib/categories/whole-preview-label.ts';
	import Button from '#lib/components/ui/button/Button.svelte';
	import Select from '#lib/components/ui/select/Select.svelte';
	let {
		categories,
		preview = null,
		action,
		unavailable = '',
		selectedVersionId = null,
		draft = undefined,
		beginWrite = undefined
	}: {
		categories: DeckWholeCategories;
		preview?: CategoryPreview | null;
		action: (name: string) => string;
		unavailable?: string;
		selectedVersionId?: string | null;
		draft?: WholeCategoryDraft;
		beginWrite?: () => WriteHandle | undefined;
	} = $props();
	let selected = $state(
		untrack(
			() =>
				(draft?.deckId === categories.deckId ? draft.versionId : null) ??
				selectedVersionId ??
				categories.categories.find((c) => !c.suppressed)?.versionId ??
				''
		)
	);
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
	let disposed = false;
	onDestroy(() => {
		disposed = true;
	});
	let mode = $state('Review');
	const recovery = untrack(() => (draft?.deckId === categories.deckId ? draft : undefined));
	let manual = $state<'Include' | 'Exclude'>(recovery?.manual ?? 'Include');
	let name = $state(
		untrack(() =>
			recovery?.kind === 'rename'
				? recovery.name
				: (categories.categories.find((c) => c.versionId === selected)?.name ?? '')
		)
	);
	let manualBase = $state(
		recovery?.kind === 'manual'
			? recovery.expectedDecisionRevision
			: untrack(() => categories.decisionRevision)
	);
	let renameBase = $state(
		recovery?.kind === 'rename'
			? recovery.expectedDecisionRevision
			: untrack(() => categories.decisionRevision)
	);
	let requestId = $state(recovery?.kind === 'manual' ? recovery.requestId : crypto.randomUUID());
	let renameRequestId = $state(
		recovery?.kind === 'rename' ? recovery.requestId : crypto.randomUUID()
	);
	let removalBase = $state(
		recovery?.kind === 'remove'
			? recovery.expectedDecisionRevision
			: untrack(() => categories.decisionRevision)
	);
	let removalDirty = $state(recovery?.kind === 'remove');
	let previewRequestId = $state(crypto.randomUUID()),
		commitRequestId = $state(crypto.randomUUID()),
		removeRequestId = $state(
			recovery?.kind === 'remove' ? recovery.requestId : crypto.randomUUID()
		);
	let manualDirty = $state(recovery?.kind === 'manual'),
		renameDirty = $state(recovery?.kind === 'rename');
	let busy = $state(false),
		message = $state('');
	let retainedCategory = $state<WholeCategory | undefined>(
		untrack(() => categories.categories.find((c) => c.versionId === selected))
	);
	const current = $derived(categories.categories.find((c) => c.versionId === selected));
	const inspected = $derived(current ?? retainedCategory);

	const scopedPreview = $derived(preview?.scope === 'deck' ? preview : null);
	function choose(value: string) {
		selected = value;
		retainedCategory = categories.categories.find((c) => c.versionId === value);
		name = categories.categories.find((c) => c.versionId === value)?.name ?? '';
		manualBase = categories.decisionRevision;
		renameBase = categories.decisionRevision;
		requestId = crypto.randomUUID();
		renameRequestId = crypto.randomUUID();
		manualDirty = false;
		renameDirty = false;
		removalDirty = false;
		removalBase = categories.decisionRevision;
		removeRequestId = crypto.randomUUID();
		message = '';
	}
	$effect(() => {
		if (!busy) {
			if (!removalDirty) removalBase = categories.decisionRevision;
			if (!manualDirty) manualBase = categories.decisionRevision;
			if (!renameDirty) {
				renameBase = categories.decisionRevision;
				if (current) {
					retainedCategory = current;
					name = current.name;
				}
			}
		}
	});
	const submit: SubmitFunction = ({ action: submittedAction }) => {
		const operation = submittedAction.search,
			ownerDeck = categories.deckId,
			write = beginWrite?.();
		busy = true;
		message = '';
		return async ({ result, update }) => {
			try {
				if (disposed || ownerDeck !== categories.deckId || !(write?.current() ?? true)) return;
				if (result.type === 'success') {
					await update({ reset: false });
					if (disposed || ownerDeck !== categories.deckId || !(write?.current() ?? true)) return;
					if (operation.includes('rebaseWholeDraft')) {
						const d = result.data?.wholeDraft as WholeCategoryDraft | undefined;
						if (d?.kind === 'rename') {
							renameBase = d.expectedDecisionRevision;
							renameRequestId = d.requestId;
						} else if (d?.kind === 'manual') {
							manualBase = d.expectedDecisionRevision;
							requestId = d.requestId;
						}
						if (d?.kind === 'remove') {
							removalBase = d.expectedDecisionRevision;
							removeRequestId = d.requestId;
						}
						message = 'Draft rebased. Review it and save again.';
					} else if (operation.includes('renameWholeCategory')) {
						renameDirty = false;
						renameBase = categories.decisionRevision;
						renameRequestId = crypto.randomUUID();
						message = 'Local label saved.';
					} else if (operation.includes('setWholeCategory')) {
						manualDirty = false;
						manualBase = categories.decisionRevision;
						requestId = crypto.randomUUID();
						message = 'Manual choice saved.';
					} else if (operation.includes('previewCategories')) {
						previewRequestId = crypto.randomUUID();
						message = 'Review the complete preview before saving.';
					} else if (operation.includes('commitCategories')) {
						commitRequestId = crypto.randomUUID();
						message = 'Whole-deck Review/Reset saved.';
					} else {
						removalDirty = false;
						removalBase = categories.decisionRevision;
						removeRequestId = crypto.randomUUID();
						message = 'Whole-deck origin suppressed.';
					}
				} else {
					if (operation.includes('renameWholeCategory')) renameDirty = true;
					if (operation.includes('setWholeCategory')) manualDirty = true;
					if (operation.includes('removeWholeCategory')) removalDirty = true;
					message = 'The change was not confirmed. Your draft and original revision are retained.';
					if (result.type === 'failure') await update({ reset: false, invalidateAll: false });
					if (disposed || ownerDeck !== categories.deckId || !(write?.current() ?? true)) return;
				}
			} finally {
				write?.complete();
				if (!disposed && ownerDeck === categories.deckId && (write?.current() ?? true))
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
			{#if inspected}
				<p>{inspected.definition.meaning}</p>
				<p class="muted">
					{describeCategoryRule(inspected.definition.rule)} Roles: {inspected.definition.roles.join(
						', '
					)}.
				</p>
				<p>
					{inspected.suppressed
						? 'Suppressed'
						: inspected.decision?.state === 'Manual'
							? `Manual ${inspected.decision.manual}`
							: inspected.decision?.state === 'Pending'
								? `Pending, retained result ${inspected.decision.truth ?? 'none'}`
								: inspected.decision
									? `Automatic ${inspected.decision.truth}`
									: 'Awaiting initial evaluation'}
				</p>
				{#if inspected.decision?.evidence}<details>
						<summary
							>{inspected.decision.state === 'Pending'
								? 'Retained valid evidence, stale'
								: 'Saved valid evidence'}</summary
						>
						<p class="muted">
							Composition revision {inspected.decision.evidence.compositionRevision}. Adopted
							version {inspected.definition.version}. Catalog {inspected.decision.evidence
								.catalogGenerationId ?? 'unavailable'}. Oracle publication {inspected.decision
								.evidence.oraclePublicationId ?? 'unavailable'}.
						</p>
						<pre>{JSON.stringify(inspected.decision.evidence, null, 2)}</pre>
					</details>{/if}
				{#if inspected.decision?.previousEvaluation}<details>
						<summary
							>{inspected.decision.state === 'Pending'
								? 'Latest Unknown attempt'
								: 'Previous automatic evidence'}</summary
						>
						<p class="muted">
							Composition revision {inspected.decision.previousEvaluation.compositionRevision}.
							Attempt {inspected.decision.previousEvaluation.attemptedTruth}. Catalog {inspected
								.decision.previousEvaluation.catalogGenerationId ?? 'unavailable'}. Oracle
							publication {inspected.decision.previousEvaluation.oraclePublicationId ??
								'unavailable'}.
						</p>
						<pre>{JSON.stringify(inspected.decision.previousEvaluation, null, 2)}</pre>
					</details>{/if}

				{#if !inspected.suppressed}
					<form method="POST" action={action('setWholeCategory')} use:enhance={submit}>
						<input type="hidden" name="deckId" value={categories.deckId} /><input
							type="hidden"
							name="versionId"
							value={selected}
						/><input type="hidden" name="requestId" value={requestId} /><input
							type="hidden"
							name="expectedDecisionRevision"
							value={manualBase}
						/>
						<label
							>Manual choice<Select
								label="Manual choice"
								native={!mounted}
								name="manual"
								value={manual}
								onchange={(value) => {
									manual = value as 'Include' | 'Exclude';
									manualDirty = true;
									requestId = crypto.randomUUID();
								}}
								options={[
									{ value: 'Include', label: 'Include' },
									{ value: 'Exclude', label: 'Exclude' }
								]}
								disabled={busy}
							/></label
						>
						<input type="hidden" name="draftKind" value="manual" /><Button
							type="submit"
							disabled={busy || !!unavailable || !current}>Save Manual choice</Button
						><button
							class="btn btn-ghost"
							type="submit"
							formaction={action('rebaseWholeDraft')}
							disabled={busy || !!unavailable || !current}>Rebase Manual draft</button
						>
					</form>
					<form method="POST" action={action('renameWholeCategory')} use:enhance={submit}>
						<input type="hidden" name="deckId" value={categories.deckId} /><input
							type="hidden"
							name="versionId"
							value={selected}
						/><input type="hidden" name="requestId" value={renameRequestId} /><input
							type="hidden"
							name="expectedDecisionRevision"
							value={renameBase}
						/>
						<label
							>Local label<input
								name="name"
								bind:value={name}
								oninput={() => {
									renameDirty = true;
								}}
								maxlength="128"
								required
								disabled={busy}
							/></label
						><input type="hidden" name="draftKind" value="rename" /><Button
							type="submit"
							disabled={busy || !!unavailable || !current}>Rename local label</Button
						><button
							class="btn btn-ghost"
							type="submit"
							formaction={action('rebaseWholeDraft')}
							disabled={busy || !!unavailable || !current}>Rebase label draft</button
						>
					</form>
					<form method="POST" action={action('removeWholeCategory')} use:enhance={submit}>
						<input type="hidden" name="deckId" value={categories.deckId} /><input
							type="hidden"
							name="versionId"
							value={selected}
						/><input type="hidden" name="requestId" value={removeRequestId} /><input
							type="hidden"
							name="expectedDecisionRevision"
							value={removalBase}
						/><label
							><input type="checkbox" name="confirmRemoval" value="yes" required />Suppress this
							origin, including historical versions</label
						><input type="hidden" name="draftKind" value="remove" /><Button
							type="submit"
							disabled={busy || !!unavailable || !current}>Suppress origin</Button
						><button
							class="btn btn-ghost"
							type="submit"
							formaction={action('rebaseWholeDraft')}
							disabled={busy || !!unavailable || !current}>Rebase suppression draft</button
						>
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
			/><input type="hidden" name="requestId" value={previewRequestId} />
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
			{#each scopedPreview.differences as difference (difference.kind + ':' + difference.entityId)}
				<div class="whole-consequence">
					<p>{difference.message}</p>
					{#each [{ label: 'Before', value: difference.before }, { label: 'After', value: difference.after }] as side (side.label)}
						{@const consequence = describeWholeCategoryConsequence(side.value)}
						{#if consequence}
							<p>{side.label}: {consequence.title}. {consequence.outcome}</p>
							<details>
								<summary>{side.label} frozen meaning and criteria</summary>
								<p>Definition label: {consequence.definitionName}</p>
								<p>{consequence.meaning}</p>
								<p>{consequence.criteria}</p>
								<p class="muted">Version ID: {consequence.versionId}</p>
							</details>
						{:else if side.value === null}<p>
								{side.label}: No adopted version; no membership.
							</p>{/if}
					{/each}
				</div>
			{/each}
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
					/><input type="hidden" name="requestId" value={commitRequestId} /><label
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
