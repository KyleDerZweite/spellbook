<script lang="ts">
	import PlusIcon from '#lib/components/ui/PlusIcon.svelte';
	import {
		readCategoryLibraryPage,
		captureCategoryLibraryQuery
	} from '#lib/categories/library-read.ts';
	import { describeCategoryRule } from '#lib/categories/rule-summary.ts';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '$app/forms';
	import { beforeNavigate } from '$app/navigation';
	import { workspaceSavedState } from '#lib/saved-state/workspace.svelte.ts';
	import SavedStateStatus from '#lib/saved-state/SavedStateStatus.svelte';
	import type { ResourceSubscription, ReadLease } from '#lib/saved-state/workspace.ts';
	import { untrack, onDestroy, onMount } from 'svelte';
	import { CategoryLibraryReadLifetime } from '#lib/categories/library-read-lifetime.ts';
	import {
		createCategoryLibraryEditor,
		type CategoryEditorAuthority,
		type CategoryEditorReply
	} from '#lib/categories/library-editor.svelte.ts';
	import type { PageProps } from './$types';
	import Button from '#lib/components/ui/button/Button.svelte';
	import WorkspaceHeader from '#lib/components/layout/WorkspaceHeader.svelte';
	import RuleEditor from '#lib/components/categories/RuleEditor.svelte';
	let { data, form }: PageProps = $props();
	const editor = createCategoryLibraryEditor({
		seed: () => ({
			accountId: data.user?.accountId ?? null,
			scope: data.scope,
			routeOriginId: data.draft.originId,
			libraryRevision: data.library.revision,
			draft: data.draft,
			choices: data.choices
		}),
		activeAccount: () => {
			workspaceSavedState.getState();
			const accountId = data.user?.accountId;
			return accountId && workspaceSavedState.isActive(accountId) ? accountId : null;
		},
		initialAction: untrack(() => form)
	});
	beforeNavigate(({ to }) => {
		const scope = to?.url.searchParams.get('scope') === 'deck' ? 'deck' : 'entry';
		const originId = to?.url.searchParams.get('edit') || null;
		if (
			to?.route.id !== '/mtg/categories' ||
			scope !== data.scope ||
			originId !== data.draft.originId
		)
			editor.reopen();
	});
	let library = $state(untrack(() => data.library));
	let libraryReadError = $state('');
	let editorForm: HTMLFormElement;
	let editorDisclosure: HTMLDetailsElement;
	$effect(() => {
		if (
			(editor.message || editor.dirty || editor.busy || editor.draft.originId) &&
			editorDisclosure
		)
			editorDisclosure.open = true;
	});
	let librarySubscription: ResourceSubscription | undefined = $state();
	let cleared = false;
	const currentListKey = () =>
		captureCategoryLibraryQuery(data.user?.accountId ?? '', data.scope, data.library).key;
	let adoptedListKey = untrack(currentListKey);
	const listLifetime = new CategoryLibraryReadLifetime(adoptedListKey);
	onDestroy(() => {
		librarySubscription?.dispose();
		editor.dispose();
		listLifetime.destroy();
	});
	onMount(() => {
		librarySubscription = workspaceSavedState.subscribe({
			topics: ['decks'],
			clear: () => {
				editor.clear();
				listLifetime.reopen();
				cleared = true;
				library = { revision: '0', definitions: [], total: 0, offset: 0, limit: 50 };
				libraryReadError = '';
			},
			refresh: (lease) => refreshLibrary(undefined, lease)
		});
	});
	$effect(() => {
		data;
		untrack(() => librarySubscription?.invalidate());
	});
	async function refreshLibrary(authority?: CategoryEditorAuthority, lease?: ReadLease) {
		const accountId = data.user?.accountId ?? '';
		const query = captureCategoryLibraryQuery(accountId, data.scope, data.library);
		if (authority && !authority.current()) return;
		listLifetime.setKey(query.key);
		const pageRead = listLifetime.capture();
		const currentRead = () => {
			return (
				(!authority || authority.current()) &&
				!!accountId &&
				workspaceSavedState.isActive(accountId) &&
				listLifetime.current(pageRead, currentListKey()) &&
				(!lease || lease.current())
			);
		};
		try {
			const read = await readCategoryLibraryPage(
				{ ...query, signal: lease?.signal },
				async (url, options) => {
					const response = await fetch(url, options);
					if (response.status === 401 && currentRead()) workspaceSavedState.expire();
					return response;
				},
				currentRead
			);
			if (!read) return;
			if (BigInt(read.revision) >= BigInt(library.revision)) library = read;
			libraryReadError = '';
		} catch (cause) {
			if (lease?.current()) throw cause;
			if (currentRead())
				libraryReadError =
					'Current Library evidence is unavailable. Confirmed receipts and your draft are retained.';
		}
	}
	$effect(() => {
		const incoming = data;
		const listKey = currentListKey();
		workspaceSavedState.getState();
		const authenticated = !!incoming.user && workspaceSavedState.isActive(incoming.user.accountId);
		untrack(() => {
			listLifetime.setKey(listKey);
			if (cleared && !authenticated) return;
			if (cleared || adoptedListKey !== listKey) {
				cleared = false;
				adoptedListKey = listKey;
				library = incoming.library;
				libraryReadError = '';
			} else if (BigInt(incoming.library.revision) >= BigInt(library.revision)) {
				library = incoming.library;
			}
		});
	});
	const submit: SubmitFunction<CategoryEditorReply, CategoryEditorReply> = ({
		cancel,
		formData,
		action
	}) => {
		const submission = editor.beginSubmission(action.search, formData, new FormData(editorForm));
		if (!submission) {
			cancel();
			return;
		}
		const write = librarySubscription?.beginWrite();
		return async ({ result, update }) => {
			try {
				if (write && !write.current()) return;
				const completed = submission.complete(result, new FormData(editorForm));
				if (completed?.redirect) await update({ reset: false, refreshAll: false });
				if (completed?.refresh) await refreshLibrary(completed.refresh);
			} finally {
				write?.complete();
				submission.finish();
			}
		};
	};
