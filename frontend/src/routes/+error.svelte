<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>{page.status} | Spellbook</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-8 sm:px-6">
	<div class="page-title mb-3">
		<h1>
			{page.status === 404 ? language.t('ui.Page.not.found') : language.t('ui.Page.unavailable')}
		</h1>
	</div>
	<p class="text-sm leading-relaxed text-text-secondary">
		{page.error?.message ?? language.t('ui.This.page.could.not.be.loaded')}
	</p>
	<div class="mt-6 flex flex-wrap gap-3">
		{#if page.status >= 500}
			<button class="btn btn-primary" onclick={() => window.location.reload()}
				>{language.t('ui.Try.again')}</button
			>
		{/if}
		<a class="btn btn-secondary" href="/mtg/search">{language.t('ui.Search.cards')}</a>
		<a class="btn btn-ghost" href="/">{language.t('ui.Home')}</a>
	</div>
</div>
