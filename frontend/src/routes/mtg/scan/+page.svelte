<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import type { PageProps } from './$types';
	import ScanWorkspace from './ScanWorkspace.svelte';
	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{language.t('ui.Scan.Spellbook')}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#key data.result?.session?.id ?? 'new'}
	<ScanWorkspace
		accountId={data.user?.accountId ?? ''}
		sessions={data.sessions}
		initialResult={data.result}
	/>
{/key}
