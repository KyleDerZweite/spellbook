<script lang="ts">
	import { workspaceSavedState } from '#lib/saved-state/workspace.svelte.ts';
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import PasswordInput from '#lib/components/auth/PasswordInput.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let pending = $state(false);
	let saveError = $state('');
	let passwordForm: HTMLFormElement;
	const fields = [
		{ name: 'currentPassword', label: 'Current password', autocomplete: 'current-password' },
		{ name: 'newPassword', label: 'New password', autocomplete: 'new-password' },
		{ name: 'confirmPassword', label: 'Confirm new password', autocomplete: 'new-password' }
	] as const;
</script>

<svelte:head
	><title>Password | Spellbook</title><meta
		name="robots"
		content="noindex, nofollow"
	/></svelte:head
>
<div class="page-title"><h1>Password</h1></div>
<form
	class="password-settings"
	bind:this={passwordForm}
	method="POST"
	aria-busy={pending}
	use:enhance={() => {
		const write = workspaceSavedState.beginWrite(['profile']);
		pending = true;
		saveError = '';
		return async ({ result, update }) => {
			try {
				if (!write.current()) return;
				if (result.type === 'error') saveError = 'Could not change your password. Try again.';
				else {
					await update({ reset: false, refreshAll: false, navigate: false });
					if (!write.current()) return;
					if (result.type === 'success') passwordForm.reset();
				}
			} finally {
				write.complete();
				if (write.current()) pending = false;
			}
			if (result.type === 'failure') {
				await tick();
				if (!write.current()) return;
				passwordForm.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
			}
		};
	}}
>
	{#if data.demoMode}<p class="text-sm text-text-secondary">
			Password changes are disabled in demo mode.
		</p>{/if}
	{#each fields as field}
		<div>
			<label class="label" for={field.name}>{field.label}</label>
			<PasswordInput
				id={field.name}
				name={field.name}
				autocomplete={field.autocomplete}
				required
				minlength={field.name === 'currentPassword' ? 1 : 12}
				maxlength={128}
				disabled={pending || data.demoMode}
				aria-invalid={!!form?.errors?.[field.name]}
				aria-describedby={`${field.name}-error ${field.name === 'newPassword' ? 'password-help' : ''}`}
			/>
			{#if field.name === 'newPassword'}<p id="password-help" class="field-help">
					12 to 128 characters. Other sessions will be signed out.
				</p>{/if}
			<p id={`${field.name}-error`} class="field-error">{form?.errors?.[field.name] ?? ''}</p>
		</div>
	{/each}
	<div class="password-save">
		<button class="btn btn-primary" disabled={pending || data.demoMode}
			>{pending ? 'Saving...' : 'Change password'}</button
		>
		<p
			role="status"
			class="text-sm text-text-secondary"
			class:text-error={!!saveError || (form && !form.success)}
		>
			{saveError || form?.message || ''}
		</p>
	</div>
</form>

<style>
	.password-settings {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		max-width: 440px;
		margin-top: 1.5rem;
	}
	.password-save {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.field-help {
		margin-top: 0.5rem;
		color: var(--color-text-muted);
		font-size: 0.6875rem;
		line-height: 1.5;
	}
	.field-error {
		margin-top: 0.35rem;
		color: var(--color-error);
		font-size: 0.75rem;
	}
	.field-error:empty {
		display: none;
	}
</style>
