<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { enhance } from '$app/forms';
	import AccountLayout from '#lib/components/auth/AccountLayout.svelte';
	import PasswordInput from '#lib/components/auth/PasswordInput.svelte';
	import ArtworkPicker from '#lib/components/profile/ArtworkPicker.svelte';
	import { getProfileArtwork } from '#lib/profile/artwork.ts';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let pending = $state(false);
	let selectedArtwork = $derived(getProfileArtwork(form?.artworkId).id as string);
</script>

<svelte:head
	><title>{language.t('ui.Create.an.account.Spellbook')}</title><meta
		name="robots"
		content="noindex"
	/></svelte:head
>

<AccountLayout title={language.t('ui.Create.an.account')}>
	<form
		method="POST"
		class="space-y-5"
		aria-busy={pending}
		aria-describedby={form?.message ? 'auth-error' : undefined}
		use:enhance={() => {
			pending = true;
			return async ({ update }) => {
				try {
					await update({ reset: false });
				} finally {
					pending = false;
				}
			};
		}}
	>
		{#if form?.message}<p
				role="alert"
				id="auth-error"
				class="rounded-lg border border-error p-3 text-sm text-error"
			>
				{language.message(form.message)}
			</p>{/if}
		<div>
			<label for="username" class="label">{language.t('ui.Username')}</label>
			<input
				id="username"
				name="username"
				autocomplete="username"
				required
				minlength="3"
				maxlength="32"
				value={form?.username ?? ''}
				aria-describedby={form?.message ? 'username-help auth-error' : 'username-help'}
				class="input w-full"
			/>
			<p id="username-help" class="mt-2 text-xs text-[var(--color-text-secondary)]">
				{language.t(
					'ui.3.to.32.letters.numbers.underscores.or.hyphens.Start.with.a.letter.or.number'
				)}
			</p>
		</div>
		<div>
			<label for="password" class="label">{language.t('ui.Password')}</label>
			<PasswordInput
				id="password"
				name="password"
				autocomplete="new-password"
				required
				minlength={12}
				maxlength={128}
				aria-describedby={form?.message ? 'password-help auth-error' : 'password-help'}
			/>
			<p id="password-help" class="mt-2 text-xs text-[var(--color-text-secondary)]">
				{language.t('ui.Use.12.to.128.characters')}
			</p>
		</div>
		<ArtworkPicker bind:selected={selectedArtwork} disabled={pending} compact />
		<button type="submit" disabled={pending} class="btn btn-primary w-full disabled:opacity-50"
			>{pending ? language.t('ui.Please.wait') : language.t('ui.Create.an.account')}</button
		>
	</form>
	<p class="auth-switch">
		{language.t('ui.Already.have.an.account')}
		<a href={`/auth/login?returnTo=${encodeURIComponent(data.returnTo)}`}
			>{language.t('ui.Sign.in')}</a
		>
	</p>
</AccountLayout>
