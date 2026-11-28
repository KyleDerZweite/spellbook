<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	import { fitVisualViewport, mobileSheet } from '../dialog/mobile-sheet.ts';
	import X from '@lucide/svelte/icons/x';
	import { DropdownMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import ScrollArea from '#lib/components/ui/scroll-area/ScrollArea.svelte';

	const language = useLanguage();

	let {
		label,
		items,
		trigger,
		header,
		triggerRef = $bindable(null),
		iconOnly = false,
		sheetOnMobile = false,
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
		sheetOnMobile?: boolean;
		variant?: 'default' | 'toolbar';
		class?: string;
		onCloseAutoFocus?: (event: Event) => void;
	} = $props();
	let sheet = $derived(sheetOnMobile && mobileSheet.current);
	let Content = $derived(sheet ? DropdownMenu.ContentStatic : DropdownMenu.Content);
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
		<Content
			class={[
				'surface-menu z-[120] rounded-lg outline-none',
				sheet ? 'mobile-sheet action-sheet' : 'min-w-48 max-w-[min(20rem,calc(100vw-1.5rem))]'
			]}
			{...sheet ? {} : { sideOffset: 8, collisionPadding: 12, align: 'end' as const }}
			{onCloseAutoFocus}
		>
			{#snippet child({ props })}
				<div {...props} {@attach sheet ? fitVisualViewport : undefined}>
					{#if sheet}
						<DropdownMenu.Item
							class="menu-item action-sheet-close"
							textValue={language.t('ui.Close.actions')}
						>
							<X size={20} aria-hidden="true" />
							{language.t('ui.Close.actions')}
						</DropdownMenu.Item>
					{/if}
					{@render menuBody()}
				</div>
			{/snippet}
		</Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>

{#snippet menuBody()}
	<ScrollArea
		class={sheet ? 'mobile-sheet-body' : undefined}
		viewportClass={sheet ? 'mobile-sheet-viewport p-1' : 'menu-scroll-viewport p-1'}
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
						>
							{#if item.icon}{@render item.icon()}{/if}{item.label}
						</a>
					{:else}
						<div {...props}>
							{#if item.icon}{@render item.icon()}{/if}{item.label}
						</div>
					{/if}
				{/snippet}
			</DropdownMenu.Item>
		{/each}
	</ScrollArea>
{/snippet}

<style>
	:global(.action-sheet) {
		box-shadow: 0 0 0 100vmax rgb(0 0 0 / 55%);
	}
	:global(.action-sheet .menu-item) {
		min-height: 44px;
	}
	:global(.action-sheet-close) {
		flex-shrink: 0;
		justify-content: flex-end;
	}

	:global(.menu-trigger-toolbar) {
		padding-inline: 0.75rem;
		border: 0;
		background: transparent;
	}
	:global(.menu-scroll-viewport) {
		max-height: calc(var(--bits-dropdown-menu-content-available-height) - 2px);
	}
</style>
