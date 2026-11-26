<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import AccountLayout from '#lib/components/auth/AccountLayout.svelte';
	import LoginForm from '#lib/components/auth/LoginForm.svelte';
	import type { PageProps } from './$types';
	let { form }: PageProps = $props();
</script>

<svelte:head
	><title>{language.t('ui.Sign.in.Spellbook')}</title><meta
		name="robots"
		content="noindex"
	/></svelte:head
>

<AccountLayout title={language.t('ui.Sign.in')}>
	<p class="mb-4 text-sm text-text-secondary">
		{language.t('ui.Shared.Demo.account.note')}
	</p>
	<LoginForm {form} passwordMinlength={4} username="demo" password="demo" />
</AccountLayout>
