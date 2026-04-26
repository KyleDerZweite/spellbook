<script lang="ts">
	import { Select } from 'bits-ui';
	import type { CardDocument } from '$lib/search/types';
	import { activeGameState } from '$lib/state/activeGame.svelte';

	interface Props {
		card: CardDocument;
	}

	let { card }: Props = $props();

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
	<input type="hidden" name="quantity" value={quantity} />

	<div>
		<!-- svelte-ignore a11y_label_has_associated_control -->
		<label class="mb-1 block font-display text-xs uppercase tracking-wider text-text-secondary">
			Finish
		</label>
		<Select.Root type="single" bind:value={finish} items={FINISHES}>
			<Select.Trigger
				class="flex w-full cursor-pointer items-center justify-between rounded px-3 py-2 font-body text-sm text-text-primary"
				style="
					background-color: var(--color-crypt);
					border: 1px solid rgba(196, 146, 42, 0.3);
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
						border: 1px solid rgba(196, 146, 42, 0.4);
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

	<div class="surface-card rounded px-3 py-2 font-body text-xs text-text-secondary">
		Adds to your {activeGameState.current.toUpperCase()} inventory. Deck building happens separately in
		the deck studio.
	</div>

	<!-- Condition -->
	<div>
		<!-- svelte-ignore a11y_label_has_associated_control -->
		<label class="mb-1 block font-display text-xs uppercase tracking-wider text-text-secondary">
			Condition
		</label>
		<Select.Root type="single" bind:value={condition} items={CONDITIONS}>
			<Select.Trigger
				class="flex w-full cursor-pointer items-center justify-between rounded px-3 py-2 font-body text-sm text-text-primary"
				style="
					background-color: var(--color-crypt);
					border: 1px solid rgba(196, 146, 42, 0.3);
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
						border: 1px solid rgba(196, 146, 42, 0.4);
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
		<!-- svelte-ignore a11y_label_has_associated_control -->
		<label class="mb-1 block font-display text-xs uppercase tracking-wider text-text-secondary">
			Quantity
		</label>
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={() => (quantity = Math.max(1, quantity - 1))}
				class="flex h-8 w-8 cursor-pointer items-center justify-center rounded font-mono text-sm text-text-primary transition-colors hover:bg-mist"
				style="border: 1px solid rgba(196, 146, 42, 0.3); background-color: var(--color-crypt);"
			>
				-
			</button>
			<span class="w-8 text-center font-mono text-sm text-text-primary">{quantity}</span>
			<button
				type="button"
				onclick={() => (quantity = Math.min(99, quantity + 1))}
				class="flex h-8 w-8 cursor-pointer items-center justify-center rounded font-mono text-sm text-text-primary transition-colors hover:bg-mist"
				style="border: 1px solid rgba(196, 146, 42, 0.3); background-color: var(--color-crypt);"
			>
				+
			</button>
		</div>
	</div>

	<!-- Add button -->
	<button
		type="submit"
		class="btn-gold mt-1 w-full cursor-pointer rounded py-2.5 font-display text-sm font-bold uppercase tracking-wider"
	>
		Add to Inventory
	</button>
</form>
