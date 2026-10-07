<script lang="ts">
	import type { CardDocument } from '#lib/search/types.ts';
	import type { InventoryAcknowledgement } from '@spellbook/contracts/inventory.ts';
	import type { DeckChoicePage, DeckAcknowledgement } from '@spellbook/contracts/decks.ts';
	import type { InventoryAdditionIntent, DeckAdditionIntent } from '#lib/cards/addition-drafts.ts';
	import {
		DECK_ROLES,
		deckChoiceOptions,
		nativeAdditionAction,
		cardSignInHref
	} from '#lib/cards/addition-drafts.ts';
	import Select from '#lib/components/ui/select/Select.svelte';
	interface Result {
		action?: string;
		deckAdditionDraft?: DeckAdditionIntent;
		acknowledgement?: DeckAcknowledgement | InventoryAcknowledgement;
		inventoryAdditionDraft?: InventoryAdditionIntent;
		success?: boolean;
		message?: string;
		uncertain?: boolean;
	}
	interface Props {
		selectedPrinting: CardDocument | null;
		printingReadError?: string | null;
		deckDraft?: DeckAdditionIntent | null;
		inventoryDraft?: InventoryAdditionIntent | null;
		requestId: string;
		signedIn: boolean;
		canonicalSearchHref: string;
		choices: DeckChoicePage | null;
		choiceReadError?: string | null;
		choiceQuery?: string;
		choiceOffset?: number;
		result?: Result | null;
		action?: string;
	}
	let {
		selectedPrinting,
		printingReadError = null,
		deckDraft = null,
		inventoryDraft = null,
		requestId,
		signedIn,
		canonicalSearchHref,
		choices,
		choiceReadError = null,
		choiceQuery = '',
		choiceOffset = 0,
		result = null,
		action = '/mtg/search?/addToDeck'
	}: Props = $props();
	const id = $props.id();
	let inventorySubmitted = $derived(
		result?.action === 'addToInventory' ? result.inventoryAdditionDraft : inventoryDraft
	);
	let inventoryReceipt = $derived(result?.action === 'addToInventory' && result.success);
	let submitted = $derived(result?.action === 'addToDeck' ? result.deckAdditionDraft : deckDraft);
	let receipt = $derived(
		result?.action === 'addToDeck' &&
			result.success &&
			result.acknowledgement &&
			'deckId' in result.acknowledgement
			? result.acknowledgement
			: null
	);
	let options = $derived(deckChoiceOptions(choices));
	let retry = $derived(!!submitted && !receipt && (!!result?.message || !!deckDraft));
</script>

