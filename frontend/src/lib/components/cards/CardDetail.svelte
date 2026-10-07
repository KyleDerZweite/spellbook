<script lang="ts">
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import type { CardDocument } from '#lib/search/types.ts';
	import CardInspector from './CardInspector.svelte';

	interface Props {
		card: CardDocument;
		inventoryEntryId?: string;
		onClose: () => void;
		actions?: Snippet<[CardDocument]>;
		returnFocus?: HTMLElement | null;
	}
	let { card, onClose, actions, returnFocus, inventoryEntryId }: Props = $props();
	let detailOpen = $state(false);
	let pending = $state(false);
	let initialFocus: HTMLElement | null = null;
	$effect(() => {
		initialFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		detailOpen = true;
	});
	function changeOpen(open: boolean) {
		if (!open && pending) return;
		detailOpen = open;
		if (!open) onClose();
	}
</script>

<Dialog.Root open={detailOpen} onOpenChange={changeOpen}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4 lg:p-8"
			style="background: rgba(8, 11, 13, 0.85); backdrop-filter: blur(4px);"
		>
			<Dialog.Content
				escapeKeydownBehavior={pending ? 'ignore' : 'close'}
				interactOutsideBehavior={pending ? 'ignore' : 'close'}
				onCloseAutoFocus={(event) => {
					const target = returnFocus ?? initialFocus;
					if (target?.isConnected) {
						event.preventDefault();
						target.focus({ preventScroll: true });
					}
				}}
				class="modal-content relative z-50 flex w-full flex-col rounded-t-xl border border-border bg-stone shadow-xl sm:max-w-5xl sm:rounded-lg"
				style="max-height: 92dvh;"
			>
				<Dialog.Title class="sr-only">{card.name}</Dialog.Title>
				<Dialog.Description class="sr-only"
					>Card information and printing selection.</Dialog.Description
				>
				<CardInspector
					{card}
					{actions}
					{inventoryEntryId}
					onPendingChange={(value) => (pending = value)}
				/>
				<Dialog.Close
					disabled={pending}
					class="btn btn-ghost btn-icon absolute right-2 top-2 z-10"
					aria-label="Close card detail">✕</Dialog.Close
				>
			</Dialog.Content>
		</Dialog.Overlay>
	</Dialog.Portal>
</Dialog.Root>
