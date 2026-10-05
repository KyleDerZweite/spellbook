<script lang="ts">
	import { enhance } from '$app/forms';
	import Avatar from '#lib/components/profile/Avatar.svelte';
	import { AVATARS, getAvatar } from '#lib/profile/avatars.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let selectedAvatar = $derived(getAvatar(data.user.avatarId).id);
	let pending = $state(false);
	let saveError = $state('');
</script>

<svelte:head>
	<title>Settings | Spellbook</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="settings-page">
	<h1 class="font-display text-2xl font-semibold tracking-tight text-text-primary">Settings</h1>
	<div class="settings-identity">
		<Avatar id={data.user.avatarId} size={48} />
		<span>{data.user.username}</span>
	</div>
	<form
		method="POST"
		use:enhance={() => {
			pending = true;
			saveError = '';
			return async ({ result, update }) => {
				try {
					if (result.type === 'error') saveError = 'Could not save your avatar. Try again.';
					else await update({ reset: false });
				} finally {
					pending = false;
				}
			};
		}}
	>
		<fieldset disabled={pending} aria-describedby="avatar-status">
			<legend class="mb-4 text-sm font-medium text-text-primary">Avatar</legend>
			<div class="avatar-choices">
				{#each AVATARS as avatar (avatar.id)}
					<label class="avatar-choice">
						<input type="radio" name="avatarId" value={avatar.id} bind:group={selectedAvatar} />
						<span class="avatar-option">
							<Avatar id={avatar.id} size={48} />
							<span>{avatar.label}</span>
							<svg
								class="avatar-check"
								aria-hidden="true"
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"><path d="m5 12 4 4L19 6" /></svg
							>
						</span>
					</label>
				{/each}
			</div>
		</fieldset>
		<div class="settings-save">
			<button class="btn btn-primary" disabled={pending}>
				{pending ? 'Saving...' : 'Save'}
			</button>
			<div
				id="avatar-status"
				aria-live="polite"
				aria-atomic="true"
				class="text-sm text-text-secondary"
			>
				{#if saveError}<span class="text-error">{saveError}</span>
				{:else if form?.message && (!form.success || selectedAvatar === data.user.avatarId)}
					<span class:text-error={!form.success}>{form.message}</span>
				{/if}
			</div>
		</div>
	</form>
</div>

<style>
	.settings-page {
		width: 100%;
		max-width: 44rem;
		margin: 0 auto;
		padding: 2rem 1.5rem;
	}
	.settings-identity {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin: 1.25rem 0 1.5rem;
		font-size: 0.9375rem;
		overflow-wrap: anywhere;
	}
	.avatar-choices {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 0.625rem;
	}
	.avatar-choice {
		position: relative;
		min-width: 0;
		cursor: pointer;
	}
	.avatar-choice input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.avatar-option {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 0.25rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: 0.625rem;
		color: var(--color-text-secondary);
		font-size: 0.75rem;
	}
	.avatar-choice:hover .avatar-option {
		background: var(--color-stone);
	}
	.avatar-choice input:checked + .avatar-option {
		color: var(--color-text-primary);
		border-color: var(--color-text-secondary);
		background: var(--color-stone);
	}
	.avatar-choice input:focus-visible + .avatar-option {
		outline: 2px solid var(--color-text-primary);
		outline-offset: 3px;
	}
	.avatar-choice input:disabled + .avatar-option {
		cursor: wait;
		opacity: 0.65;
	}
	.avatar-check {
		position: absolute;
		top: 0.375rem;
		right: 0.375rem;
		visibility: hidden;
	}
	.avatar-choice input:checked + .avatar-option .avatar-check {
		visibility: visible;
	}
	.settings-save {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 1.5rem;
	}
	@media (max-width: 639px) {
		.settings-page {
			padding: 2rem 1.25rem;
		}
		.avatar-choices {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
