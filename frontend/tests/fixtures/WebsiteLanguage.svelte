<script lang="ts">
	import QrScanner from '../../src/lib/components/auth/QrScanner.svelte';
	import { provideLanguage } from '../../src/lib/i18n/context.ts';
	import type { Locale } from '../../src/lib/i18n/locale.ts';
	import NativeRangeNavigation from '../../src/lib/components/ui/pagination/NativeRangeNavigation.svelte';
	import { parseLazyBrowsePagination } from '../../src/lib/browsing/pagination.ts';
	let { locale }: { locale: Locale } = $props();
	const language = provideLanguage(() => locale);
</script>

<p>{language.t('ui.Quantity')} {language.t(`cards.${language.plural(2)}`, { count: 2 })}</p>
<NativeRangeNavigation
	state={parseLazyBrowsePagination(new URLSearchParams('page=2'))}
	total={600}
	canonicalURL={new URL('https://example.test/mtg/search?q=Island&language=en')}
/>

<QrScanner onScan={() => {}} />
