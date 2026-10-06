<script lang="ts">
	import { ScrollArea as BitsScrollArea } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { smoothWheelScroll } from './wheel.ts';

	type Props = Omit<BitsScrollArea.RootProps, 'child' | 'children' | 'ref' | 'class'> & {
		children: Snippet;
		class?: string;
		tag?: 'div' | 'main';
		viewportClass?: string;
		viewportRef?: HTMLDivElement | null;
		viewportLabel?: string;
		smoothWheel?: boolean;
	};

	let {
		children,
		class: className = '',
		tag = 'div',
		viewportClass = '',
		viewportRef = $bindable(null),
		viewportLabel,
		smoothWheel = true,
		...restProps
	}: Props = $props();

	$effect(() => {
		if (viewportRef && smoothWheel) return smoothWheelScroll(viewportRef);
	});
</script>

<BitsScrollArea.Root type="auto" class={['scroll-area', className]} {...restProps}>
	{#snippet child({ props })}
		<svelte:element this={tag} {...props}>
			<BitsScrollArea.Viewport
				bind:ref={viewportRef}
				class={['scroll-area-viewport', viewportClass]}
				tabindex={0}
				aria-label={viewportLabel}
			>
				{@render children()}
			</BitsScrollArea.Viewport>
			<BitsScrollArea.Scrollbar orientation="vertical" class="scroll-area-scrollbar">
				<BitsScrollArea.Thumb class="scroll-area-thumb" />
			</BitsScrollArea.Scrollbar>
		</svelte:element>
	{/snippet}
</BitsScrollArea.Root>

<style>
	:global(.scroll-area) {
		--scroll-area-gutter: 10px;
		position: relative;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}
	:global(.scroll-area-viewport) {
		position: relative;
		width: calc(100% - var(--scroll-area-gutter));
		height: 100%;
		min-height: 0;
		scroll-behavior: auto;
		overflow-y: auto !important;
	}
	:global(.scroll-area-viewport > [data-scroll-area-content]) {
		min-width: 0;
	}
	:global(.scroll-area-scrollbar) {
		top: var(--scroll-area-inset-top, 0px) !important;
		display: flex;
		width: var(--scroll-area-gutter);
		padding: 2px;
		touch-action: none;
		user-select: none;
	}
	:global(.scroll-area-thumb) {
		flex: 1;
		border-radius: 999px;
		background: var(--color-scrollbar);
	}
	:global(.scroll-area-scrollbar:hover .scroll-area-thumb) {
		background: color-mix(in srgb, var(--color-scrollbar) 75%, var(--color-text-primary));
	}
</style>
