<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { pwaState } from '#lib/pwa/state.svelte.ts';
</script>

{#if !pwaState.online}
	<aside class="app-status" aria-label={language.t('ui.App.status')}>
		<p role="status">
			{language.t(
				'ui.Your.browser.is.offline.Reconnect.before.loading.account.data.or.saving.changes'
			)}
		</p>
	</aside>
{/if}

<style>
	.app-status {
		margin: 0.75rem 1rem;
		padding: 1rem;
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		background: var(--color-background);
	}
</style>
