<script lang="ts">
	import type { Component } from 'svelte';
	import Archive from '@lucide/svelte/icons/archive';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import FileStack from '@lucide/svelte/icons/file-stack';
	import Layers from '@lucide/svelte/icons/layers';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import type { PowerSearchKind } from '#lib/search/power-search.ts';

	let { kind }: { kind: PowerSearchKind | 'search' } = $props();

	const icons: Record<
		PowerSearchKind | 'search',
		Component<{ size?: number; class?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
	> = {
		search: Search,
		catalog: Search,
		inventory: Archive,
		deck: Layers,
		'deck-card': FileStack,
		setting: SlidersHorizontal,
		page: ExternalLink,
		action: Plus
	};

	const Icon = $derived(icons[kind]);
</script>

<Icon size={16} aria-hidden="true" class="shrink-0" />
