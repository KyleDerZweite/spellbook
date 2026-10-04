<script lang="ts">
	import { Select } from 'bits-ui';
	import type { CardDocument } from '#lib/search/types.ts';
	import { activeGameState } from '#lib/state/activeGame.svelte.ts';

	interface Props {
		card: CardDocument;
	}

	let { card }: Props = $props();
	const id = $props.id();

	let finish = $state<'nonfoil' | 'foil'>('nonfoil');
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
		{ value: 'nonfoil', label: 'Nonfoil', available: card.is_nonfoil_available },
		{ value: 'foil', label: 'Foil', available: card.is_foil_available }
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
	<input type="hidden" name="finish" value={finish} />
	<input type="hidden" name="condition" value={condition} />

	<div>
		<label for={`${id}-finish`} class="label"> Finish </label>
		<Select.Root type="single" bind:value={finish} items={FINISHES}>
			<Select.Trigger
				id={`${id}-finish`}
				class="input flex w-full items-center justify-between"
				style="
					background-color: var(--color-crypt);
					border: 1px solid var(--color-border);
				"
			>
				{FINISHES.find((item) => item.value === finish)?.label ?? 'Finish'}
				<span class="text-text-muted">&#9660;</span>
			</Select.Trigger>

			<Select.Portal>
				<Select.Content
					class="z-[100] overflow-hidden rounded"
					style="
						background-color: var(--color-slate);
						border: 1px solid var(--color-border);
						box-shadow: 0 4px 24px rgba(13, 11, 15, 0.8);
					"
				>
					<Select.Viewport class="p-1">
						{#each FINISHES as item}
							<Select.Item
								value={item.value}
								label={item.label}
								disabled={!item.available}
								class="cursor-pointer rounded px-3 py-2 font-body text-sm text-text-primary transition-colors data-[highlighted]:bg-mist data-[highlighted]:text-amber data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
							>
								{#snippet children({ selected })}
									<span class="flex items-center gap-2">
										{#if selected}
											<span class="text-gold-bright">&#10003;</span>
										{/if}
										{item.label}
										{#if !item.available}
											<span class="ml-auto font-mono text-[10px] text-text-muted">n/a</span>
										{/if}
									</span>
								{/snippet}
							</Select.Item>
						{/each}
					</Select.Viewport>
				</Select.Content>
			</Select.Portal>
		</Select.Root>
	</div>

	<!-- Condition -->
	<div>
		<label for={`${id}-condition`} class="label"> Condition </label>
		<Select.Root type="single" bind:value={condition} items={CONDITIONS}>
			<Select.Trigger
				id={`${id}-condition`}
				class="input flex w-full items-center justify-between"
				style="
					background-color: var(--color-crypt);
					border: 1px solid var(--color-border);
				"
			>
				{CONDITIONS.find((c) => c.value === condition)?.label ?? 'NM'}
				<span class="text-text-muted">&#9660;</span>
			</Select.Trigger>

			<Select.Portal>
				<Select.Content
					class="z-[100] overflow-hidden rounded"
					style="
						background-color: var(--color-slate);
						border: 1px solid var(--color-border);
						box-shadow: 0 4px 24px rgba(13, 11, 15, 0.8);
					"
				>
					<Select.Viewport class="p-1">
						{#each CONDITIONS as item}
							<Select.Item
								value={item.value}
								label={item.label}
								class="cursor-pointer rounded px-3 py-2 font-body text-sm text-text-primary transition-colors data-[highlighted]:bg-mist data-[highlighted]:text-amber"
							>
								{#snippet children({ selected })}
									<span class="flex items-center gap-2">
										{#if selected}
											<span class="text-gold-bright">&#10003;</span>
										{/if}
										{item.label}
									</span>
								{/snippet}
							</Select.Item>
						{/each}
					</Select.Viewport>
				</Select.Content>
			</Select.Portal>
		</Select.Root>
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
