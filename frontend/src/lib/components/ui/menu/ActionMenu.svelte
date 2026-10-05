<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		label,
		items,
		trigger,
		header,
		triggerRef = $bindable(null),
		iconOnly = false,
		class: className = '',
		onCloseAutoFocus
	}: {
		label: string;
		items: Array<{
			label: string;
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
		class?: string;
		onCloseAutoFocus?: (event: Event) => void;
	} = $props();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		bind:ref={triggerRef}
		class={['btn', iconOnly ? 'btn-ghost btn-icon' : 'btn-secondary', className]}
		aria-label={label}
	>
		{#if trigger}{@render trigger()}{:else}{label}{/if}
		{#if !iconOnly}<svg
				aria-hidden="true"
				class="shrink-0 text-text-muted"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.7"
				stroke-linecap="round"
				stroke-linejoin="round"><path d="m7 10 5 5 5-5" /></svg
			>{/if}
	</DropdownMenu.Trigger>
	<DropdownMenu.Portal>
		<DropdownMenu.Content
			class="surface-menu z-[100] min-w-48 max-w-[min(20rem,calc(100vw-1.5rem))] max-h-[var(--bits-dropdown-menu-content-available-height)] overflow-y-auto rounded-lg p-1 outline-none"
			sideOffset={5}
			collisionPadding={12}
			align="end"
			{onCloseAutoFocus}
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
								download={item.download || undefined}>{item.label}</a
							>
						{:else}
							<div {...props}>{item.label}</div>
						{/if}
					{/snippet}
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>
