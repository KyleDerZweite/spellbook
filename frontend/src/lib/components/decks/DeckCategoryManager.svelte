<script lang="ts">
	import CategoryComboEvidence from '#lib/components/categories/CategoryComboEvidence.svelte';
	import { describeCategoryConsequence } from '#lib/categories/preview-label.ts';
	import { describeCategoryRule } from '#lib/categories/rule-summary.ts';
	import { enhance } from '$app/forms';
	import { untrack, onMount } from 'svelte';
	import type { SubmitFunction } from '$app/forms';
	import type {
		DeckEntryCategories,
		EntryCategoryDecision
	} from '@spellbook/contracts/categories.ts';
	import type { CategoryPreview } from '@spellbook/contracts/category-library.ts';
	import ConfirmationDialog from '#lib/components/ui/dialog/ConfirmationDialog.svelte';
	import DeckDialog from '#lib/components/decks/DeckDialog.svelte';
	import Button from '#lib/components/ui/button/Button.svelte';
	import Select from '#lib/components/ui/select/Select.svelte';
	let {
		categories,
		preview = null,
		selectedCategoryId = null,
		requestId,
		busy,
		submit,
		action,
		entryNames,
		removalDraft,
		removalRetry,
		renameDraft,
		renameConfirmation,
		unavailable = null
	}: {
		categories: DeckEntryCategories;
		preview?: CategoryPreview | null;
		selectedCategoryId?: string | null;
		requestId: string;
		busy: boolean;
		submit: SubmitFunction;
		action: (name: string) => string;
		entryNames: Record<string, string>;
		unavailable?: string | null;
		renameConfirmation?: { deckId: string; requestId: string; decisionRevision: string };
		removalDraft?: {
			deckId: string;
			categoryId: string;
			replacementCategoryId: string | null;
			expectedDecisionRevision: string;
			requestId: string;
		};
		removalRetry?: {
			deckId: string;
			categoryId: string;
			replacementCategoryId: string | null;
			expectedDecisionRevision: string;
			requestId: string;
		};
		renameDraft?: {
			deckId: string;
			categoryId: string;
			name: string;
			expectedDecisionRevision: string;
			requestId: string;
		};
	} = $props();
	const removalRecovery = untrack(() =>
		removalDraft?.deckId === categories.deckId ? removalDraft : undefined
	);
	let originalRemoval = $state(
		untrack(() => (removalRetry?.deckId === categories.deckId ? removalRetry : undefined))
	);
	const recovery = untrack(() =>
		renameDraft?.deckId === categories.deckId ? renameDraft : undefined
	);
	const confirmedRename = untrack(() =>
		recovery &&
		renameConfirmation?.deckId === recovery.deckId &&
		renameConfirmation.requestId === recovery.requestId
			? renameConfirmation
			: undefined
	);
	let localRequestId = $state(
		untrack(() => (confirmedRename ? requestId : (recovery?.requestId ?? requestId)))
	);
	let selected = $state(
		untrack(
			() =>
				removalRecovery?.categoryId ??
				recovery?.categoryId ??
				selectedCategoryId ??
				categories.definitions[0]?.id ??
				''
		)
	);
	let rename = $state(
		untrack(
			() => recovery?.name ?? categories.definitions.find((d) => d.id === selected)?.name ?? ''
		)
	);
	let localRevision = $state(
		untrack(
			() =>
				confirmedRename?.decisionRevision ??
				recovery?.expectedDecisionRevision ??
				categories.decisionRevision
		)
	);
	let removalRevision = $state(
		untrack(() => removalRecovery?.expectedDecisionRevision ?? categories.decisionRevision)
	);
	let removalRequestId = $state(untrack(() => removalRecovery?.requestId ?? requestId));
	let mounted = $state(false),
		confirmRemoval = $state(false),
		replacement = $state(untrack(() => removalRecovery?.replacementCategoryId ?? '')),
		removalTrigger = $state<HTMLButtonElement | null>(null);
	onMount(() => {
		mounted = true;
	});
	const localControlId = $props.id();
	const current = $derived(categories.definitions.find((d) => d.id === selected));
	const affected = $derived(categories.decisions.filter((d) => d.categoryId === selected).length);
	const options = $derived(categories.definitions.map((d) => ({ value: d.id, label: d.name })));
	const base = $derived(`/mtg/decks?deck=${categories.deckId}&group=category`);

	const localSubmit: SubmitFunction = async (args) => {
		const after = await submit(args);
		const removing = args.action.searchParams.has('/removeCategory');
		const original = {
			deckId: String(args.formData.get('deckId') ?? ''),
			categoryId: String(args.formData.get('categoryId') ?? ''),
			replacementCategoryId: String(args.formData.get('replacementCategoryId') ?? '') || null,
			expectedDecisionRevision: String(args.formData.get('expectedDecisionRevision') ?? ''),
			requestId: String(args.formData.get('requestId') ?? '')
		};
		return async (response) => {
			if (
				removing &&
				(response.result.type === 'error' ||
					(response.result.type === 'failure' && response.result.status >= 500))
			)
				originalRemoval = original;
			if (response.result.type === 'success' && args.action.searchParams.has('/rebaseRemoval')) {
				const rebased = response.result.data?.removalDraft;
				if (rebased?.deckId === categories.deckId) {
					removalRevision = rebased.expectedDecisionRevision;
					removalRequestId = rebased.requestId;
				}
			}
			if (response.result.type === 'success') {
				const ack = response.result.data?.acknowledgement;
				if (ack?.deckId === categories.deckId && typeof ack.decisionRevision === 'string') {
					localRevision = ack.decisionRevision;
					if (originalRemoval?.requestId === ack.requestId) originalRemoval = undefined;
					removalRevision = ack.decisionRevision;
					removalRequestId = crypto.randomUUID();
					confirmRemoval = false;
				}
			}
			if (typeof after === 'function') await after(response);
		};
	};
	let managerOpen = $state(
		untrack(() => !!preview || !!selectedCategoryId || !!recovery || !!removalRecovery)
	);
	let managerTrigger = $state<HTMLElement | null>(null);
