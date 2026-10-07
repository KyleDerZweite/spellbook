<script lang="ts">
	import { page } from '$app/state';
	import { untrack, onDestroy } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { workspaceSavedState } from '#lib/saved-state/workspace.svelte.ts';
	import Select from '#lib/components/ui/select/Select.svelte';
	import type { CardDocument } from '#lib/search/types.ts';
	import {
		createInventoryAdditionDraft,
		captureAddition,
		retainAddition,
		type InventoryAdditionDraft,
		type InventoryAdditionIntent
	} from '#lib/cards/addition-drafts.ts';
	import { activeGameState } from '#lib/state/activeGame.svelte.ts';

	interface Props {
		card: CardDocument;
		onPendingChange?: (pending: boolean) => void;
		callerPending?: boolean;
		actionRole?: 'primary' | 'secondary';
		draft?: InventoryAdditionDraft;
	}

	let {
		card,
		onPendingChange,
		callerPending = false,
		actionRole = 'primary',
		draft: retained
	}: Props = $props();
	let local = $state(createInventoryAdditionDraft());
	let draft = $derived(retained ?? local);
	const id = $props.id();
	const nativeRequestId = untrack(() =>
		page.data.requestId ? `${page.data.requestId}:inventory:${card.id}` : crypto.randomUUID()
	);

	let pending = $state(false);
	let mounted = true;
	let account = $derived(page.data.user?.accountId ?? null);
	let authorized = $derived(
		!!account &&
			workspaceSavedState.getState() !== 'expired' &&
			workspaceSavedState.isActive(account)
	);
	let blocked = $derived(pending || callerPending || !authorized);
	const resource = workspaceSavedState.subscribe({
		topics: ['inventory'],
		refresh: async () => {},
		clear: () => {
			if (mounted) {
				Object.assign(draft, createInventoryAdditionDraft());
				pending = false;
				onPendingChange?.(false);
			}
		}
	});
	$effect(() => {
		const next = account;
		const status = workspaceSavedState.getState();
		untrack(() => {
			if (!next || status === 'expired') Object.assign(draft, createInventoryAdditionDraft());
			else if (workspaceSavedState.isActive(next) && draft.accountId !== next)
				Object.assign(draft, createInventoryAdditionDraft(), { accountId: next });
		});
	});
	onDestroy(() => {
		mounted = false;
		resource.dispose();
		onPendingChange?.(false);
	});
	const hasAvailableFinish = $derived(card.is_nonfoil_available || card.is_foil_available);
	const add: SubmitFunction = ({ formData, submitter, cancel }) => {
		const retry = submitter?.getAttribute('name') === 'retryOriginal';
		if (blocked || (!retry && !hasAvailableFinish)) {
			cancel();
			return;
		}
		const entered: InventoryAdditionIntent = {
			requestId: '',
			printingName: card.name,
			catalogCardId: card.id,
			finish: String(formData.get('finish')),
			condition: String(formData.get('condition')),
			quantity: String(formData.get('quantity'))
		};
		const retryId = retry ? (submitter?.getAttribute('value') ?? null) : null;
		const intent = captureAddition(entered, draft.uncertain, retryId, () => crypto.randomUUID());
		draft.uncertain = retainAddition(draft.uncertain, intent);
		for (const [key, value] of Object.entries(intent)) formData.set(key, value);
		const owner = account;
		const submittedDraft = draft;
		const submittedPrinting = card.id;
		const write = workspaceSavedState.beginWrite(['inventory']);
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
					(!write.current() && (owner || result.type !== 'redirect'))
				)
					return;
				if (
					result.type === 'success' &&
					result.data?.success &&
					result.data.acknowledgement &&
					result.data.acknowledgement.requestId === intent.requestId
				) {
					draft.uncertain = draft.uncertain.filter((item) => item.requestId !== intent.requestId);
					draft.requestId = crypto.randomUUID();
					draft.message = `Added ${intent.quantity} of ${intent.printingName ?? intent.catalogCardId} to inventory.`;
				} else if (result.type === 'redirect') {
					await update({ reset: false });
				} else {
					if (result.type !== 'failure' || result.status >= 500)
						draft.uncertain = retainAddition(draft.uncertain, intent);
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
	const CONDITIONS = [
		{ value: 'NM', label: 'Near Mint' },
		{ value: 'LP', label: 'Lightly Played' },
		{ value: 'MP', label: 'Moderately Played' },
		{ value: 'HP', label: 'Heavily Played' },
		{ value: 'DMG', label: 'Damaged' }
	];

	const FINISHES = $derived([
		{ value: 'nonfoil', label: 'Nonfoil', disabled: !card.is_nonfoil_available },
		{ value: 'foil', label: 'Foil', disabled: !card.is_foil_available }
	]);

	$effect(() => {
		if (!card.is_nonfoil_available && card.is_foil_available) {
			draft.finish = 'foil';
		} else if (!card.is_foil_available) {
			draft.finish = 'nonfoil';
		}
	});
</script>

<form
	method="POST"
	action="/mtg/search?/addToInventory"
	use:enhance={add}
	class="quick-add"
	aria-busy={pending}
	aria-describedby={draft.error ? `${id}-error` : undefined}
>
	<input type="hidden" name="requestId" value={draft.requestId || nativeRequestId} />
	<input type="hidden" name="game" value={activeGameState.current} />
	<input type="hidden" name="catalogCardId" value={card.id} />
	<input type="hidden" name="canonicalCardId" value={card.oracle_id} />
	<input type="hidden" name="name" value={card.name} />
	<input type="hidden" name="setCode" value={card.set_code} />
	<input type="hidden" name="imageUri" value={card.image_uri || card.image_uri_small} />

	<div>
		<label for={`${id}-quantity`} class="label"> Quantity </label>
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={() => (draft.quantity = Math.max(1, (draft.quantity || 1) - 1))}
				aria-label="Decrease quantity"
				disabled={blocked || draft.quantity <= 1}
				class="btn btn-secondary btn-icon quantity-step"
			>
				-
			</button>
			<input
				id={`${id}-quantity`}
				type="number"
				name="quantity"
				bind:value={draft.quantity}
				disabled={blocked}
				min="1"
				max="99"
				step="1"
				required
				class="input w-20 text-center"
			/>
			<button
				type="button"
				onclick={() => (draft.quantity = Math.min(99, (draft.quantity || 1) + 1))}
				aria-label="Increase quantity"
				disabled={blocked || draft.quantity >= 99}
				class="btn btn-secondary btn-icon quantity-step"
			>
				+
			</button>
		</div>
	</div>

	<div class="inventory-attributes">
		<div>
			<label for={`${id}-finish`} class="label"> Finish </label>
			<Select
				id={`${id}-finish`}
				name="finish"
				label="Finish"
				bind:value={draft.finish}
				disabled={blocked}
				options={FINISHES}
			/>
		</div>

		<div>
			<label for={`${id}-condition`} class="label"> Condition </label>
			<Select
				id={`${id}-condition`}
				name="condition"
				label="Condition"
				bind:value={draft.condition}
				disabled={blocked}
				options={CONDITIONS}
			/>
		</div>
	</div>
	<button
		type="submit"
		disabled={blocked || !hasAvailableFinish}
		class={['btn w-full', actionRole === 'secondary' ? 'btn-secondary text-sm' : 'btn-primary']}
	>
		{pending ? 'Adding...' : 'Add to inventory'}
	</button>
	{#each draft.uncertain as original (original.requestId)}<p class="text-sm text-text-secondary">
			Original unconfirmed addition: {original.quantity} of {original.printingName ??
				original.catalogCardId}, {original.finish}, {original.condition}.
		</p>
		<button
			class="btn btn-secondary"
			type="submit"
			name="retryOriginal"
			value={original.requestId}
			formnovalidate
			disabled={blocked}>Retry original Inventory addition</button
		>{/each}
	{#if !hasAvailableFinish}<p class="text-sm text-text-secondary">
			Choose a printing with an available Nonfoil or Foil finish.
		</p>{/if}
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

<style>
	.quick-add :global(button),
	.quick-add :global(input) {
		min-height: 44px;
	}
	.quick-add {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}
	.inventory-attributes {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 0.75rem;
	}
	.inventory-attributes > div {
		min-width: 0;
	}
	.quantity-step {
		min-width: 44px;
		min-height: 44px;
	}
	@media (max-width: 359px) {
		.inventory-attributes {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
