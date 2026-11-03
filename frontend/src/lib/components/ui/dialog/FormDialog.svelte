<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { tick, type Snippet } from 'svelte';
	import ScrollArea from '#lib/components/ui/scroll-area/ScrollArea.svelte';
	let {
		title,
		description,
		pending = false,
		variant = 'default',
		onCancel,
		onCloseAutoFocus,
		children
	}: {
		title: string;
		description: string;
		pending?: boolean;
		variant?: 'default' | 'import' | 'history';
		onCancel: () => void;
		onCloseAutoFocus?: (event: Event) => void;
		children: Snippet;
	} = $props();
	let content = $state<HTMLDivElement | null>(null);
</script>

<Dialog.Root
	open
	onOpenChange={(open) => {
		if (!open && !pending) onCancel();
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay class="form-dialog-overlay" />
		<Dialog.Content
			bind:ref={content}
			class={[
				'surface-menu form-dialog',
				variant === 'import' && 'form-dialog-import',
				variant === 'history' && 'form-dialog-history'
			]}
			escapeKeydownBehavior={pending ? 'ignore' : 'close'}
			interactOutsideBehavior={pending ? 'ignore' : 'close'}
			{onCloseAutoFocus}
			onOpenAutoFocus={(event) => {
				event.preventDefault();
				void tick().then(() =>
					content
						?.querySelector<HTMLElement>(
							'input:not([type=hidden]):not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)'
						)
						?.focus()
				);
			}}
		>
			<div class="form-dialog-heading">
				<Dialog.Title class="font-display text-2xl">{title}</Dialog.Title>
				<Dialog.Description class="text-sm text-text-secondary">{description}</Dialog.Description>
				{#if variant === 'history'}<button
						type="button"
						class="history-close"
						disabled={pending}
						onclick={onCancel}
						aria-label="Close value history"
						><svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg
						></button
					>{/if}
			</div>
			<ScrollArea
				class="form-dialog-body"
				viewportClass="form-dialog-content"
				viewportTabindex={-1}
			>
				{@render children()}
			</ScrollArea>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.form-dialog-overlay) {
		position: fixed;
		inset: 0;
		z-index: 110;
		background: rgb(0 0 0 / 55%);
	}
	:global(.form-dialog) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 111;
		display: flex;
		flex-direction: column;
		width: min(27rem, calc(100vw - 2rem));
		max-height: calc(100dvh - 2rem);
		border-radius: 0.75rem;
		outline: none;
	}
	:global(.form-dialog-import) {
		width: min(42rem, calc(100vw - 2rem));
	}
	:global(.form-dialog-history) {
		width: min(72rem, calc(100vw - 2rem));
	}
	:global(.form-dialog-history) .form-dialog-heading {
		position: relative;
		padding-right: 4.5rem;
	}
	.history-close {
		position: absolute;
		top: 12px;
		right: 12px;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		color: var(--color-text-secondary);
		border-radius: 8px;
	}
	.history-close:hover {
		background: var(--color-muted);
		color: var(--color-text-primary);
	}
	.form-dialog-heading {
		flex-shrink: 0;
		padding: 1.25rem 1.25rem 0;
	}
	.form-dialog-heading :global(h2) {
		margin-bottom: 0.625rem;
	}
	:global(.form-dialog-body) {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	:global(.form-dialog-content) {
		flex: 1;
		height: auto;
		padding: 1.25rem;
	}
</style>