</script>

<svelte:head><title>Category Library | Spellbook</title></svelte:head>
<div class="workspace">
	<WorkspaceHeader title="Category Library">
		{#snippet metadata()}<p class="muted">
				Your reusable categories for new decks. Existing decks keep their saved versions.
			</p>{/snippet}
		{#snippet actions()}<Button href="/mtg/decks" variant="outline">Decks</Button>{/snippet}
	</WorkspaceHeader>
	<SavedStateStatus resource={librarySubscription} />
	<nav class="tabs" aria-label="Category scope">
		<a
			href="?scope=entry"
			onclick={editor.reopen}
			aria-current={data.scope === 'entry' ? 'page' : undefined}
			><i class="ms ms-hand" aria-hidden="true"></i> Cards in decks</a
		><a
			href="?scope=deck"
			onclick={editor.reopen}
			aria-current={data.scope === 'deck' ? 'page' : undefined}
			><i class="ms ms-library" aria-hidden="true"></i> Whole decks</a
		>
	</nav>
	<p class="scope-help">
		{#if data.scope === 'entry'}
			Group cards inside the deck editor. For example, Lands groups cards with the Land type. Each
			entry has one primary category for all its copies.
		{:else}
			Group entire decks in the Deck Library. For example, a category can require at least ten
			Creature copies. A deck can belong to several categories.
		{/if}
	</p>

	{#if editor.message}<p role="status" class="notice">{editor.message}</p>{/if}
	{#if libraryReadError}<p role="alert" class="notice">{libraryReadError}</p>
		<Button variant="outline" onclick={() => refreshLibrary()}>Refresh Library</Button>{/if}
	{#if editor.originalRetry}<form
			method="POST"
			action={editor.originalRetry.action}
			use:enhance={submit}
		>
			{#each editor.originalRetry.fields as [name, value]}<input
					type="hidden"
					{name}
					{value}
				/>{/each}
			<p>The original submission is retained independently of newer edits.</p>
			<Button type="submit" variant="outline" disabled={editor.busy}
				>Retry original submission</Button
			>
		</form>{/if}
	<div class="library-content">
		<section aria-label="Reusable definitions">
			<h2>Your categories</h2>
			{#if !library.total}<p class="muted">
					{data.scope === 'entry'
						? 'No custom categories yet. The starter categories below are available for new decks.'
						: 'No whole-deck categories yet. Create a category and choose which cards a deck must contain.'}
				</p>{/if}
			{#each library.definitions as definition (definition.originId)}
				<article class="definition">
					<h3>{definition.current.name}</h3>
					<p>{definition.current.meaning || 'No description supplied.'}</p>
					<p>{describeCategoryRule(definition.current.rule, editor.choices)}</p>
					<Button
						variant="outline"
						href={`?scope=${data.scope}&edit=${definition.originId}`}
						onclick={editor.reopen}>Edit category</Button
					>
					<details class="definition-settings">
						<summary
							>{definition.archived ? 'Archived' : 'Active for new decks'} · Version {definition
								.current.version}</summary
						>
						<p class="muted">
							Version {definition.current.version}. Priority {definition.current.priority}. Display
							order {definition.current.displayOrder}. {definition.archived
								? 'Archived for future adoption.'
								: 'Active for new decks.'}
						</p>
						<form method="POST" action="?/archive" use:enhance={submit}>
							<input type="hidden" name="requestId" value={data.draft.requestId} /><input
								type="hidden"
								name="originId"
								value={definition.originId}
							/><input
								type="hidden"
								name="expectedLibraryRevision"
								value={library.revision}
							/><input type="hidden" name="archived" value={String(!definition.archived)} /><input
								type="hidden"
								name="scope"
								value={data.scope}
							/>
							<Button type="submit" variant="ghost" disabled={editor.busy}
								>{definition.archived
									? 'Restore for future decks'
									: 'Archive for future decks'}</Button
							>
						</form>
					</details>
				</article>
			{/each}
			<nav aria-label="Definition pages">
				{#if library.offset > 0}<a
						href={`?scope=${data.scope}&offset=${Math.max(0, library.offset - 50)}${data.draft.originId ? `&edit=${encodeURIComponent(data.draft.originId)}` : ''}`}
						>Previous</a
					>{/if}{#if library.offset + 50 < library.total}<a
						href={`?scope=${data.scope}&offset=${library.offset + 50}${data.draft.originId ? `&edit=${encodeURIComponent(data.draft.originId)}` : ''}`}
						>Next</a
					>{/if}
			</nav>
			{#if data.scope === 'entry'}
				<div class="starters">
					<h3>Starter categories</h3>
					<ul class="starter-list" aria-label="Available starter categories">
						{#each [['Lands', 'land'], ['Board wipes', 'sorcery'], ['Counterspells', 'instant'], ['Removal', 'exile'], ['Ramp', 'tap'], ['Draw', 'hand'], ['Protection', 'defense-border'], ['Recursion', 'flashback']] as [name, icon]}
							<li><i class={`ms ms-${icon}`} aria-hidden="true"></i>{name}</li>
						{/each}
					</ul>
					<p class="muted">
						Used after your custom rules. Lands uses card type; the other starters use imported
						Oracle Tags. Ramp excludes Lands.
					</p>
				</div>
			{/if}
		</section>
		<details
			class="category-editor"
			bind:this={editorDisclosure}
			open={!!editor.draft.originId || editor.dirty || !!editor.message || !!form}
		>
			<summary>{editor.draft.originId ? 'Edit category' : 'New category'}</summary>
			<div class="editor-content">
				<p class="muted">
					Choose a name, then set the matching criteria. The name and description alone do not
					classify cards or decks.
				</p>
				<form
					method="POST"
					action="?/save"
					use:enhance={submit}
					bind:this={editorForm}
					oninput={editor.edit}
					onchange={editor.edit}
					class="form-stack"
				>
					<input type="hidden" name="requestId" value={editor.draft.requestId} /><input
						type="hidden"
						name="originId"
						value={editor.draft.originId ?? ''}
					/><input
						type="hidden"
						name="expectedLibraryRevision"
						value={editor.draft.expectedLibraryRevision}
					/><input type="hidden" name="scope" value={editor.draft.scope} /><input
						type="hidden"
						name="rule"
						value={JSON.stringify(editor.draft.rule)}
					/>
					<label
						>Name<input
							class="input"
							name="name"
							required
							maxlength="128"
							bind:value={editor.draft.name}
						/></label
					>
					<label
						>Description<textarea
							class="input"
							name="meaning"
							maxlength="4000"
							rows="3"
							bind:value={editor.draft.meaning}></textarea></label
					>
					<RuleEditor
						rule={editor.draft.rule}
						scope={editor.draft.scope}
						choices={editor.choices}
					/>
					<Button
						type="submit"
						name="ruleAction"
						value="update"
						variant="outline"
						disabled={editor.busy}>Update criteria</Button
					>
					<details class="advanced">
						<summary>Priority, display order and deck sections</summary>
						<p class="muted">
							Lower priority numbers match first. Display order arranges groups. Participating roles
							select which deck sections the rule checks.
						</p>
						<div class="advanced-fields">
							<label
								>Priority<input
									class="input"
									type="number"
									name="priority"
									min="-2147483648"
									max="2147483647"
									bind:value={editor.draft.priority}
								/></label
							>
							<label
								>Display order<input
									class="input"
									type="number"
									name="displayOrder"
									min="-2147483648"
									max="2147483647"
									bind:value={editor.draft.displayOrder}
								/></label
							>
							<fieldset>
								<legend>Participating roles</legend
								>{#each ['main', 'sideboard', 'commander', 'companion'] as role}<label
										><input
											type="checkbox"
											name="roles"
											value={role}
											checked={editor.draft.roles.includes(
												role as (typeof editor.draft.roles)[number]
											)}
										/>{role}</label
									>{/each}
							</fieldset>
						</div>
					</details>
					<details
						class="advanced"
						open={!!editor.message &&
							(!!editor.choices.tags.length ||
								!!editor.choices.cards.length ||
								!!editor.choices.combo?.outcomes.length)}
					>
						<summary>Find Oracle Tags, cards or combo outcomes</summary>
						<fieldset>
							<legend>Source search</legend>
							<p>
								Commander Spellbook source: {editor.choices.combo?.source.availability ??
									'Unavailable'}. Search returns up to 50 outcomes. Previously selected outcomes
								stay available for editing.
							</p>
							<label>Oracle Tag name<input class="input" name="tagQuery" maxlength="200" /></label
							><label>Card name<input class="input" name="cardQuery" maxlength="200" /></label
							><label
								>Combo outcome name<input
									class="input"
									name="outcomeQuery"
									maxlength="200"
								/></label
							><Button
								type="submit"
								name="ruleAction"
								value="choices"
								variant="outline"
								disabled={editor.busy}>Find Tags, cards and outcomes</Button
							>
						</fieldset>
					</details>
					<label
						><input
							type="checkbox"
							name="confirmRetainedRule"
							checked={editor.draft.confirmRetainedRule}
						/>I confirm that these criteria match the category description.</label
					>
					<p class="muted">
						Missing facts stay Unknown, even under "Does not match". Higher-priority Unknown leaves
						classification Pending. Saving creates a new version for new decks. Existing decks adopt
						this version only through Review/Reset.
					</p>
					{#if editor.dirty}<p role="status" class="muted">Unsaved definition draft</p>{/if}
					{#if library.revision !== editor.draft.expectedLibraryRevision}<p
							role="alert"
							class="notice"
						>
							The Library changed. Your unsaved draft is retained.
						</p>
						<label
							><input type="checkbox" name="rebaseLibraryRevision" value={library.revision} />I
							reviewed the current Library and want to save this draft against its current revision.</label
						>{/if}
					<Button type="submit" disabled={editor.busy}
						>{#if !editor.draft.originId}<PlusIcon />{/if}Save category</Button
					>
					{#if editor.draft.originId}<Button
							href={`?scope=${data.scope}`}
							onclick={editor.reopen}
							variant="ghost"><PlusIcon />Start a new category</Button
						>{/if}
				</form>
			</div>
		</details>
	</div>
</div>

<style>
	.workspace {
		font-size: 0.875rem;
		width: min(100%, 80rem);
		margin: 0 auto;
		padding: 1rem;
		min-width: 0;
	}
	.tabs {
		display: flex;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	.tabs a[aria-current] {
		font-weight: 600;
		text-decoration: underline;
	}
	.library-content {
		display: grid;
		gap: 2rem;
		max-width: 60rem;
	}
	.scope-help {
		max-width: 65ch;
		margin-bottom: 1.5rem;
	}
	.starters {
		margin-top: 1.5rem;
	}
	.starter-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.5rem;
		list-style: none;
		padding: 0;
		margin: 1rem 0;
	}
	.starter-list li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.starter-list i {
		width: 1.25rem;
		text-align: center;
	}
	.category-editor {
		border-top: 1px solid var(--color-border);
		padding-top: 1rem;
	}
	.category-editor > summary {
		font-size: 1.125rem;
	}
	summary {
		cursor: pointer;
		padding: 0.5rem 0;
	}
	summary:focus-visible {
		outline: 2px solid var(--color-ring);
		outline-offset: 3px;
	}
	.editor-content {
		max-width: 46rem;
		padding-top: 1rem;
	}
	.form-stack,
	.advanced-fields {
		display: grid;
		gap: 1rem;
	}
	.form-stack > label,
	.advanced-fields > label {
		display: grid;
		gap: 0.5rem;
	}
	.form-stack > label:has(input[type='checkbox']) {
		display: block;
	}
	.advanced {
		border-top: 1px solid var(--color-border);
		padding-top: 0.5rem;
	}
	.advanced p {
		margin: 0.5rem 0 1rem;
	}
	.definition-settings {
		margin-top: 0.5rem;
	}
	h2,
	h3 {
		margin-bottom: 0.5rem;
	}
	p {
		line-height: 1.6;
	}

	.definition {
		border-bottom: 1px solid var(--color-border);
		padding: 1rem 0;
		overflow-wrap: anywhere;
	}
	.definition form {
		display: inline-block;
	}
	fieldset {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	section {
		min-width: 0;
	}
	@media (max-width: 600px) {
		.tabs {
			flex-wrap: wrap;
		}
		.starter-list {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
