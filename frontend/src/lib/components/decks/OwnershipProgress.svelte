<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
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
	aria-label={language.t(
		'message.Inventory.match.p0.exact.printing.p1.alternate.printing.p2.missing',
		{ p0: String(exact), p1: String(alternate), p2: String(missing) }
	)}
>
	<div class="counts">
		<span
			>{language.t('sentence.p0.p1.owned', {
				p0: String(owned.toLocaleString(language.locale)),
				p1: String(required.toLocaleString(language.locale))
			})}</span
		><span>{required ? Math.floor((owned / required) * 100) : 0}%</span>
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
