<script lang="ts">
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let {
		title,
		description,
		trigger,
		open = $bindable(false),
		children,
		destructive = false
	}: {
		title: string;
		description: string;
		trigger: string;
		open?: boolean;
		children: Snippet;
		destructive?: boolean;
	} = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger class={`btn btn-secondary ${destructive ? 'destructive' : ''}`}
		>{trigger}</Dialog.Trigger
	>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/70" />
		<Dialog.Content
			class="deck-dialog fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-mist bg-crypt p-6 text-text-primary shadow-2xl"
		>
			<div class="mb-2 flex items-start justify-between gap-4">
				<Dialog.Title class="text-xl font-semibold">{title}</Dialog.Title>
				<Dialog.Close class="btn btn-ghost" aria-label="Close dialog">Close</Dialog.Close>
			</div>
			<Dialog.Description class="mb-5 text-sm text-text-secondary">{description}</Dialog.Description
			>
			{@render children()}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
