<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack, tick } from 'svelte';
	import Avatar from '#lib/components/profile/Avatar.svelte';
	import AvatarEditor from '#lib/components/profile/AvatarEditor.svelte';
	import ProfileCard from '#lib/components/profile/ProfileCard.svelte';
	import { getAvatar } from '#lib/profile/avatars.ts';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let email = $state(
		untrack(() => (form?.intent === 'email' && 'email' in form ? form.email : data.user.email))
	);
	let pending = $state(false);
	let saveError = $state('');
	let profileForm: HTMLFormElement;
	let lastSavedEmail = $state(untrack(() => data.user.email));
	$effect(() => {
		if (data.user.email !== lastSavedEmail) {
			email = data.user.email;
			lastSavedEmail = data.user.email;
		}
	});
	let emailError = $derived(
		form?.intent === 'email' && 'errors' in form ? form.errors.email : undefined
	);
</script>

<svelte:head
	><title>Profile | Spellbook</title><meta name="robots" content="noindex, nofollow" /></svelte:head
>
<div class="profile-page">
	<div class="page-title"><h1>Profile</h1></div>
	<div class="profile-settings">
		<div class="profile-fields">
			<div>
				<label for="profile-username" class="label">Username</label><input
					id="profile-username"
					class="input"
					value={data.user.username}
					readonly
					autocomplete="username"
				/>
			</div>
			<form
				bind:this={profileForm}
				method="POST"
				aria-busy={pending}
				use:enhance={() => {
					pending = true;
					saveError = '';
					return async ({ result, update }) => {
						try {
							if (result.type === 'error') saveError = 'Could not save your email. Try again.';
							else await update({ reset: false });
						} finally {
							pending = false;
						}
						if (result.type === 'failure') {
							await tick();
							profileForm.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
						}
					};
				}}
			>
				<input type="hidden" name="intent" value="email" />
				<label for="profile-email" class="label">Email</label>
				<input
					id="profile-email"
					name="email"
					class="input"
					type="email"
					autocomplete="email"
					maxlength={254}
					bind:value={email}
					disabled={pending}
					aria-invalid={!!emailError}
					aria-describedby="email-help email-error"
				/>
				<p id="email-help" class="field-help">
					Optional contact email. Sign in with your username.
				</p>
				<p id="email-error" class="field-error">{emailError ?? ''}</p>
				<div class="profile-save">
					<button class="btn btn-primary" disabled={pending}
						>{pending ? 'Saving...' : 'Save email'}</button
					>
					<p
						role="status"
						class="text-sm text-text-secondary"
						class:text-error={!!saveError || (form?.intent === 'email' && !form.success)}
					>
						{saveError || (form?.intent === 'email' ? form.message : '')}
					</p>
				</div>
			</form>
			<div class="profile-avatar">
				<div
					class="avatar-image"
					role="img"
					aria-label={`${getAvatar(data.user.avatarId).label} avatar`}
				>
					<Avatar id={data.user.avatarId} size={88} />
				</div>
				<AvatarEditor avatarId={data.user.avatarId} />
			</div>
		</div>
		<div class="profile-card-summary">
			<ProfileCard
				username={data.user.username}
				avatarId={data.user.avatarId}
				artworkId={data.user.artworkId}
				totals={data.totals}
				definition={data.card}
			/>
			<a href="/settings/profile-card" class="btn btn-secondary">Edit Card</a>
			{#if data.statsError}<p role="status" class="text-sm text-text-secondary">
					{data.statsError}
				</p>{/if}
		</div>
	</div>
</div>

<style>
	.profile-settings {
		display: grid;
		grid-template-columns: minmax(0, 440px) minmax(0, 300px);
		gap: 3rem;
		margin-top: 1.5rem;
		justify-content: space-between;
		align-items: start;
	}
	.profile-fields {
		display: flex;
		flex-direction: column;
		gap: 1.75rem;
		min-width: 0;
		width: 100%;
		max-width: 440px;
	}
	.profile-save {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		margin-top: 1rem;
	}
	.profile-avatar {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
	}
	.avatar-image {
		display: grid;
		place-items: center;
		width: 112px;
		height: 112px;
		background: var(--color-stone);
		border-radius: 50%;
	}
	.profile-card-summary {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		min-width: 0;
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
	@media (max-width: 760px) {
		.profile-settings {
			grid-template-columns: minmax(0, 1fr);
			gap: 2rem;
		}
		.profile-card-summary {
			width: min(100%, 300px);
			margin-inline: auto;
		}
	}
</style>
