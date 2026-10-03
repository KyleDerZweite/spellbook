<!-- Adapted from shadcn-svelte's Button. See LICENSE for the upstream MIT notice. -->
<script lang="ts" module>
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	export type ButtonProps = HTMLButtonAttributes &
		HTMLAnchorAttributes & {
			variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';
			size?: 'default' | 'sm' | 'icon';
		};

	const variants = {
		default: 'btn-primary',
		secondary: 'btn-secondary',
		outline: 'btn-secondary',
		ghost: 'btn-ghost',
		destructive: 'btn-destructive'
	};
</script>

<script lang="ts">
	let {
		class: className,
		variant = 'default',
		size = 'default',
		href,
		type = 'button',
		disabled,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		{...restProps}
		data-slot="button"
		class={['btn', variants[variant], size !== 'default' && `btn-${size}`, className]}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? 'link' : undefined}
		tabindex={disabled ? -1 : restProps.tabindex}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		{...restProps}
		data-slot="button"
		class={['btn', variants[variant], size !== 'default' && `btn-${size}`, className]}
		{type}
		{disabled}
	>
		{@render children?.()}
	</button>
{/if}
