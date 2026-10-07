<script lang="ts">
	import { page } from '$app/state';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { onDestroy, untrack } from 'svelte';
	import type { CardDocument } from '#lib/search/types.ts';
	import type { DeckChoicePage } from '@spellbook/contracts/decks.ts';
	import { workspaceSavedState } from '#lib/saved-state/workspace.svelte.ts';
	import { readSavedJSON } from '#lib/saved-state/read.ts';
	import {
		createDeckAdditionDraft,
		deckChoiceOptions,
		selectedDeckChoice,
		captureAddition,
		retainAddition,
		deckAdditionConfirmed,
		DECK_ROLES,
		type DeckAdditionDraft,
		type DeckAdditionIntent
	} from '#lib/cards/addition-drafts.ts';
	import Select from '#lib/components/ui/select/Select.svelte';
	interface Props {
		card: CardDocument;
		callerPending?: boolean;
		onPendingChange?: (pending: boolean) => void;
		draft?: DeckAdditionDraft;
	}
	let { card, callerPending = false, onPendingChange, draft: retained }: Props = $props();
	let local = $state(createDeckAdditionDraft());
	let draft = $derived(retained ?? local);
	let query = $state('');
	let offset = $state(0);
	let choices: DeckChoicePage | null = $state(null);
	let readError = $state('');
	let loading = $state(true);
	let pending = $state(false);
	let mounted = true;
	const id = $props.id();
	const nativeRequestId = untrack(() =>
		page.data.requestId ? `${page.data.requestId}:deck:${card.id}` : crypto.randomUUID()
	);
	let account = $derived(page.data.user?.accountId ?? null);
	let authorized = $derived(
		!!account &&
			workspaceSavedState.getState() !== 'expired' &&
			workspaceSavedState.isActive(account)
	);
	let selected = $derived.by(() => selectedDeckChoice(choices, draft.deckId));
	let blocked = $derived(pending || callerPending || !authorized);
	const resource = workspaceSavedState.subscribe({
		topics: ['decks'],
		clear() {
			if (!mounted) return;
			choices = null;
			query = '';
			offset = 0;
			loading = false;
			readError = '';
			Object.assign(draft, createDeckAdditionDraft());
			pending = false;
			onPendingChange?.(false);
		},
		async refresh(lease) {
			const captured = { account, query, offset, deckId: draft.deckId, draft };
			const current = () =>
				mounted &&
				lease.current() &&
				account === captured.account &&
				draft === captured.draft &&
				query === captured.query &&
				offset === captured.offset &&
				draft.deckId === captured.deckId;
			const params = new URLSearchParams({
				query: captured.query,
				offset: String(captured.offset),
				limit: '20'
			});
			if (captured.deckId) params.set('selectedDeckId', captured.deckId);
			loading = true;
			try {
				const value = await readSavedJSON<DeckChoicePage>(
					'/api/mobile/v1/mtg/decks/choices?' + params,
					{ signal: lease.signal, current }
				);
				if (!current() || !value) return;
				choices = value;
				readError = '';
			} catch {
				if (current()) readError = 'Deck choices could not be loaded. Retry the read.';
			} finally {
				if (current()) loading = false;
			}
		}
	});
	$effect(() => {
		const next = account;
		const state = workspaceSavedState.getState();
		untrack(() => {
			if (!next || state === 'expired') {
				Object.assign(draft, createDeckAdditionDraft());
				choices = null;
			} else if (workspaceSavedState.isActive(next) && draft.accountId !== next) {
				Object.assign(draft, createDeckAdditionDraft(), { accountId: next });
				choices = null;
				resource.invalidate();
			}
		});
	});
	$effect(() => {
		query;
		offset;
		draft.deckId;
		untrack(() => {
			choices = null;
			readError = '';
			loading = true;
			resource.invalidate();
		});
	});
	onDestroy(() => {
		mounted = false;
		resource.dispose();
		onPendingChange?.(false);
	});
	const add: SubmitFunction = ({ formData, submitter, cancel }) => {
		const retry = submitter?.getAttribute('name') === 'retryOriginal';
		if (blocked || (!retry && (!selected || loading || readError))) {
			cancel();
			return;
		}
		const entered: DeckAdditionIntent = {
			requestId: '',
			deckName: selected?.name,
			printingName: card.name,
			deckId: String(formData.get('deckId')),
			catalogCardId: card.id,
			role: String(formData.get('role')),
			quantity: String(formData.get('quantity'))
		};
		const retryId = retry ? (submitter?.getAttribute('value') ?? null) : null;
		const intent = captureAddition(entered, draft.uncertain, retryId, () => crypto.randomUUID());
		draft.uncertain = retainAddition(draft.uncertain, intent);
		for (const [key, value] of Object.entries(intent)) formData.set(key, value);
		const owner = account;
		const submittedDraft = draft;
		const submittedPrinting = card.id;
		const write = workspaceSavedState.beginWrite(['decks']);
		pending = true;
		onPendingChange?.(true);
		draft.error = '';
		return async ({ result, update }) => {
			try {
				if (
					!mounted ||
					account !== owner ||
					submittedDraft !== draft ||
					card.id !== submittedPrinting ||
					!write.current()
				)
					return;
				if (
					result.type === 'success' &&
					result.data?.success &&
					deckAdditionConfirmed(result.data.acknowledgement, intent)
				) {
					draft.acknowledgement = result.data.acknowledgement;
					draft.message = `Added ${intent.quantity} of ${intent.printingName ?? intent.catalogCardId} to ${intent.deckName ?? intent.deckId}.`;
					draft.uncertain = draft.uncertain.filter((item) => item.requestId !== intent.requestId);
					draft.requestId = crypto.randomUUID();
				} else if (result.type === 'redirect') {
					await update({ reset: false });
				} else {
					const uncertain = result.type !== 'failure' || result.status >= 500;
					if (uncertain) draft.uncertain = retainAddition(draft.uncertain, intent);
					else
						draft.uncertain = draft.uncertain.filter((item) => item.requestId !== intent.requestId);
					draft.error =
						result.type === 'failure' && typeof result.data?.message === 'string'
							? result.data.message
							: 'Could not confirm this addition. Retry the original request.';
					if (result.type === 'failure' && result.status === 401) workspaceSavedState.expire();
				}
			} finally {
				write.complete();
				pending = false;
				if (mounted && account === owner) onPendingChange?.(false);
			}
		};
	};
