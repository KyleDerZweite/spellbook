<script lang="ts">
	import { page } from '$app/state';
	import { inventoryAction, effectiveInventoryUrl } from '#lib/mtg/inventory-action.ts';
	import { enhance } from '$app/forms';
	import { GroupMutation } from '#lib/mtg/groupMutation.svelte.ts';
	import FormDialog from '#lib/components/ui/dialog/FormDialog.svelte';
	let {
		group = null,
		onClose,
		refresh,
		onCloseAutoFocus
	}: {
		group?: { id: string; name: string } | null;
		onClose: () => void;
		refresh: () => Promise<void>;
		onCloseAutoFocus: (event: Event) => void;
	} = $props();
	let name = $state('');
	const mutation = new GroupMutation(
		() => onClose(),
		() => refresh(),
		() => page.data.user?.accountId ?? 'session'
	);
	const id = $props.id();
	$effect(() => {
		name = group?.name ?? '';
	});
</script>

<FormDialog
	title={group ? 'Rename box' : 'New box'}
	description="Boxes organize your existing inventory."
	pending={mutation.pending}
	onCancel={onClose}
	{onCloseAutoFocus}
>
	<form
		method="POST"
		action={inventoryAction(group ? 'renameGroup' : 'createGroup', effectiveInventoryUrl(page))}
		use:enhance={mutation.submit}
		aria-busy={mutation.pending}
		class="group-form"
	>
		<input type="hidden" name="requestId" value={page.data.requestId} />
		{#if group}<input type="hidden" name="groupId" value={group.id} />{/if}
		<label class="label" for={`${id}-name`}>Name</label>
		<input
			class="input"
			id={`${id}-name`}
			name="name"
			bind:value={name}
			minlength="1"
			maxlength="128"
			pattern={'.{1,64}'}
			title="Use 1 to 64 characters."
			required
			disabled={mutation.pending}
			autocomplete="off"
			aria-describedby={mutation.error ? `${id}-error` : undefined}
		/>
		{#if mutation.error}<p id={`${id}-error`} role="alert" class="text-sm text-error">
				{mutation.error}
			</p>{/if}
		<div class="group-form-actions">
			<button type="button" class="btn btn-secondary" disabled={mutation.pending} onclick={onClose}
				>Cancel</button
			><button type="submit" class="btn btn-primary" disabled={mutation.pending}
				>{mutation.pending ? 'Saving...' : group ? 'Save' : 'Create box'}</button
			>
		</div>
	</form>
</FormDialog>

<style>
	.group-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.group-form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
</style>
