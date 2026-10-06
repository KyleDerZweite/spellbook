<script lang="ts">
	import { AlertDialog } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		open,
		title,
		description,
		pending = false,
		error = '',
		children,
		onCancel,
		onCloseAutoFocus
	}: {
		open: boolean;
		title: string;
		description: string;
		pending?: boolean;
		error?: string;
		children: Snippet;
		onCancel: () => void;
		onCloseAutoFocus?: (event: Event) => void;
	} = $props();
	let cancelButton = $state<HTMLButtonElement | null>(null);
</script>

<AlertDialog.Root
	{open}
	onOpenChange={(value) => {
		if (!value && !pending) onCancel();
	}}
>
	<AlertDialog.Portal>
		<AlertDialog.Overlay class="confirm-overlay" />
		<AlertDialog.Content
			class="surface-menu confirm-dialog"
			onOpenAutoFocus={(event) => {
				event.preventDefault();
				cancelButton?.focus();
			}}
			{onCloseAutoFocus}
			onEscapeKeydown={(event) => {
				if (pending) event.preventDefault();
			}}
		>
			<AlertDialog.Title class="confirm-title">{title}</AlertDialog.Title>
			<AlertDialog.Description class="confirm-description">{description}</AlertDialog.Description>
			{#if error}<p class="confirm-error" role="alert">{error}</p>{/if}
			<div class="confirm-actions">
				<AlertDialog.Cancel bind:ref={cancelButton} class="btn btn-secondary" disabled={pending}
					>Cancel</AlertDialog.Cancel
				>
				{@render children()}
			</div>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>

<style>
	:global(.confirm-overlay) {
		position: fixed;
		inset: 0;
		z-index: 110;
		background: rgb(0 0 0 / 55%);
	}
	:global(.confirm-dialog) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 111;
		width: min(27rem, calc(100vw - 2rem));
		max-height: calc(100dvh - 2rem);
		overflow-y: auto;
		border-radius: 0.75rem;
		padding: 1.25rem;
		outline: none;
	}
	:global(.confirm-title) {
		font-family: var(--font-display);
		font-size: 1.5rem;
		margin-bottom: 0.75rem;
	}
	:global(.confirm-description) {
		font-size: 0.8125rem;
		line-height: 1.65;
		color: var(--color-text-secondary);
	}
	.confirm-error {
		color: var(--color-error);
		font-size: 0.8125rem;
		margin-top: 0.75rem;
	}
	.confirm-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1.25rem;
	}
</style>