</script>

<div class="deck-add">
	<form
		onsubmit={(event) => {
			event.preventDefault();
			offset = 0;
			resource.invalidate();
		}}
	>
		<label class="label" for={`${id}-query`}>Find a Deck</label>
		<div class="flex gap-2">
			<input
				id={`${id}-query`}
				class="input min-w-0 flex-1"
				type="search"
				maxlength="200"
				bind:value={query}
				disabled={blocked}
			/><button class="btn btn-secondary" disabled={blocked}>Find</button>
		</div>
	</form>
	<form
		method="POST"
		action="/mtg/search?/addToDeck"
		use:enhance={add}
		aria-describedby={draft.error ? `${id}-error` : undefined}
		aria-busy={pending}
		class="deck-add"
	>
		<input type="hidden" name="requestId" value={draft.requestId || nativeRequestId} />
		<input type="hidden" name="catalogCardId" value={card.id} />
		<label class="label" for={`${id}-deck`}>Deck</label>
		<Select
			id={`${id}-deck`}
			name="deckId"
			label="Deck"
			value={draft.deckId}
			onchange={(value) => {
				draft.deckId = value;
			}}
			options={deckChoiceOptions(choices)}
			disabled={blocked || loading || !!readError}
		/>
		{#if loading}<p role="status" class="text-sm text-text-secondary">
				Loading Decks...
			</p>{:else if readError}<p role="alert" class="text-sm text-error">{readError}</p>
			<button
				class="btn btn-secondary"
				type="button"
				onclick={() => resource.invalidate()}
				disabled={blocked}>Retry Deck read</button
			>{:else if !choices?.items.length}<p class="text-sm text-text-secondary">
				No matching Decks. Create a Deck or change the search.
			</p>{/if}
		{#if draft.deckId && !loading && !readError && !selected}<p
				role="alert"
				class="text-sm text-error"
			>
				The selected Deck is no longer available. Choose another Deck.
			</p>{/if}
		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				class="btn btn-secondary"
				onclick={() => (offset = Math.max(0, offset - 20))}
				disabled={blocked || loading || !offset}>Previous Decks</button
			><button
				type="button"
				class="btn btn-secondary"
				onclick={() => {
					if (choices?.nextOffset != null) offset = choices.nextOffset;
				}}
				disabled={blocked || loading || choices?.nextOffset == null}>Next Decks</button
			>
		</div>
		<div class="fields">
			<div>
				<label class="label" for={`${id}-role`}>Section</label><Select
					id={`${id}-role`}
					name="role"
					label="Section"
					bind:value={draft.role}
					options={DECK_ROLES}
					disabled={blocked}
				/>
			</div>
			<div>
				<label class="label" for={`${id}-quantity`}>Quantity</label><input
					id={`${id}-quantity`}
					class="input"
					name="quantity"
					type="number"
					min="1"
					max="10000"
					step="1"
					required
					bind:value={draft.quantity}
					disabled={blocked}
				/>
			</div>
		</div>
		<button
			class="btn btn-primary"
			type="submit"
			disabled={blocked || loading || !!readError || !selected}
			>{pending ? 'Adding...' : 'Add to Deck'}</button
		>
		{#each draft.uncertain as original (original.requestId)}<p class="text-sm text-text-secondary">
				Original unconfirmed addition: {original.quantity} of {original.printingName ??
					original.catalogCardId} to {original.deckName ?? original.deckId}, {original.role}. New
				controls are a separate intent.
			</p>
			<button
				class="btn btn-secondary"
				type="submit"
				name="retryOriginal"
				value={original.requestId}
				formnovalidate
				disabled={blocked}>Retry original Deck addition</button
			>{/each}
		{#if draft.error}<p id={`${id}-error`} role="alert" class="text-sm text-error">
				{draft.error}
			</p>{/if}
		<p
			role="status"
			aria-live="polite"
			class:sr-only={!draft.message}
			class="text-sm text-text-secondary"
		>
			{draft.message}
		</p>
	</form>
</div>

<style>
	.deck-add {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		min-width: 0;
	}
	.fields {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 0.75rem;
	}
	.deck-add :global(button),
	.deck-add :global(input) {
		min-height: 44px;
	}
	.fields > div {
		min-width: 0;
	}
</style>
