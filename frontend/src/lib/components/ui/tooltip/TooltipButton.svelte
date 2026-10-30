<script lang="ts">
	import { Tooltip } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		label,
		tooltip = label,
		open = $bindable(false),
		keepOpenOnClick = false,
		onclick,
		children
	}: {
		label: string;
		tooltip?: string;
		open?: boolean;
		keepOpenOnClick?: boolean;
		onclick?: () => void;
		children: Snippet;
	} = $props();
</script>

<Tooltip.Provider delayDuration={200}>
	<Tooltip.Root bind:open disableCloseOnTriggerClick={keepOpenOnClick}>
		<Tooltip.Trigger class="btn btn-ghost btn-icon" aria-label={label} {onclick}>
			{@render children()}
		</Tooltip.Trigger>
		<Tooltip.Portal>
			<Tooltip.Content
				role="tooltip"
				side="bottom"
				align="end"
				sideOffset={8}
				collisionPadding={12}
				class="surface-menu z-[110] max-w-[min(16rem,calc(100vw-1.5rem))] rounded-lg px-3 py-2 text-xs font-normal text-text-primary"
			>
				{tooltip}
			</Tooltip.Content>
		</Tooltip.Portal>
	</Tooltip.Root>
</Tooltip.Provider>
