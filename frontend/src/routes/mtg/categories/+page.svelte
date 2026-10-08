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
	import { CategoryEditorLifetime, categoryFormIdentity } from '#lib/categories/editor-lifetime.ts';
	import type {
		SaveDefinitionInput,
		LibraryAcknowledgement
	} from '@spellbook/contracts/category-library.ts';
	import type { PageProps } from './$types';
	import Button from '#lib/components/ui/button/Button.svelte';
	import WorkspaceHeader from '#lib/components/layout/WorkspaceHeader.svelte';
	import RuleEditor from '#lib/components/categories/RuleEditor.svelte';
	let { data, form }: PageProps = $props();
	let busy = $state(false),
		dirty = $state(false);
	let draft = $state(
		untrack(() => (form && 'draft' in form && form.draft ? form.draft : data.draft))
	);
	let choices = $state(untrack(() => data.choices));
	let library = $state(untrack(() => data.library));
	let libraryReadError = $state('');
	let editorKey = untrack(
		() => `${data.user?.accountId ?? ''}:${data.scope}:${data.draft.originId ?? ''}`
	);
	let message = $state(untrack(() => form?.message ?? ''));
	let confirmation = $state<LibraryAcknowledgement | null>(null);
	let uncertain = $state<{ action: string; fields: [string, string][] } | null>(null);
	let editorForm: HTMLFormElement;
	let librarySubscription: ResourceSubscription | undefined = $state();
	let cleared = $state(false);
	const lifetime = new CategoryEditorLifetime(editorKey);
	const currentKey = () =>
		`${data.user?.accountId ?? ''}:${data.scope}:${data.draft.originId ?? ''}`;
	const currentListKey = () =>
		captureCategoryLibraryQuery(data.user?.accountId ?? '', data.scope, data.library).key;
	const listLifetime = new CategoryEditorLifetime(untrack(currentListKey));
	onDestroy(() => {
		librarySubscription?.dispose();
		lifetime.destroy();
		listLifetime.destroy();
	});
	function reopenEditor() {
		lifetime.reopen();
		dirty = false;
		busy = false;
		uncertain = null;
		confirmation = null;
		message = '';
	}
	onMount(() => {
		librarySubscription = workspaceSavedState.subscribe({
			topics: ['decks'],
			clear: () => {
				lifetime.reopen();
				listLifetime.reopen();
				cleared = true;
				busy = false;
				dirty = false;
				confirmation = null;
				uncertain = null;
				message = '';
				choices = { tags: [], cards: [] };
				library = { revision: '0', definitions: [], total: 0, offset: 0, limit: 50 };
				draft = {
					requestId: '',
					originId: null,
					expectedLibraryRevision: '0',
					scope: data.scope,
					name: '',
					meaning: '',
					priority: 0,
					displayOrder: 0,
					roles: ['main'],
					rule: { op: 'all', children: [] },
					confirmRetainedRule: false
				};
				libraryReadError = '';
			},
			refresh: (lease) => refreshLibrary(undefined, lease)
		});
	});
	$effect(() => {
		data;
		untrack(() => librarySubscription?.invalidate());
	});
	async function refreshLibrary(
		captured = lifetime.capture('Library-read', '', () => crypto.randomUUID()),
		lease?: ReadLease
	) {
		const key = currentKey();
		const query = captureCategoryLibraryQuery(data.user?.accountId ?? '', data.scope, data.library);
		if (!lifetime.current(captured, key)) return;
		listLifetime.setKey(query.key);
		const pageRead = listLifetime.capture('Library-read', '', () => crypto.randomUUID());
		const currentRead = () =>
			lifetime.current(captured, currentKey()) &&
			listLifetime.current(pageRead, currentListKey()) &&
			(!lease || lease.current());
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
		listLifetime.setKey(currentListKey());
		const key = currentKey();
		const incoming = data;
		workspaceSavedState.getState();
		const authenticated = !!incoming.user && workspaceSavedState.isActive(incoming.user.accountId);
		untrack(() => {
			if (cleared && !authenticated) return;
			if (lifetime.setKey(key) || cleared) {
				cleared = false;
				editorKey = key;
				draft = incoming.draft;
				choices = incoming.choices;
				library = incoming.library;
				libraryReadError = '';
				dirty = false;
				busy = false;
				message = '';
				confirmation = null;
				uncertain = null;
			} else if (
				!dirty &&
				!busy &&
				BigInt(incoming.library.revision) >= BigInt(draft.expectedLibraryRevision)
			) {
				draft = incoming.draft;
				choices = incoming.choices;
			}
			if (BigInt(incoming.library.revision) >= BigInt(library.revision)) library = incoming.library;
		});
	});
	const submit: SubmitFunction = ({ cancel, formData, action }) => {
		if (busy) {
			cancel();
			return;
		}
		const write = librarySubscription?.beginWrite();
		lifetime.setKey(currentKey());
		const payload =
			action.search +
			JSON.stringify([...formData.entries()].filter(([name]) => name !== 'requestId'));
		const captured = lifetime.capture(
			payload,
			categoryFormIdentity(action.search.includes('/save') ? formData : new FormData(editorForm)),
			() => crypto.randomUUID()
		);
		formData.set('requestId', captured.requestId);
		const original = {
			action: action.search,
			fields: [...formData.entries()].map(
				([name, value]) => [name, String(value)] as [string, string]
			)
		};
		busy = true;
		return async ({ result, update }) => {
			try {
				if ((write && !write.current()) || !lifetime.current(captured, currentKey())) return;
				const unchanged = lifetime.unchanged(
					captured,
					currentKey(),
					categoryFormIdentity(new FormData(editorForm))
				);
				if (result.type === 'error') {
					uncertain = original;
					message =
						'Could not confirm this submission. Your draft is retained. Retry the same submission.';
					return;
				}
				if (result.type === 'redirect') {
					// Authentication redirects carry no saved definition acknowledgement.
					if (unchanged) await update({ reset: false, invalidateAll: false });
					return;
				}
				const completed = result.data as {
					draft?: SaveDefinitionInput;
					choices?: typeof choices;
					message?: string;
					acknowledgement?: LibraryAcknowledgement;
				};
				if (completed.acknowledgement) {
					confirmation = completed.acknowledgement;
					lifetime.confirmed(captured);
					uncertain = null;
					message = unchanged
						? (completed.message ?? 'Submitted definition saved.')
						: 'Submitted definition saved. Your newer edits remain unsaved.';
					// Only identity and the acknowledged base advance; newer controls remain untouched.
					if (action.search.includes('/save')) {
						draft.originId = confirmation.originId;
						draft.expectedLibraryRevision = confirmation.libraryRevision;
					}
					if (unchanged && completed.draft)
						draft = {
							...completed.draft,
							originId: confirmation.originId,
							expectedLibraryRevision: confirmation.libraryRevision
						};
					dirty = !unchanged || dirty;
					if (unchanged && action.search.includes('/save')) dirty = false;
					await refreshLibrary(captured);
					return;
				}
				if (result.type === 'failure' && result.status >= 500) uncertain = original;
				message =
					!unchanged && completed.draft
						? result.type === 'success'
							? 'This criteria response belongs to an earlier draft. Your newer edits are retained. Update criteria again.'
							: `${completed.message ?? 'The earlier submission failed.'} Your newer edits are retained.`
						: (completed.message ?? '');
				if (unchanged) {
					if (completed.draft) {
						draft = completed.draft;
						dirty = true;
					}
					if (completed.choices) choices = completed.choices;
				}
				if (result.type === 'success') lifetime.confirmed(captured);
			} finally {
				write?.complete();
				if (lifetime.current(captured, currentKey())) busy = false;
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
			onclick={reopenEditor}
			aria-current={data.scope === 'entry' ? 'page' : undefined}>Deck entries</a
		><a
			href="?scope=deck"
			onclick={reopenEditor}
			aria-current={data.scope === 'deck' ? 'page' : undefined}>Whole decks</a
		>
	</nav>
	{#if data.scope === 'deck'}<p class="notice">
			You can save whole-deck definitions. Automatic whole-deck classification and Review/Reset are
			not available yet.
		</p>{/if}
	{#if message}<p role="status" class="notice">{message}</p>{/if}
	{#if libraryReadError}<p role="alert" class="notice">{libraryReadError}</p>
		<Button variant="outline" onclick={() => refreshLibrary()}>Refresh Library</Button>{/if}
	{#if uncertain}<form method="POST" action={uncertain.action} use:enhance={submit}>
			{#each uncertain.fields as [name, value]}<input type="hidden" {name} {value} />{/each}
			<p>The original submission is retained independently of newer edits.</p>
			<Button type="submit" variant="outline" disabled={busy}>Retry original submission</Button>
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
					<p>{describeCategoryRule(definition.current.rule, choices)}</p>
					<p class="muted">
						Version {definition.current.version}. Priority {definition.current.priority}. Display
						order {definition.current.displayOrder}. {definition.archived
							? 'Archived for future adoption.'
							: 'Active for new decks.'}
					</p>
					<Button
						variant="outline"
						href={`?scope=${data.scope}&edit=${definition.originId}`}
						onclick={reopenEditor}>Edit reusable definition</Button
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
						<Button type="submit" variant="ghost" disabled={busy}
							>{definition.archived
								? 'Restore for future decks'
								: 'Archive for future decks'}</Button
						>
					</form>
				</article>
			{/each}
			<nav aria-label="Definition pages">
				{#if library.offset > 0}<a
						href={`?scope=${data.scope}&offset=${Math.max(0, library.offset - 50)}`}>Previous</a
					>{/if}{#if library.offset + 50 < library.total}<a
						href={`?scope=${data.scope}&offset=${library.offset + 50}`}>Next</a
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
			<h2>{draft.originId ? 'Edit reusable meaning' : 'New reusable definition'}</h2>
			<p class="muted">
				Name and meaning do not classify a card. The explicit criteria below do. Lower priority
				numbers are evaluated first; display order only arranges groups.
			</p>
			<form
				method="POST"
				action="?/save"
				use:enhance={submit}
				bind:this={editorForm}
				oninput={() => {
					dirty = true;
					lifetime.edit();
				}}
				onchange={() => {
					dirty = true;
					lifetime.edit();
				}}
				class="form-stack"
			>
				<input type="hidden" name="requestId" value={draft.requestId} /><input
					type="hidden"
					name="originId"
					value={draft.originId ?? ''}
				/><input
					type="hidden"
					name="expectedLibraryRevision"
					value={draft.expectedLibraryRevision}
				/><input type="hidden" name="scope" value={draft.scope} /><input
					type="hidden"
					name="rule"
					value={JSON.stringify(draft.rule)}
				/>
				<label
					>Name<input
						class="input"
						name="name"
						required
						maxlength="128"
						bind:value={draft.name}
					/></label
				>
				<label
					>Meaning<textarea
						class="input"
						name="meaning"
						maxlength="4000"
						rows="3"
						bind:value={draft.meaning}></textarea></label
				>
				<label
					>Priority<input
						class="input"
						type="number"
						name="priority"
						min="-2147483648"
						max="2147483647"
						bind:value={draft.priority}
					/></label
				>
				<label
					>Display order<input
						class="input"
						type="number"
						name="displayOrder"
						min="-2147483648"
						max="2147483647"
						bind:value={draft.displayOrder}
					/></label
				>
				<fieldset>
					<legend>Participating roles</legend
					>{#each ['main', 'sideboard', 'commander', 'companion'] as role}<label
							><input
								type="checkbox"
								name="roles"
								value={role}
								checked={draft.roles.includes(role as (typeof draft.roles)[number])}
							/>{role}</label
						>{/each}
				</fieldset>
				<RuleEditor rule={draft.rule} scope={draft.scope} {choices} />
				<Button type="submit" name="ruleAction" value="update" variant="outline" disabled={busy}
					>Update criteria</Button
				>
				<fieldset>
					<legend>Find source criteria</legend><label
						>Oracle Tag name<input class="input" name="tagQuery" maxlength="200" /></label
					><label>Card name<input class="input" name="cardQuery" maxlength="200" /></label><Button
						type="submit"
						name="ruleAction"
						value="choices"
						variant="outline"
						disabled={busy}>Find Tags and cards</Button
					>
				</fieldset>
				<label
					><input type="checkbox" name="confirmRetainedRule" checked={draft.confirmRetainedRule} />I
					confirm that the retained criteria express the edited meaning.</label
				>
				<p class="muted">
					Missing facts stay Unknown, even under "Does not match". Higher-priority Unknown leaves
					classification Pending. Saving creates an immutable version and affects future adoption.
				</p>
				{#if dirty}<p role="status" class="muted">Unsaved definition draft</p>{/if}
				{#if library.revision !== draft.expectedLibraryRevision}<p role="alert" class="notice">
						The Library changed. Your unsaved draft is retained.
					</p>
					<label
						><input type="checkbox" name="rebaseLibraryRevision" value={library.revision} />I
						reviewed the current Library and want to save this draft against its current revision.</label
					>{/if}
				<Button type="submit" disabled={busy}>Save reusable definition</Button>
				{#if draft.originId}<Button
						href={`?scope=${data.scope}`}
						onclick={reopenEditor}
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
