<script lang="ts">
	import { untrack } from 'svelte';
	import {
		initialCategoryDraft,
		editCategoryDraft,
		acknowledgeCategoryDraft,
		reconcileCategoryDraft
	} from '#lib/decks/category-save.ts';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '$app/forms';
	import type { DeckEntryCategories } from '@spellbook/contracts/categories.ts';
	import Button from '#lib/components/ui/button/Button.svelte';
	let {
		categories,
		entryId,
		action,
		requestId,
		busy,
		submit,
		recovery
	}: {
		categories: DeckEntryCategories;
		entryId: string;
		action: string;
		requestId: string;
		busy: boolean;
		submit: SubmitFunction;
		recovery?: { categoryId: string | null; expectedDecisionRevision: string; requestId: string };
	} = $props();
	const inputId = $props.id();
	const decision = $derived(categories.decisions.find((d) => d.entryId === entryId));
	const name = $derived(
		categories.definitions.find((d) => d.id === decision?.categoryId)?.name ?? 'Uncategorized'
	);
	let draft = $state(
		untrack(() => initialCategoryDraft(decision, categories.decisionRevision, recovery))
	);
	$effect(() => {
		const next = reconcileCategoryDraft(draft, categories, entryId);
		if (next !== draft) draft = next;
	});
	let refreshing = $state(false);
	let readError = $state('');
	async function refreshSaved() {
		if (refreshing || busy) return;
		refreshing = true;
		readError = '';
		try {
			await invalidateAll();
		} catch {
			readError = 'Could not read the saved category. Your choice is retained.';
		} finally {
			refreshing = false;
		}
	}
	const categorySubmit: SubmitFunction = async (args) => {
		const submitted = draft.value;
		draft = editCategoryDraft(draft, submitted);
		const after = await submit(args);
		return async (response) => {
			if (typeof after === 'function') await after(response);
			if (response.result.type === 'success') {
				const acknowledgement = response.result.data?.acknowledgement;
				if (
					acknowledgement?.deckId === categories.deckId &&
					typeof acknowledgement.decisionRevision === 'string' &&
					/^\d+$/.test(acknowledgement.decisionRevision)
				)
					draft = acknowledgeCategoryDraft(draft, submitted, acknowledgement);
			}
		};
	};
</script>

<div data-entry-category={entryId} class="category-editor">
	<p class="muted" data-category-provenance>
		{name}: {decision?.state ?? 'Uninitialized'}.
		{#if decision?.state === 'Pending'}Required source facts were unavailable when this entry was
			evaluated.{:else if decision?.state === 'Automatic'}Starter rule decision.{:else if decision?.state === 'Manual'}Your
			saved decision.{/if}
	</p>
	{#if decision?.evidence}<details>
			<summary>Rule evidence</summary>
			<p class="muted">Source date: {decision.evidence.sourceTime ?? 'Unavailable'}</p>
			{#each decision.evidence.predicates as predicate}<p class="muted">
					{categories.definitions.find((d) => d.origin === predicate.origin)?.name ??
						predicate.origin}: {predicate.result}{predicate.matchedTagIds.length
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
		<select
			id={inputId}
			name="categoryId"
			class="input"
			bind:value={draft.value}
			onchange={() => (draft = editCategoryDraft(draft, draft.value))}
			disabled={busy}
		>
			<option value="">Uncategorized</option>
			{#each categories.definitions.toSorted((a, b) => a.displayOrder - b.displayOrder) as definition}<option
					value={definition.id}>{definition.name}</option
				>{/each}
		</select>
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
				disabled={busy}>Apply choice to latest revision</Button
			>{:else}<Button type="submit" variant="outline" disabled={busy}>Save category</Button>{/if}
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
