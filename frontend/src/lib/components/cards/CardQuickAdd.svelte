<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { refreshAll } from '$app/navigation';
	import Select from '#lib/components/ui/select/Select.svelte';
	import type { CardDocument } from '#lib/search/types.ts';
	import { activeGameState } from '#lib/state/activeGame.svelte.ts';

	interface Props {
		card: CardDocument;
		onPendingChange?: (pending: boolean) => void;
	}

	let { card, onPendingChange }: Props = $props();
	const id = $props.id();

	let finish = $state('nonfoil');
	let condition = $state('NM');
	let quantity = $state(1);
	let pending = $state(false);
	let error = $state('');
	let message = $state('');
	let requestId = $state(crypto.randomUUID());
	const pendingRequests = new Map<string, string>();
	const hasAvailableFinish = $derived(card.is_nonfoil_available || card.is_foil_available);

	const add: SubmitFunction = ({ formData, cancel }) => {
		if (pending || !hasAvailableFinish) {
			cancel();
			return;
		}
		const payload = JSON.stringify(
			[...formData.entries()].filter(([name]) => name !== 'requestId')
		);
		const intentId = pendingRequests.get(payload) ?? crypto.randomUUID();
		pendingRequests.set(payload, intentId);
		formData.set('requestId', intentId);
		const addedName = String(formData.get('name'));
		const addedQuantity = Number(formData.get('quantity'));
		pending = true;
		onPendingChange?.(true);
		error = '';
		message = '';
		return async ({ result, update }) => {
			try {
				if (result.type === 'success' && result.data?.success) {
					pendingRequests.delete(payload);
					requestId = crypto.randomUUID();
					message = `Added ${addedQuantity} ${addedQuantity === 1 ? 'copy' : 'copies'} of ${addedName} to inventory.`;
					try {
						await refreshAll();
					} catch {
						message += ' Refresh the page to update inventory and deck counts.';
					}
				} else if (result.type === 'redirect') {
					pending = false;
					onPendingChange?.(false);
					await update({ reset: false });
				} else if (result.type === 'failure') {
					error =
						typeof result.data?.message === 'string'
							? result.data.message
							: 'Could not add this card. Check the details and try again.';
				} else {
					error = 'Could not confirm this addition. Retry unchanged to confirm it safely.';
				}
			} finally {
				pending = false;
				onPendingChange?.(false);
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
			finish = 'foil';
		} else if (!card.is_foil_available) {
			finish = 'nonfoil';
		}
	});
</script>

<form
	method="POST"
	action="/mtg/search?/addToInventory"
	use:enhance={add}
	class="quick-add"
	aria-busy={pending}
	aria-describedby={error ? `${id}-error` : undefined}
>
	<input type="hidden" name="requestId" value={requestId} />
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
				onclick={() => (quantity = Math.max(1, (quantity || 1) - 1))}
				aria-label="Decrease quantity"
				disabled={pending || quantity <= 1}
				class="btn btn-secondary btn-icon quantity-step"
			>
				-
			</button>
			<input
				id={`${id}-quantity`}
				type="number"
				name="quantity"
				bind:value={quantity}
				disabled={pending}
				min="1"
				max="99"
				step="1"
				required
				class="input w-20 text-center"
			/>
			<button
				type="button"
				onclick={() => (quantity = Math.min(99, (quantity || 1) + 1))}
				aria-label="Increase quantity"
				disabled={pending || quantity >= 99}
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
				bind:value={finish}
				disabled={pending}
				options={FINISHES}
			/>
		</div>

		<div>
			<label for={`${id}-condition`} class="label"> Condition </label>
			<Select
				id={`${id}-condition`}
				name="condition"
				label="Condition"
				bind:value={condition}
				disabled={pending}
				options={CONDITIONS}
			/>
		</div>
	</div>
	<button type="submit" disabled={pending || !hasAvailableFinish} class="btn btn-primary w-full">
		{pending ? 'Adding...' : 'Add to inventory'}
	</button>
	{#if !hasAvailableFinish}<p class="text-sm text-text-secondary">
			Choose a printing with an available Nonfoil or Foil finish.
		</p>{/if}
	{#if error}<p id={`${id}-error`} role="alert" class="text-sm text-error">{error}</p>{/if}
	<p role="status" aria-live="polite" class:sr-only={!message} class="text-sm text-text-secondary">
		{message}
	</p>
</form>

<style>
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
