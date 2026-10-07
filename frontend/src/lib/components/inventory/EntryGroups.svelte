<script lang="ts">
	import { page } from '$app/state';
	import { inventoryAction, effectiveInventoryUrl } from '#lib/mtg/inventory-action.ts';
	import { enhance } from '$app/forms';
	import { GroupMutation } from '#lib/mtg/groupMutation.svelte.ts';
	import { untrack } from 'svelte';
	import FormDialog from '#lib/components/ui/dialog/FormDialog.svelte';
	let {
		entry,
		groups,
		groupIds,
		onClose,
		refresh,
		onCloseAutoFocus
	}: {
		entry: {
			id: string;
			name: string;
			quantity: number;
			setCode: string;
			finish: string;
			condition: string;
		};
		groups: { id: string; name: string }[];
		groupIds: string[];
		onClose: () => void;
		refresh: () => Promise<void>;
		onCloseAutoFocus: (event: Event) => void;
	} = $props();
	let selected = $state(new Set(untrack(() => groupIds)));
	const mutation = new GroupMutation(
		() => onClose(),
		() => refresh(),
		() => page.data.user?.accountId ?? 'session'
	);

	function toggle(id: string) {
		const next = new Set(selected);
		if (!next.delete(id)) next.add(id);
		selected = next;
	}
</script>

<FormDialog
	title="Boxes"
	description={`Boxes include all ${entry.quantity} ${entry.quantity === 1 ? 'copy' : 'copies'} of ${entry.name} (${entry.setCode.toUpperCase()}, ${entry.finish === 'foil' ? 'Foil' : 'Nonfoil'}, ${entry.condition}).`}
	pending={mutation.pending}
	onCancel={onClose}
	{onCloseAutoFocus}
>
	<form
		method="POST"
		action={inventoryAction('assignGroups', effectiveInventoryUrl(page))}
		use:enhance={mutation.submit}
		aria-busy={mutation.pending}
	>
		<input type="hidden" name="requestId" value={page.data.requestId} />
		<input type="hidden" name="entryId" value={entry.id} />
		{#if groups.length === 0}<p class="text-sm text-text-secondary">
				Create a box in the Boxes view first.
			</p>{:else}
			<div class="membership-list">
				{#each groups as group (group.id)}<label
						><input
							type="checkbox"
							name="groupId"
							value={group.id}
							checked={selected.has(group.id)}
							disabled={mutation.pending}
							onchange={() => toggle(group.id)}
						/><span>{group.name}</span></label
					>{/each}
			</div>
		{/if}
		{#if mutation.error}<p role="alert" class="mt-3 text-sm text-error">{mutation.error}</p>{/if}
		<div class="group-form-actions">
			<button type="button" class="btn btn-secondary" disabled={mutation.pending} onclick={onClose}
				>Cancel</button
			><button
				type="submit"
				class="btn btn-primary"
				disabled={mutation.pending || groups.length === 0}
				>{mutation.pending ? 'Saving...' : 'Save boxes'}</button
			>
		</div>
	</form>
</FormDialog>

<style>
	.membership-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.membership-list label {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		min-height: 44px;
		padding: 0.5rem;
		border-radius: 0.375rem;
		cursor: pointer;
	}
	.membership-list label:hover {
		background: var(--color-muted);
	}
	.membership-list input {
		width: 16px;
		height: 16px;
		accent-color: var(--color-text-primary);
		flex-shrink: 0;
	}
	.membership-list span {
		overflow-wrap: anywhere;
		font-size: 0.8125rem;
	}
	.group-form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1.25rem;
	}
</style>
