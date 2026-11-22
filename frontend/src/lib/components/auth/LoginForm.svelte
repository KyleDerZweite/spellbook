<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { enhance } from '$app/forms';
	import PasswordInput from './PasswordInput.svelte';

	let {
		form,
		passwordMinlength,
		username = '',
		password
	}: {
		form: { message?: string; username?: string } | null | undefined;
		passwordMinlength: number;
		username?: string;
		password?: string;
	} = $props();
	let pending = $state(false);
</script>

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
			aria-describedby={form?.message ? 'auth-error' : undefined}
			name="username"
			autocomplete="username"
			required
			minlength="3"
			maxlength="32"
			value={form?.username ?? username}
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
			minlength={passwordMinlength}
			maxlength={128}
			value={password}
		/>
	</div>
	<button type="submit" disabled={pending} class="btn btn-primary w-full disabled:opacity-50"
		>{pending ? language.t('ui.Please.wait') : language.t('ui.Sign.in')}</button
	>
</form>
