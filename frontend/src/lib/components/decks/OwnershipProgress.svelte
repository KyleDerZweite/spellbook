<script lang="ts">
	let {
		required,
		exact,
		alternate,
		missing
	}: { required: number; exact: number; alternate: number; missing: number } = $props();
	const owned = $derived(exact + alternate);
</script>

<div
	class="ownership"
	aria-label={`Inventory match: ${exact} exact printing, ${alternate} alternate printing, ${missing} missing`}
>
	<div class="counts">
		<span>{owned.toLocaleString()} / {required.toLocaleString()} owned</span><span
			>{required ? Math.floor((owned / required) * 100) : 0}%</span
		>
	</div>
	<div class="track" aria-hidden="true">
		{#each [{ value: exact, color: 'var(--color-success)' }, { value: alternate, color: 'var(--color-violet)' }, { value: missing, color: 'var(--color-warning)' }] as segment}<span
				style:width={`${required ? (segment.value / required) * 100 : 0}%`}
				style:background={segment.color}
			></span>{/each}
	</div>
</div>

<style>
	.ownership {
		width: 100%;
		min-width: 0;
	}
	.counts {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font: 11px/1.5 monospace;
		color: var(--color-text-secondary);
	}
	.track {
		display: flex;
		height: 4px;
		margin-top: 6px;
		overflow: hidden;
		border-radius: 2px;
		background: var(--color-border);
	}
</style>
