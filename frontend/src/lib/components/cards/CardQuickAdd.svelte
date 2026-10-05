<script lang="ts">
	import Select from '#lib/components/ui/select/Select.svelte';
	import type { CardDocument } from '#lib/search/types.ts';
	import { activeGameState } from '#lib/state/activeGame.svelte.ts';

	interface Props {
		card: CardDocument;
	}

	let { card }: Props = $props();
	const id = $props.id();

	let finish = $state('nonfoil');
	let condition = $state('NM');
	let quantity = $state(1);

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

<form method="POST" action="?/addToInventory" class="flex flex-col gap-3">
	<input type="hidden" name="game" value={activeGameState.current} />
	<input type="hidden" name="catalogCardId" value={card.id} />
	<input type="hidden" name="canonicalCardId" value={card.oracle_id} />
	<input type="hidden" name="name" value={card.name} />
	<input type="hidden" name="setCode" value={card.set_code} />
	<input type="hidden" name="imageUri" value={card.image_uri || card.image_uri_small} />

	<div>
		<label for={`${id}-finish`} class="label"> Finish </label>
		<Select
			id={`${id}-finish`}
			name="finish"
			label="Finish"
			bind:value={finish}
			options={FINISHES}
		/>
	</div>

	<!-- Condition -->
	<div>
		<label for={`${id}-condition`} class="label"> Condition </label>
		<Select
			id={`${id}-condition`}
			name="condition"
			label="Condition"
			bind:value={condition}
			options={CONDITIONS}
		/>
	</div>

	<!-- Quantity -->
	<div>
		<label for={`${id}-quantity`} class="label"> Quantity </label>
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={() => (quantity = Math.max(1, (quantity || 1) - 1))}
				aria-label="Decrease quantity"
				disabled={quantity <= 1}
				class="btn btn-secondary btn-icon"
			>
				-
			</button>
			<input
				id={`${id}-quantity`}
				type="number"
				name="quantity"
				bind:value={quantity}
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
				disabled={quantity >= 99}
				class="btn btn-secondary btn-icon"
			>
				+
			</button>
		</div>
	</div>

	<!-- Add button -->
	<button type="submit" class="btn btn-primary mt-1 w-full"> Add to inventory </button>
</form>
