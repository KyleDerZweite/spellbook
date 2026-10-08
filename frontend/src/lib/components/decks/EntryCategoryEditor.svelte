<script lang="ts">
	import { untrack, onDestroy } from 'svelte';
	import {
		categoryDecisionPresentation,
		categoryPredicateLabel
	} from '#lib/categories/decision-presentation.ts';
	import { describeCategoryRule } from '#lib/categories/rule-summary.ts';
	import {
		initialCategoryDraft,
		editCategoryDraft,
		acknowledgeCategoryDraft,
		reconcileCategoryDraft
	} from '#lib/decks/category-save.ts';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '$app/forms';
	import type { DeckEntryCategories } from '@spellbook/contracts/categories.ts';
	import Button from '#lib/components/ui/button/Button.svelte';
	import Select from '#lib/components/ui/select/Select.svelte';
	let {
		categories,
		entryId,
		action,
		requestId,
		busy,
		submit,
		refresh,
		recovery,
		unavailable = null,
		onDraftChange
	}: {
		categories: DeckEntryCategories;
		entryId: string;
		action: string;
		requestId: string;
		busy: boolean;
		submit: SubmitFunction;
		refresh: (deckId: string, signal: AbortSignal) => Promise<void>;
		unavailable?: string | null;
		onDraftChange?: (dirty: boolean) => void;
		recovery?: { categoryId: string | null; expectedDecisionRevision: string; requestId: string };
	} = $props();
	const inputId = $props.id();
	const decision = $derived(categories.decisions.find((d) => d.entryId === entryId));
	const presentation = $derived(categoryDecisionPresentation(categories, decision));
	const name = $derived(presentation.name);
	let draft = $state(
		untrack(() => initialCategoryDraft(decision, categories.decisionRevision, recovery))
	);
	$effect(() => {
		const next = reconcileCategoryDraft(draft, categories, entryId);
		if (next !== draft) draft = next;
	});
	$effect(() => onDraftChange?.(draft.dirty));
	let live = true;
	let controller: AbortController | undefined;
	onDestroy(() => {
		live = false;
		controller?.abort();
	});
	let refreshing = $state(false);
	let readError = $state('');
	async function refreshSaved() {
		if (refreshing || !live) return;
		refreshing = true;
		readError = '';
		controller?.abort();
		controller = new AbortController();
		try {
			await refresh(categories.deckId, controller.signal);
		} catch {
			if (live) readError = 'Could not read the saved category. Your choice is retained.';
		} finally {
			refreshing = false;
		}
	}
	const categorySubmit: SubmitFunction = async (args) => {
		if (unavailable) {
			args.cancel();
			return;
		}
		const submitted = draft.value;
		draft = editCategoryDraft(draft, submitted);
		const after = await submit(args);
		return async (response) => {
			if (typeof after === 'function') await after(response);
			if (!live) return;
			if (response.result.type === 'success') {
				const acknowledgement = response.result.data?.acknowledgement;
				if (
					acknowledgement?.deckId === categories.deckId &&
					typeof acknowledgement.decisionRevision === 'string' &&
					/^\d+$/.test(acknowledgement.decisionRevision)
				) {
					draft = acknowledgeCategoryDraft(draft, submitted, acknowledgement);
					await refreshSaved();
				}
			}
		};
	};
</script>

<div data-entry-category={entryId} class="category-editor">
	{#if unavailable}<p role="alert" class="notice">{unavailable}</p>{/if}
	<p class="muted" data-category-provenance>
		{name}: {decision?.state ?? 'Uninitialized'}.
		{#if decision?.state === 'Pending'}Required source facts were unavailable when this entry was
			evaluated.{:else if decision?.state === 'Automatic'}Automatic rule decision.{:else if decision?.state === 'Manual'}Your
			saved decision.{/if}
	</p>
	{#if decision?.state === 'Manual' && presentation.snapshot}<details data-category-saved-meaning>
			<summary>Saved Manual meaning</summary>
			<p>{presentation.snapshot.name}, version {presentation.snapshot.version}.</p>
			{#if presentation.snapshot.meaning}<p>{presentation.snapshot.meaning}</p>{/if}
			{#if presentation.snapshot.rule}<p>{describeCategoryRule(presentation.snapshot.rule)}</p>{/if}
			{#if presentation.historical}<p>
					The currently adopted definition is {presentation.adopted?.name ?? 'unavailable'}. Review
					retained your saved meaning. Reset explicitly releases this Manual choice.
				</p>{/if}
		</details>{/if}
	{#if decision?.evidence}<details>
			<summary>Rule evidence</summary>
			<p class="muted">Source date: {decision.evidence.sourceTime ?? 'Unavailable'}</p>
			{#each decision.evidence.predicates as predicate}<p class="muted">
					{categoryPredicateLabel(predicate, decision, categories)}: {predicate.result}{predicate
						.matchedTagIds.length
						? ` (${predicate.matchedTagIds.join(', ')})`
						: ''}
				</p>{/each}
		</details>{/if}
	{#if draft.confirmation}<p role="status" class="notice">
			Your Manual choice is saved. Waiting for a current read.
		</p>
		<Button type="button" variant="outline" disabled={busy || refreshing} onclick={refreshSaved}
			>Refresh saved category</Button
		>{/if}
	{#if readError}<p role="alert" class="notice">{readError}</p>{/if}
	<form method="POST" {action} use:enhance={categorySubmit} class="form-stack">
		<input type="hidden" name="deckId" value={categories.deckId} /><input
			type="hidden"
			name="entryId"
			value={entryId}
		/><input type="hidden" name="requestId" value={recovery?.requestId ?? requestId} /><input
			type="hidden"
			name="expectedDecisionRevision"
			value={draft.revision}
		/>
		<label for={inputId} class="label">Primary category</label>
		<Select
			id={inputId}
			name="categoryId"
			label="Primary category"
			native
			options={[
				{ value: '', label: 'Uncategorized' },
				...categories.definitions
					.toSorted((a, b) => a.displayOrder - b.displayOrder)
					.map((definition) => ({
						value: definition.id,
						label:
							presentation.historical && definition.id === decision?.categoryId
								? `${presentation.name} (saved Manual version ${presentation.snapshot!.version})`
								: definition.name
					}))
			]}
			bind:value={draft.value}
			onchange={(value) => (draft = editCategoryDraft(draft, value))}
			disabled={busy || !!unavailable}
		/>
		{#if BigInt(categories.decisionRevision) > BigInt(draft.revision)}<p
				role="alert"
				class="notice"
			>
				The saved category revision changed. Review the current decision above before applying your
				retained choice.
			</p>
			<Button
				type="submit"
				name="rebaseCategory"
				value={categories.decisionRevision}
				variant="outline"
				disabled={busy || !!unavailable}>Apply choice to latest revision</Button
			>{:else}<Button type="submit" variant="outline" disabled={busy || !!unavailable}
				>Save category</Button
			>{/if}
	</form>
</div>

<style>
	.category-editor {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.category-editor details {
		margin-bottom: 0.7rem;
	}
</style>
