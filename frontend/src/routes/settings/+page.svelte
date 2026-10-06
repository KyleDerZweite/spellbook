<script lang="ts">
	import { enhance } from '$app/forms';
	import ProfileCard from '#lib/components/profile/ProfileCard.svelte';
	import AvatarPicker from '#lib/components/profile/AvatarPicker.svelte';
	import ArtworkPicker from '#lib/components/profile/ArtworkPicker.svelte';
	import { getAvatar } from '#lib/profile/avatars.ts';
	import { getProfileArtwork } from '#lib/profile/artwork.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let selectedAvatar = $derived(getAvatar(data.user.avatarId).id as string);
	let selectedArtwork = $derived(getProfileArtwork(data.user.artworkId).id as string);
	let pending = $state(false);
	let saveError = $state('');
	let isSaved = $derived(
		selectedAvatar === data.user.avatarId && selectedArtwork === data.user.artworkId
	);
</script>

<svelte:head
	><title>Settings | Spellbook</title><meta
		name="robots"
		content="noindex, nofollow"
	/></svelte:head
>

<div class="settings-page workspace-container">
	<div class="page-title"><h1>Settings</h1></div>
	<div class="settings-profile">
		<div class="settings-preview">
			<ProfileCard
				username={data.user.username}
				avatarId={selectedAvatar}
				artworkId={selectedArtwork}
				totals={data.totals}
			/>
			{#if data.statsError}<p role="status" class="text-sm text-text-secondary">
					{data.statsError}
				</p>{/if}
		</div>
		<form
			method="POST"
			aria-busy={pending}
			aria-describedby="profile-status"
			use:enhance={() => {
				pending = true;
				saveError = '';
				return async ({ result, update }) => {
					try {
						if (result.type === 'error') saveError = 'Could not save your profile. Try again.';
						else await update({ reset: false });
					} finally {
						pending = false;
					}
				};
			}}
		>
			<ArtworkPicker bind:selected={selectedArtwork} disabled={pending} />
			<AvatarPicker bind:selected={selectedAvatar} disabled={pending} />
			<div class="settings-save">
				<button class="btn btn-primary" disabled={pending}
					>{pending ? 'Saving...' : 'Save profile'}</button
				>
				<div
					id="profile-status"
					aria-live="polite"
					aria-atomic="true"
					class="text-sm text-text-secondary"
				>
					{#if saveError}<span class="text-error">{saveError}</span>
					{:else if form?.message && (!form.success || isSaved)}<span
							class:text-error={!form.success}>{form.message}</span
						>{/if}
				</div>
			</div>
		</form>
	</div>
</div>

<style>
	.settings-page {
		min-width: 0;
	}
	.settings-profile {
		display: grid;
		grid-template-columns: minmax(260px, 340px) minmax(0, 520px);
		gap: clamp(1.5rem, 4vw, 4rem);
		align-items: start;
		margin-top: 1.5rem;
	}
	.settings-preview {
		min-width: 0;
	}
	.settings-preview > p {
		max-width: 340px;
		margin-top: 0.75rem;
	}
	.settings-page form {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		min-width: 0;
	}
	.settings-save {
		display: flex;
		align-items: center;
		gap: 1rem;
		min-height: 44px;
	}
	@media (max-width: 800px) {
		.settings-profile {
			grid-template-columns: minmax(0, 1fr);
			gap: 1.75rem;
			max-width: 520px;
		}
		.settings-preview {
			display: flex;
			flex-direction: column;
			align-items: center;
		}
		.settings-save {
			flex-wrap: wrap;
		}
	}
</style>
