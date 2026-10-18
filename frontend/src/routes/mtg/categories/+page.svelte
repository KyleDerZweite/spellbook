<script lang="ts">
	import {
		readCategoryLibraryPage,
		captureCategoryLibraryQuery
	} from '#lib/categories/library-read.ts';
	import { describeCategoryRule } from '#lib/categories/rule-summary.ts';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '$app/forms';
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
	let library = $state(untrack(() => data.library));
	let libraryReadError = $state('');
	let editorForm: HTMLFormElement;
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
				Reusable meanings for new decks. Older decks keep their adopted definitions.
			</p>{/snippet}
		{#snippet actions()}<Button href="/mtg/decks" variant="outline">Decks</Button>{/snippet}
	</WorkspaceHeader>
	<SavedStateStatus resource={librarySubscription} />
	<nav class="tabs" aria-label="Category scope">
		<a
			href="?scope=entry"
			onclick={editor.reopen}
			aria-current={data.scope === 'entry' ? 'page' : undefined}>Deck entries</a
		><a
			href="?scope=deck"
			onclick={editor.reopen}
			aria-current={data.scope === 'deck' ? 'page' : undefined}>Whole decks</a
		>
	</nav>
	{#if data.scope === 'deck'}<p class="notice">
			New Decks adopt whole-deck definitions. Existing Decks adopt changed meanings through explicit
			whole-deck Review/Reset.
		</p>{/if}
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
	<div class="library-columns">
		<section aria-label="Reusable definitions">
			<h2>{data.scope === 'entry' ? 'Entry definitions' : 'Whole-deck definitions'}</h2>
			{#if !library.total}<p class="muted">
					No custom definitions in this scope. Create one using explicit criteria.
				</p>{/if}
			{#each library.definitions as definition (definition.originId)}
				<article class="definition">
					<h3>{definition.current.name}</h3>
					<p>{definition.current.meaning || 'No meaning supplied.'}</p>
					<p>{describeCategoryRule(definition.current.rule, editor.choices)}</p>
					<p class="muted">
						Version {definition.current.version}. Priority {definition.current.priority}. Display
						order {definition.current.displayOrder}. {definition.archived
							? 'Archived for future adoption.'
							: 'Active for new decks.'}
					</p>
					<Button
						variant="outline"
						href={`?scope=${data.scope}&edit=${definition.originId}`}
						onclick={editor.reopen}>Edit reusable definition</Button
					>
					<form method="POST" action="?/archive" use:enhance={submit}>
						<input type="hidden" name="requestId" value={data.draft.requestId} /><input
							type="hidden"
							name="originId"
							value={definition.originId}
						/><input type="hidden" name="expectedLibraryRevision" value={library.revision} /><input
							type="hidden"
							name="archived"
							value={String(!definition.archived)}
						/><input type="hidden" name="scope" value={data.scope} />
						<Button type="submit" variant="ghost" disabled={editor.busy}
							>{definition.archived
								? 'Restore for future decks'
								: 'Archive for future decks'}</Button
						>
					</form>
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
			{#if data.scope === 'entry'}<details>
					<summary>Independent starters</summary>
					<p>
						Lands, Board wipes, Counterspells, Removal, Ramp, Draw, Protection and Recursion remain
						separate fallbacks after custom rules. Starter traits use imported Oracle Tags; Lands
						uses card type and Ramp excludes Lands.
					</p>
				</details>{/if}
		</section>
		<section aria-label="Definition editor">
			<h2>{editor.draft.originId ? 'Edit reusable meaning' : 'New reusable definition'}</h2>
			<p class="muted">
				Name and meaning do not classify a card. The explicit criteria below do. Lower priority
				numbers are evaluated first; display order only arranges groups.
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
					>Meaning<textarea
						class="input"
						name="meaning"
						maxlength="4000"
						rows="3"
						bind:value={editor.draft.meaning}></textarea></label
				>
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
								checked={editor.draft.roles.includes(role as (typeof editor.draft.roles)[number])}
							/>{role}</label
						>{/each}
				</fieldset>
				<RuleEditor rule={editor.draft.rule} scope={editor.draft.scope} choices={editor.choices} />
				<Button
					type="submit"
					name="ruleAction"
					value="update"
					variant="outline"
					disabled={editor.busy}>Update criteria</Button
				>
				<fieldset>
					<legend>Find source criteria</legend>
					<p>
						Commander Spellbook source: {editor.choices.combo?.source.availability ??
							'Unavailable'}. Search returns up to 50 outcomes. Previously selected outcomes stay
						available for editing.
					</p>
					<label>Oracle Tag name<input class="input" name="tagQuery" maxlength="200" /></label
					><label>Card name<input class="input" name="cardQuery" maxlength="200" /></label><label
						>Combo outcome name<input class="input" name="outcomeQuery" maxlength="200" /></label
					><Button
						type="submit"
						name="ruleAction"
						value="choices"
						variant="outline"
						disabled={editor.busy}>Find Tags, cards and outcomes</Button
					>
				</fieldset>
				<label
					><input
						type="checkbox"
						name="confirmRetainedRule"
						checked={editor.draft.confirmRetainedRule}
					/>I confirm that the retained criteria express the edited meaning.</label
				>
				<p class="muted">
					Missing facts stay Unknown, even under "Does not match". Higher-priority Unknown leaves
					classification Pending. Saving creates an immutable version and affects future adoption.
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
				<Button type="submit" disabled={editor.busy}>Save reusable definition</Button>
				{#if editor.draft.originId}<Button
						href={`?scope=${data.scope}`}
						onclick={editor.reopen}
						variant="ghost">Start a new definition</Button
					>{/if}
			</form>
		</section>
	</div>
</div>

<style>
	.workspace {
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
	.library-columns {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 2rem;
	}
	.definition {
		border-bottom: 1px solid var(--border);
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
	@media (max-width: 800px) {
		.library-columns {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
