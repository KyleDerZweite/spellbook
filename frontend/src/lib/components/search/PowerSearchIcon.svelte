<script lang="ts">
	import type { PowerSearchKind } from '#lib/search/power-search.ts';
	let { kind }: { kind: PowerSearchKind | 'search' } = $props();
	const paths: Record<PowerSearchKind | 'search', string> = {
		search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
		catalog: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
		inventory: 'M3 8h18v12H3zM3 8l3-5h12l3 5M9 12h6',
		deck: 'M7 3h13v15H7zM4 6v15h13',
		'deck-card': 'M7 3h13v15H7zM4 6v15h13M10 7h7M10 10h7',
		setting: 'M4 6h6m4 0h6M4 12h10m4 0h2M4 18h2m4 0h10M10 3v6M14 9v6M6 15v6',
		page: 'M14 3h7v7M21 3L10 14M10 3H3v18h18v-7',
		action: 'M12 5v14M5 12h14'
	};
</script>

<svg
	width="16"
	height="16"
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"><path d={paths[kind]} /></svg
>
