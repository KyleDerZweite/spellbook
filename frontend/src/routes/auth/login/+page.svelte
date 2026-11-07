<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { enhance } from '$app/forms';
	import AccountLayout from '#lib/components/auth/AccountLayout.svelte';
	import PasswordInput from '#lib/components/auth/PasswordInput.svelte';
	import QrSignIn from '#lib/components/auth/QrSignIn.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let pending = $state(false);
</script>

<svelte:head
	><title>{language.t('ui.Sign.in.Spellbook')}</title><meta
		name="robots"
		content="noindex"
	/></svelte:head
>

<AccountLayout title={language.t('ui.Sign.in')}>
	{#snippet aside()}<QrSignIn returnTo={data.returnTo} />{/snippet}
	{#if data.demoMode}<p class="mb-5 text-sm text-text-secondary">
			{language.t('ui.Demo.mode.Sign.in.with')} <strong>demo</strong> / <strong>demo</strong>.
		</p>{/if}
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
				{form.message}
			</p>{/if}
		<div>
			<label for="username" class="label">{language.t('ui.Username')}</label>
			<input
				id="username"
				aria-describedby={form?.message ? 'auth-error' : undefined}
				name="username"
				autocomplete="username"
				required
				minlength="3"
				maxlength="32"
				value={form?.username ?? ''}
				class="input w-full"
			/>
		</div>
		<div>
			<label for="password" class="label">{language.t('ui.Password')}</label>
			<PasswordInput
				id="password"
				aria-describedby={form?.message ? 'auth-error' : undefined}
				name="password"
				autocomplete="current-password"
				required
				minlength={data.demoMode ? 4 : 12}
				maxlength={128}
			/>
		</div>
		<button type="submit" disabled={pending} class="btn btn-primary w-full disabled:opacity-50"
			>{pending ? language.t('ui.Please.wait') : language.t('ui.Sign.in')}</button
		>
	</form>
	{#if !data.demoMode}<p class="auth-switch">
			{language.t('ui.New.to.Spellbook')}
			<a href={`/auth/register?returnTo=${encodeURIComponent(data.returnTo)}`}
				>{language.t('ui.Sign.up')}</a
			>
		</p>{/if}
</AccountLayout>
