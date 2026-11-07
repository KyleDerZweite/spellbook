<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import InstallApp from '#lib/components/pwa/InstallApp.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head
	><title>{language.t('ui.Spellbook.app')}</title><meta
		name="robots"
		content="noindex"
	/></svelte:head
>

<div class="app-home mx-auto w-full max-w-2xl px-4 py-8 space-y-8">
	<header class="space-y-2">
		<h1 class="text-3xl font-semibold">{language.t('ui.Your.Spellbook')}</h1>
		<p class="text-text-secondary">{language.t('ui.Your.cards.decks.and.connected.devices')}</p>
	</header>
	{#if data.user}
		<section class="space-y-4" aria-label={language.t('ui.Your.account')}>
			<p>{language.t('ui.Signed.in.as')} <strong>{data.user.username}</strong>.</p>
			<a class="btn btn-primary w-full" href="/app/connect">{language.t('ui.Connect.device')}</a>
			<p class="text-sm text-text-secondary">
				{language.t('ui.Scan.a.sign.in.QR.code.to.approve.access.on.another.browser.or.device')}
			</p>
			<div class="grid grid-cols-2 gap-3">
				<a href="/mtg/inventory" class="btn btn-secondary">{language.t('ui.Inventory')}</a><a
					href="/mtg/decks"
					class="btn btn-secondary">{language.t('ui.Decks')}</a
				>
			</div>
		</section>
	{:else}
		<section class="space-y-4">
			<p>{language.t('ui.Sign.in.to.connect.devices.and.open.your.account')}</p>
			<a href="/auth/login?returnTo=/app" class="btn btn-primary">{language.t('ui.Sign.in')}</a>
		</section>
	{/if}
	<section
		class="rounded-xl border border-border p-5 space-y-4"
		aria-label={language.t('ui.Install.app')}
	>
		<h2 class="text-xl font-semibold">{language.t('ui.Spellbook.on.your.phone')}</h2>
		<InstallApp />
	</section>
</div>
