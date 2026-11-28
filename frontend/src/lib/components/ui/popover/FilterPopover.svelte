<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { Dialog, Popover } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import Funnel from '@lucide/svelte/icons/funnel';
	import SheetClose from '../dialog/SheetClose.svelte';
	import { fitVisualViewport, mobileSheet } from '../dialog/mobile-sheet.ts';
	import ScrollArea from '#lib/components/ui/scroll-area/ScrollArea.svelte';

	let {
		open = $bindable(false),
		active = false,
		children,
		label = language.t('ui.Filters'),
		triggerLabel = language.t('ui.Filter'),
		onOpenAutoFocus,
		onCloseAutoFocus
	}: {
		open?: boolean;
		active?: boolean;
		children: Snippet;
		label?: string;
		triggerLabel?: string;
		onOpenAutoFocus?: (event: Event) => void;
		onCloseAutoFocus?: (event: Event) => void;
	} = $props();
</script>

{#snippet trigger()}
	<Funnel size={16} aria-hidden="true" class="shrink-0" />
	{triggerLabel}
{/snippet}

{#if mobileSheet.current}
	<Dialog.Root bind:open>
		<Dialog.Trigger class="btn btn-ghost filter-trigger" data-active={active || undefined}>
			{@render trigger()}
		</Dialog.Trigger>
		<Dialog.Portal>
			<Dialog.Overlay class="filter-sheet-overlay" />
			<Dialog.Content
				class="surface-menu mobile-sheet filter-sheet"
				{onOpenAutoFocus}
				{onCloseAutoFocus}
			>
				{#snippet child({ props })}
					<div {...props} {@attach fitVisualViewport}>
						<div class="mobile-sheet-heading">
							<Dialog.Title class="font-display text-section-title">{label}</Dialog.Title>
							<SheetClose label={language.t('ui.Close.filters')} onclick={() => (open = false)} />
						</div>
						<ScrollArea
							class="mobile-sheet-body"
							viewportClass="filter-sheet-body mobile-sheet-viewport"
							viewportTabindex={-1}
						>
							{@render children()}
						</ScrollArea>
					</div>
				{/snippet}
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
{:else}
	<Popover.Root bind:open>
		<Popover.Trigger class="btn btn-ghost filter-trigger" data-active={active || undefined}>
			{@render trigger()}
		</Popover.Trigger>
		<Popover.Portal>
			<Popover.Content
				class="surface-menu filter-popover"
				aria-label={label}
				align="end"
				sideOffset={8}
				collisionPadding={12}
				{onOpenAutoFocus}
				{onCloseAutoFocus}
			>
				<ScrollArea viewportClass="filter-popover-body" viewportTabindex={-1}>
					{@render children()}
				</ScrollArea>
			</Popover.Content>
		</Popover.Portal>
	</Popover.Root>
{/if}

<style>
	:global(.filter-sheet-overlay) {
		position: fixed;
		inset: 0;
		z-index: 99;
		background: rgb(0 0 0 / 55%);
	}
	:global(.filter-sheet) {
		z-index: 100;
		outline: none;
	}
	:global(.filter-sheet-body) {
		padding: 1rem;
	}
	:global(.filter-trigger) {
		padding-inline: 0.75rem;
	}
	:global(.filter-trigger[data-active]) {
		color: var(--color-text-primary);
	}
	:global(.filter-popover) {
		position: relative;
		z-index: 100;
		width: min(24rem, calc(100vw - 1.5rem));
		border-radius: 0.5rem;
		outline: none;
	}
	:global(.filter-popover-body) {
		max-height: calc(var(--bits-popover-content-available-height) - 2px);
		padding: 1rem;
	}
</style>
