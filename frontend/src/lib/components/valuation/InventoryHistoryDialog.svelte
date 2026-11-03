<script lang="ts">
	import type {
		InventoryValueHistory,
		InventoryValueHistoryRequest
	} from '@spellbook/contracts/inventory-value.ts';
	import FormDialog from '#lib/components/ui/dialog/FormDialog.svelte';
	import InventoryValueHistoryPreview from './InventoryValueHistoryPreview.svelte';
	let {
		initialHistory = null,
		query = { days: 30 },
		demo = false,
		onCancel,
		onCloseAutoFocus
	}: {
		initialHistory?: InventoryValueHistory | null;
		query?: InventoryValueHistoryRequest;
		demo?: boolean;
		onCancel: () => void;
		onCloseAutoFocus?: (event: Event) => void;
	} = $props();
</script>

<FormDialog
	title={query.printingId ? 'Card value history' : 'Inventory value'}
	description=""
	variant="history"
	{onCancel}
	{onCloseAutoFocus}
>
	<InventoryValueHistoryPreview {initialHistory} initialQuery={query} {demo} />
</FormDialog>
