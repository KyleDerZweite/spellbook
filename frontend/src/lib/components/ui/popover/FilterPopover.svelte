<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { Popover } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import Funnel from '@lucide/svelte/icons/funnel';
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

<Popover.Root bind:open>
	<Popover.Trigger class="btn btn-ghost filter-trigger" data-active={active || undefined}>
		<Funnel size={16} aria-hidden="true" class="shrink-0" />
		{triggerLabel}
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

<style>
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
