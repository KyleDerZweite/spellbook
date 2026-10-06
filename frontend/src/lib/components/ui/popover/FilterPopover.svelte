<script lang="ts">
	import { Popover } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import ScrollArea from '#lib/components/ui/scroll-area/ScrollArea.svelte';

	let {
		open = $bindable(false),
		active = false,
		children,
		label = 'Filters',
		onOpenAutoFocus,
		onCloseAutoFocus
	}: {
		open?: boolean;
		active?: boolean;
		children: Snippet;
		label?: string;
		onOpenAutoFocus?: (event: Event) => void;
		onCloseAutoFocus?: (event: Event) => void;
	} = $props();
</script>

<Popover.Root bind:open>
	<Popover.Trigger class="btn btn-ghost filter-trigger" data-active={active || undefined}>
		<svg
			aria-hidden="true"
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.6"
			stroke-linecap="round"
			stroke-linejoin="round"><path d="M4 4h16l-6 7v7l-4 2v-9z" /></svg
		>
		Filter
	</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content
			class="surface-menu filter-popover"
			aria-label={label}
			align="end"
			sideOffset={5}
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
		padding-inline: 0.625rem;
		font-size: 0.75rem;
	}
	:global(.filter-trigger[data-active]) {
		color: var(--color-text-primary);
	}
	:global(.filter-popover) {
		position: relative;
		z-index: 100;
		width: min(24rem, calc(100vw - 1.5rem));
		border-radius: 0.625rem;
		outline: none;
	}
	:global(.filter-popover-body) {
		max-height: calc(var(--bits-popover-content-available-height) - 2px);
		padding: 0.875rem;
	}
</style>