</script>

{#snippet managerContent()}
	<div class="category-manager" data-category-manager>
		<p>
			<a href="/mtg/categories">Open Account Category Library</a> to edit reusable meanings and rules.
			Local changes below affect only this deck.
		</p>
		{#if unavailable}<p role="alert" class="notice">{unavailable}</p>{/if}
		{#if originalRemoval}<form method="POST" action={action('removeCategory')} class="form-stack">
				<p role="alert">
					The earlier removal was not confirmed. Its original replacement, revision and request are
					retained separately.
				</p>
				{#each Object.entries(originalRemoval) as [name, value]}<input
						type="hidden"
						{name}
						value={value ?? ''}
					/>{/each}
				<input type="hidden" name="confirmRemoval" value="yes" /><Button
					type="submit"
					disabled={busy || !!unavailable}>Retry original removal</Button
				>
			</form>{/if}
		<fieldset disabled={busy || !!unavailable}>
			<legend>Local label or removal</legend>
			<form method="GET" action="/mtg/decks" class="form-stack">
				<input type="hidden" name="deck" value={categories.deckId} /><input
					type="hidden"
					name="group"
					value="category"
				/>
				<Select
					native
					id={localControlId}
					name="localCategory"
					label="Local category"
					bind:value={selected}
					{options}
					onchange={(value) => {
						rename = categories.definitions.find((d) => d.id === value)?.name ?? '';
						localRevision = categories.decisionRevision;
						removalRevision = categories.decisionRevision;
						removalRequestId = crypto.randomUUID();
					}}
				/>
				<Button type="submit" variant="ghost">Load local category controls</Button>
			</form>
			{#if selected}
				{#if !current}<p role="alert" class="notice">
						This local category was removed. Your retained label draft is shown below and cannot be
						saved. Choose another category to continue.
					</p>{/if}
				<form
					method="POST"
					action={action('renameCategory')}
					use:enhance={localSubmit}
					class="form-stack"
				>
					<input type="hidden" name="deckId" value={categories.deckId} /><input
						type="hidden"
						name="categoryId"
						value={selected}
					/><input type="hidden" name="expectedDecisionRevision" value={localRevision} /><input
						type="hidden"
						name="requestId"
						value={localRequestId}
					/>
					<label
						>Local name<input
							class="input"
							name="name"
							required
							maxlength="128"
							bind:value={rename}
							disabled={!current}
						/></label
					>
					<p class="muted">Rename keeps every assignment and the adopted meaning.</p>
					<Button type="submit" variant="outline" disabled={!current}
						>Rename only in this deck</Button
					>
				</form>
			{/if}
			{#if current}
				<form
					method="POST"
					action={action('removeCategory')}
					use:enhance={localSubmit}
					class="form-stack"
				>
					<input type="hidden" name="deckId" value={categories.deckId} /><input
						type="hidden"
						name="categoryId"
						value={selected}
					/><input type="hidden" name="expectedDecisionRevision" value={removalRevision} /><input
						type="hidden"
						name="requestId"
						value={removalRequestId}
					/>
					{#if originalRemoval}{#each Object.entries(originalRemoval) as [name, value]}<input
								type="hidden"
								name={`retry${name[0].toUpperCase()}${name.slice(1)}`}
								value={value ?? ''}
							/>{/each}{/if}
					{#if removalRevision !== categories.decisionRevision}<p role="alert">
							This removal uses an earlier revision. Review the current categories before rebasing.
						</p>
						<Button
							type="submit"
							variant="outline"
							formaction={action('rebaseRemoval')}
							formnovalidate>Rebase removal to current categories</Button
						>{/if}
					<p>
						Remove {current.name}. Move {affected} assigned entries across all roles to a Manual replacement.
						Cards stay in the deck. This origin stays suppressed until you explicitly restore it.
					</p>
					<Select
						native
						name="replacementCategoryId"
						label="Replacement category"
						bind:value={replacement}
						onchange={() => (removalRequestId = crypto.randomUUID())}
						options={[
							{ value: '', label: 'Manual Uncategorized' },
							...options.filter((d) => d.value !== selected)
						]}
					/>
					<label
						><input type="checkbox" name="confirmRemoval" value="yes" required />I reviewed the
						replacement and want to remove this local category.</label
					>
					<Button
						type={mounted ? 'button' : 'submit'}
						variant="destructive"
						onclick={(event) => {
							if (mounted) {
								removalTrigger =
									event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
								confirmRemoval = true;
							}
						}}>Remove local category</Button
					>
				</form>
			{/if}
		</fieldset>
		<form
			method="POST"
			action={action('previewCategories')}
			use:enhance={submit}
			class="form-stack"
		>
			<input type="hidden" name="deckId" value={categories.deckId} /><input
				type="hidden"
				name="requestId"
				value={requestId}
			/>
			{#if unavailable}<p role="alert" class="notice">{unavailable}</p>{/if}
			<fieldset disabled={busy || !!unavailable}>
				<legend>Review current definitions and sources</legend>
				<Select
					native
					name="scope"
					label="Category scope"
					value="entry"
					options={[
						{ value: 'entry', label: 'Deck entries' },
						{ value: 'deck', label: 'Whole decks (unavailable)' }
					]}
				/>
				<p>
					Review preserves all Manual decisions. Entry Reset releases Manual choices across all
					roles. Both show the complete consequences before saving.
				</p>
				{#if categories.suppressedOrigins?.length}<fieldset>
						<legend>Explicitly restore suppressed origins</legend
						>{#each categories.suppressedOrigins as origin}<label
								><input
									type="checkbox"
									name="restoreOriginIds"
									value={origin.originId}
								/>{origin.name}</label
							>{/each}
					</fieldset>{/if}
				<Button type="submit" name="mode" value="Review" variant="outline">Preview Review</Button
				><Button type="submit" name="mode" value="Reset" variant="outline">Preview Reset</Button>
			</fieldset>
		</form>
		{#if preview}
			<section aria-label="Category preview" aria-live="polite">
				<h3>{preview.mode} of {preview.scope === 'entry' ? 'Deck entries' : 'whole decks'}</h3>
				<p>
					{preview.status}. {preview.total} consequences. Expires {new Date(
						preview.expiresAt
					).toLocaleString()}.
				</p>
				{#if preview.status === 'Unsupported'}<p>
						Whole-deck Review/Reset is unavailable. No adoption or assignments were changed.
					</p>{:else if preview.status === 'Expired'}<p>
						This preview expired. Create a fresh preview to review current definitions and sources.
					</p>{:else}
					<ol start={preview.offset + 1}>
						{#each preview.differences as difference}<li>
								<p>
									{entryNames[difference.entityId] ??
										('name' in (difference.after ?? {})
											? (difference.after as { name: string }).name
											: 'Category change')}: {difference.message}
								</p>
								<CategoryComboEvidence value={difference.before} label="Before" />
								<CategoryComboEvidence value={difference.after} label="After" />
								{#if difference.before || difference.after}<p class="muted">
										Before: {describeCategoryConsequence(difference.before)}. After: {describeCategoryConsequence(
											difference.after
										)}.
									</p>{/if}
								{#if difference.before && 'rule' in difference.before && difference.before.rule}<p
										class="muted"
									>
										Before criteria: {describeCategoryRule(difference.before.rule)}
									</p>{/if}
								{#if difference.after && 'meaning' in difference.after}<p>
										Meaning: {difference.after.meaning}
									</p>{/if}
								{#if difference.after && 'rule' in difference.after && difference.after.rule}<p
										class="muted"
									>
										After criteria: {describeCategoryRule(difference.after.rule)}. Priority {difference
											.after.priority}; display order {difference.after.displayOrder}.
									</p>{/if}
							</li>{/each}
					</ol>
					<nav aria-label="Preview pages">
						{#if preview.offset > 0}<a
								href={`${base}&preview=${preview.id}&previewOffset=${Math.max(0, preview.offset - preview.limit)}`}
								>Previous consequences</a
							>{/if}{#if preview.offset + preview.limit < preview.total}<a
								href={`${base}&preview=${preview.id}&previewOffset=${preview.offset + preview.limit}`}
								>Next consequences</a
							>{/if}
					</nav>
					{#if preview.status === 'Ready'}<form
							method="POST"
							action={action('commitCategories')}
							use:enhance={submit}
							class="form-stack"
						>
							<input type="hidden" name="previewId" value={preview.id} /><input
								type="hidden"
								name="deckId"
								value={categories.deckId}
							/><input type="hidden" name="requestId" value={requestId} />
							<p>
								Save every consequence in this preview, including pages not currently shown. {preview.mode ===
								'Reset'
									? 'This releases Manual choices in the selected entry scope.'
									: 'All Manual choices remain unchanged.'}
							</p>
							<label
								><input type="checkbox" name="confirmPreview" value="yes" required />I reviewed this
								complete {preview.mode} preview.</label
							>
							<Button type="submit" disabled={busy || !!unavailable}
								>Save reviewed {preview.mode}</Button
							>
						</form>{/if}
				{/if}
			</section>
		{/if}
	</div>
{/snippet}
{#if mounted}
	<Button
		variant="outline"
		disabled={busy}
		onclick={(event) => {
			managerTrigger = event.currentTarget;
			managerOpen = true;
		}}>Manage adopted categories</Button
	>
	<DeckDialog
		title="Manage adopted categories"
		description="Review rules and assignments, or change local category labels."
		bind:open={managerOpen}
		pending={busy}
		returnFocus={managerTrigger}
		variant="import"
	>
		{@render managerContent()}
	</DeckDialog>
{:else}
	<details
		class="category-manager"
		open={!!preview || !!selectedCategoryId || !!recovery || !!removalRecovery}
	>
		<summary>Manage adopted categories</summary>
		{@render managerContent()}
	</details>
{/if}
<ConfirmationDialog
	open={confirmRemoval}
	title="Remove local category"
	description={`Move ${affected} entries assigned to ${current?.name ?? 'this category'} to ${categories.definitions.find((d) => d.id === replacement)?.name ?? 'Manual Uncategorized'} across all roles. Cards stay in the deck. The removed origin stays suppressed.`}
	pending={busy}
	onCancel={() => (confirmRemoval = false)}
	onCloseAutoFocus={(event) => {
		event.preventDefault();
		if (removalTrigger?.isConnected) removalTrigger.focus();
		else document.getElementById(localControlId)?.focus();
	}}
>
	<form method="POST" action={action('removeCategory')} use:enhance={localSubmit}>
		{#if originalRemoval}{#each Object.entries(originalRemoval) as [name, value]}<input
					type="hidden"
					name={`retry${name[0].toUpperCase()}${name.slice(1)}`}
					value={value ?? ''}
				/>{/each}{/if}
		<input type="hidden" name="deckId" value={categories.deckId} /><input
			type="hidden"
			name="categoryId"
			value={selected}
		/><input type="hidden" name="replacementCategoryId" value={replacement} /><input
			type="hidden"
			name="expectedDecisionRevision"
			value={removalRevision}
		/><input type="hidden" name="requestId" value={removalRequestId} /><input
			type="hidden"
			name="confirmRemoval"
			value="yes"
		/>
		<Button type="submit" variant="destructive" disabled={busy || !!unavailable}
			>Remove and save replacement</Button
		>
	</form>
</ConfirmationDialog>

<style>
	.category-manager {
		margin: 1rem 0;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.category-manager summary {
		cursor: pointer;
	}
	form,
	fieldset,
	section {
		margin-top: 1rem;
		min-width: 0;
	}
	fieldset {
		border: 1px solid var(--border);
		padding: 1rem;
	}
	label {
		display: block;
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
	}
</style>
