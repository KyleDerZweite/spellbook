<script lang="ts">
	import ActionMenu from '#lib/components/ui/menu/ActionMenu.svelte';
	import { PROFILE_KPIS, profileKpiValue, type ProfileKpiKey } from '#lib/profile/card.ts';
	import type { ProfileTotals } from '#lib/profile/types.ts';
	let {
		fieldLabel,
		totals,
		disabled = false,
		onInsert
	}: {
		fieldLabel: string;
		totals: ProfileTotals | null;
		disabled?: boolean;
		onInsert: (key: ProfileKpiKey) => void;
	} = $props();
	let inserted = false;
	let items = $derived(
		PROFILE_KPIS.map((kpi) => ({
			label: `${kpi.label} · ${profileKpiValue(kpi.key, totals)}`,
			disabled,
			onSelect: () => {
				inserted = true;
				onInsert(kpi.key);
			}
		}))
	);
</script>

<fieldset {disabled} class="kpi-insert">
	<ActionMenu
		label={`Insert KPI into ${fieldLabel}`}
		{items}
		class="!min-h-8 max-sm:!min-h-11 !px-2 !py-1 !text-xs"
		onCloseAutoFocus={(event) => {
			if (inserted) event.preventDefault();
			inserted = false;
		}}
	>
		{#snippet trigger()}Insert KPI{/snippet}
	</ActionMenu>
</fieldset>

<style>
	.kpi-insert {
		padding: 0;
		border: 0;
		margin: 0;
		min-width: 0;
	}
</style>
