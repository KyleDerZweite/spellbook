<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import AccountLayout from '#lib/components/auth/AccountLayout.svelte';
	import LoginForm from '#lib/components/auth/LoginForm.svelte';
	import QrSignIn from '#lib/components/auth/QrSignIn.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	const demoLink = $derived(`/auth/login/demo?returnTo=${encodeURIComponent(data.returnTo)}`);
</script>

<svelte:head>
	<title>{language.t('ui.Sign.in.Spellbook')}</title><meta name="robots" content="noindex" />
</svelte:head>

<AccountLayout title={language.t('ui.Sign.in')}>
	{#snippet aside()}<QrSignIn returnTo={data.returnTo} />{/snippet}
	{#if data.demoMode}<p class="mb-4 text-sm text-text-secondary">
			{language.t('ui.Demo.mode.Sign.in.with')} <strong>demo</strong> / <strong>demo</strong>.
		</p>{:else if data.demoLoginEnabled}<p class="mb-4 text-sm text-text-secondary">
			{language.t('ui.Just.looking.around')}
			<a href={demoLink}>{language.t('ui.Try.the.shared.Demo.account')}</a>
		</p>{/if}
	<LoginForm {form} passwordMinlength={data.demoMode ? 4 : 12} />
	{#if data.registrationOpen}<p class="auth-switch">
			{language.t('ui.New.to.Spellbook')}
			<a href={`/auth/register?returnTo=${encodeURIComponent(data.returnTo)}`}>
				{language.t('ui.Sign.up')}
			</a>
		</p>{:else if !data.demoMode}<p class="auth-switch">
			{language.t('ui.Registration.disabled.Ask.operator')}
		</p>{/if}
</AccountLayout>
