<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	import { clearDemo } from './storage.ts';

	let { session }: { session: string } = $props();
	const language = useLanguage();
	let pending = $state(false);
	let failed = $state(false);

	async function reset() {
		pending = true;
		failed = false;
		try {
			await clearDemo(session);
			const path = window.location.pathname;
			if (path === '/mtg/decks') window.location.replace('/mtg/decks');
			else if (path.startsWith('/mtg/inventory')) window.location.replace('/mtg/inventory');
			else window.location.reload();
		} catch {
			failed = true;
			pending = false;
		}
	}
</script>

<aside
	class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
	aria-label={language.t('demo.title')}
>
	<div>
		<strong>{language.t('demo.title')}</strong>
		<p>{language.t('demo.description')}</p>
	</div>
	<button class="btn btn-primary" type="button" onclick={reset} disabled={pending}>
		{language.t(pending ? 'demo.resetting' : 'demo.reset')}
	</button>
	{#if failed}<p role="alert">{language.t('ui.Could.not.save.Try.again')}</p>{/if}
</aside>
