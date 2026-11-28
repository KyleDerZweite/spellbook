<script lang="ts">
	import X from '@lucide/svelte/icons/x';

	let {
		label,
		onclick,
		disabled = false
	}: {
		label: string;
		onclick: () => void;
		disabled?: boolean;
	} = $props();
</script>

<button type="button" class="sheet-close" aria-label={label} {onclick} {disabled}>
	<X size={20} aria-hidden="true" />
</button>

<style>
	.sheet-close {
		position: absolute;
		top: 12px;
		right: 12px;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		color: var(--color-text-secondary);
		border-radius: 8px;
		cursor: pointer;
	}
	.sheet-close:hover {
		background: var(--color-muted);
		color: var(--color-text-primary);
	}
</style>