{#if signedIn}
	{#if receipt}<p role="status" class="text-sm text-text-secondary">Deck addition confirmed.</p>
		<a class="btn btn-secondary" href={`/mtg/decks?deck=${encodeURIComponent(receipt.deckId)}`}
			>View Deck</a
		>{/if}
	{#if choiceReadError}<p role="alert" class="text-sm text-error">
			{choiceReadError} Refresh the Deck choices before a new addition.
		</p>{/if}
	{#if selectedPrinting}
		<form method="GET" action="/mtg/search" class="native-actions">
			{#each [...new URL(canonicalSearchHref, 'https://spellbook.invalid').searchParams] as [name, value]}{#if !name.startsWith('/') && !name.startsWith('deckRetry') && !name.startsWith('inventoryRetry') && !['printing', 'deckQuery', 'deckOffset', 'selectedDeckId'].includes(name)}<input
						type="hidden"
						{name}
						{value}
					/>{/if}{/each}
			<input type="hidden" name="printing" value={selectedPrinting.id} />
			{#if submitted?.deckId}<input
					type="hidden"
					name="selectedDeckId"
					value={submitted.deckId}
				/>{/if}
			{#if submitted && !receipt}{#each ['requestId', 'catalogCardId', 'deckId', 'role', 'quantity'] as key}<input
						type="hidden"
						name={'deckRetry' + key[0].toUpperCase() + key.slice(1)}
						value={Reflect.get(submitted, key)}
					/>{/each}{/if}
			{#if inventorySubmitted && !inventoryReceipt}{#each ['requestId', 'catalogCardId', 'finish', 'condition', 'quantity'] as key}<input
						type="hidden"
						name={'inventoryRetry' + key[0].toUpperCase() + key.slice(1)}
						value={Reflect.get(inventorySubmitted, key)}
					/>{/each}{/if}
			<label class="label" for={`${id}-query`}>Find a Deck</label><input
				class="input"
				id={`${id}-query`}
				name="deckQuery"
				value={choiceQuery}
				maxlength="200"
				type="search"
			/>
			<button class="btn btn-secondary">Find Decks</button>
			<div class="flex flex-wrap gap-2">
				<button
					class="btn btn-secondary"
					name="deckOffset"
					value={Math.max(0, choiceOffset - 20)}
					disabled={!choiceOffset}>Previous Decks</button
				><button
					class="btn btn-secondary"
					name="deckOffset"
					value={choices?.nextOffset ?? 0}
					disabled={choices?.nextOffset == null}>Next Decks</button
				>
			</div>
		</form>
		<form
			method="POST"
			action={nativeAdditionAction(action, canonicalSearchHref, selectedPrinting.id)}
			class="native-actions"
		>
			<input type="hidden" name="requestId" value={requestId} /><input
				type="hidden"
				name="catalogCardId"
				value={selectedPrinting.id}
			/>
			{#if submitted && !receipt && (result?.uncertain || deckDraft)}<input
					type="hidden"
					name="originalUncertain"
					value="true"
				/>{#each ['requestId', 'catalogCardId', 'deckId', 'role', 'quantity'] as key}<input
						type="hidden"
						name={'deckRetry' + key[0].toUpperCase() + key.slice(1)}
						value={Reflect.get(submitted, key)}
					/>{/each}{/if}
			<label class="label" for={`${id}-deck`}>Deck</label><Select
				native
				id={`${id}-deck`}
				name="deckId"
				label="Deck"
				value={submitted?.deckId ?? ''}
				{options}
				required
				disabled={!!choiceReadError || !choices}
			/>
			<div class="fields">
				<div>
					<label class="label" for={`${id}-section`}>Section</label><Select
						native
						id={`${id}-section`}
						name="role"
						label="Section"
						value={submitted?.role ?? 'main'}
						options={DECK_ROLES}
					/>
				</div>
				<div>
					<label class="label" for={`${id}-quantity`}>Quantity</label><input
						class="input"
						id={`${id}-quantity`}
						type="number"
						name="quantity"
						min="1"
						max="10000"
						step="1"
						required
						value={submitted?.quantity ?? '1'}
					/>
				</div>
			</div>
			<button class="btn btn-primary" disabled={!!choiceReadError || !choices}
				>{submitted && !receipt ? 'Add with current Deck details' : 'Add to Deck'}</button
			>
		</form>
	{:else}<p role="alert" class="text-sm text-text-secondary">
			{printingReadError ?? 'Printing evidence could not be loaded. Refresh before a new addition.'}
		</p>{/if}
	{#if result?.action === 'addToDeck' && result.message}<p role="alert" class="text-sm text-error">
			{result.message}
		</p>{/if}
	{#if retry && submitted}<form
			method="POST"
			action={nativeAdditionAction(action, canonicalSearchHref, submitted.catalogCardId)}
			class="native-actions"
		>
			{#each Object.entries(submitted) as [name, value]}<input
					type="hidden"
					{name}
					{value}
				/>{/each}
			<p class="text-sm text-text-secondary">
				Original submitted addition: {submitted.quantity} of {submitted.catalogCardId} to {submitted.deckId},
				{submitted.role}.
			</p>
			<button class="btn btn-secondary">Retry original Deck addition</button>
		</form>{/if}
	<div class="secondary-add">
		{#if inventoryReceipt}<p role="status" class="text-sm text-text-secondary">
				Inventory addition confirmed.
			</p>{/if}
		{#if selectedPrinting}
			<form
				method="POST"
				action={nativeAdditionAction(
					'/mtg/search?/addToInventory',
					canonicalSearchHref,
					selectedPrinting.id
				)}
				class="native-actions"
			>
				<input type="hidden" name="requestId" value={requestId + ':inventory'} /><input
					type="hidden"
					name="catalogCardId"
					value={selectedPrinting.id}
				/>
				{#if inventorySubmitted && !inventoryReceipt && (result?.uncertain || inventoryDraft)}<input
						type="hidden"
						name="originalUncertain"
						value="true"
					/>{#each ['requestId', 'catalogCardId', 'finish', 'condition', 'quantity'] as key}<input
							type="hidden"
							name={'inventoryRetry' + key[0].toUpperCase() + key.slice(1)}
							value={Reflect.get(inventorySubmitted, key)}
						/>{/each}{/if}
				<label class="label" for={`${id}-inventory-quantity`}>Quantity</label><input
					class="input"
					id={`${id}-inventory-quantity`}
					type="number"
					name="quantity"
					value={inventorySubmitted?.quantity ?? '1'}
					min="1"
					max="99"
					step="1"
					required
				/>
				<div class="fields">
					<div>
						<label class="label" for={`${id}-finish`}>Finish</label><Select
							native
							id={`${id}-finish`}
							label="Finish"
							name="finish"
							value={inventorySubmitted?.finish ??
								(selectedPrinting.is_nonfoil_available ? 'nonfoil' : 'foil')}
							options={[
								{
									value: 'nonfoil',
									label: 'Nonfoil',
									disabled: !selectedPrinting.is_nonfoil_available
								},
								{ value: 'foil', label: 'Foil', disabled: !selectedPrinting.is_foil_available }
							]}
						/>
					</div>
					<div>
						<label class="label" for={`${id}-condition`}>Condition</label><Select
							native
							id={`${id}-condition`}
							name="condition"
							label="Condition"
							value={inventorySubmitted?.condition ?? 'NM'}
							options={['NM', 'LP', 'MP', 'HP', 'DMG'].map((value) => ({ value, label: value }))}
						/>
					</div>
				</div>
				<button
					class="btn btn-secondary text-sm"
					disabled={!selectedPrinting.is_nonfoil_available && !selectedPrinting.is_foil_available}
					>{inventorySubmitted && !inventoryReceipt
						? 'Add with current Inventory details'
						: 'Add to Inventory'}</button
				>
			</form>
		{/if}
		{#if result?.action === 'addToInventory' && result.message}<p
				role="alert"
				class="text-sm text-error"
			>
				{result.message}
			</p>{/if}
		{#if inventorySubmitted && !inventoryReceipt && (result?.message || inventoryDraft)}<form
				method="POST"
				action={nativeAdditionAction(
					'/mtg/search?/addToInventory',
					canonicalSearchHref,
					inventorySubmitted.catalogCardId
				)}
				class="native-actions"
			>
				{#each Object.entries(inventorySubmitted) as [name, value]}<input
						type="hidden"
						{name}
						{value}
					/>{/each}
				<p class="text-sm text-text-secondary">
					Original submitted Inventory addition: {inventorySubmitted.quantity}, {inventorySubmitted.finish},
					{inventorySubmitted.condition}.
				</p>
				<button class="btn btn-secondary">Retry original Inventory addition</button>
			</form>{/if}
	</div>
{:else}<a class="btn btn-primary" href={cardSignInHref(canonicalSearchHref, selectedPrinting?.id)}
		>Sign in to add cards</a
	>{/if}

<style>
	.secondary-add {
		max-width: 24rem;
		margin-top: 1rem;
		font-size: 0.8125rem;
	}
	.native-actions {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 1rem;
	}
	.native-actions :global(button),
	.native-actions :global(input),
	.native-actions :global(select) {
		min-height: 44px;
	}
	.fields {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 0.75rem;
	}
	.fields > div {
		min-width: 0;
	}
</style>
