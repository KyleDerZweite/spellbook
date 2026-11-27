<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import ScrollArea from '#lib/components/ui/scroll-area/ScrollArea.svelte';

	let {
		label,
		items,
		trigger,
		header,
		triggerRef = $bindable(null),
		iconOnly = false,
		variant = 'default',
		class: className = '',
		onCloseAutoFocus
	}: {
		label: string;
		items: Array<{
			label: string;
			icon?: Snippet;
			onSelect?: () => void;
			href?: string;
			download?: boolean;
			destructive?: boolean;
			disabled?: boolean;
		}>;
		trigger?: Snippet;
		header?: Snippet;
		triggerRef?: HTMLButtonElement | null;
		iconOnly?: boolean;
		variant?: 'default' | 'toolbar';
		class?: string;
		onCloseAutoFocus?: (event: Event) => void;
	} = $props();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		bind:ref={triggerRef}
		class={[
			'btn',
			iconOnly
				? 'btn-ghost btn-icon'
				: variant === 'toolbar'
					? 'btn-ghost menu-trigger-toolbar'
					: 'btn-secondary',
			className
		]}
		aria-label={label}
	>
		{#if trigger}{@render trigger()}{:else if iconOnly}<EllipsisVertical
				size={20}
				aria-hidden="true"
				class="shrink-0"
			/>{:else}{label}{/if}
		{#if !iconOnly}<ChevronDown
				size={16}
				aria-hidden="true"
				class="shrink-0 text-text-muted"
			/>{/if}
	</DropdownMenu.Trigger>
	<DropdownMenu.Portal>
		<DropdownMenu.Content
			class="surface-menu z-[120] min-w-48 max-w-[min(20rem,calc(100vw-1.5rem))] rounded-lg outline-none"
			sideOffset={8}
			collisionPadding={12}
			align="end"
			{onCloseAutoFocus}
		>
			<ScrollArea
				viewportClass="menu-scroll-viewport p-1"
				viewportTabindex={-1}
				smoothWheel={false}
			>
				{#if header}<div class="px-3 py-2">{@render header()}</div>{/if}
				{#each items as item (item.label)}
					<DropdownMenu.Item
						class={['menu-item rounded-md outline-none', item.destructive && 'text-error']}
						disabled={item.disabled}
						textValue={item.label}
						onSelect={item.onSelect}
					>
						{#snippet child({ props })}
							{#if item.href}
								<a
									{...props}
									href={item.disabled ? undefined : item.href}
									download={item.download || undefined}
									>{#if item.icon}{@render item.icon()}{/if}{item.label}</a
								>
							{:else}
								<div {...props}>
									{#if item.icon}{@render item.icon()}{/if}{item.label}
								</div>
							{/if}
						{/snippet}
					</DropdownMenu.Item>
				{/each}
			</ScrollArea>
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
	:global(.menu-trigger-toolbar) {
		padding-inline: 0.75rem;
		border: 0;
		background: transparent;
	}
	:global(.menu-scroll-viewport) {
		max-height: calc(var(--bits-dropdown-menu-content-available-height) - 2px);
	}
</style>
