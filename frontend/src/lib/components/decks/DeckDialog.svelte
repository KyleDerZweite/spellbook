<script lang="ts">
	import type { Snippet } from 'svelte';
	import FormDialog from '#lib/components/ui/dialog/FormDialog.svelte';
	import Button from '#lib/components/ui/button/Button.svelte';
	let {
		title,
		description,
		open = $bindable(false),
		pending = false,
		native = false,
		cancelHref = '/mtg/decks',
		variant = 'default',
		children,
		returnFocus
	}: {
		title: string;
		description: string;
		open?: boolean;
		pending?: boolean;
		native?: boolean;
		cancelHref?: string;
		variant?: 'default' | 'import';
		children: Snippet;
		returnFocus?: HTMLElement | null;
	} = $props();
	const id = $props.id();
</script>

{#if native}
	<section class="native-deck-form form-stack" aria-labelledby={`${id}-title`}>
		<h2 id={`${id}-title`} class="font-display text-2xl">{title}</h2>
		<p class="muted">{description}</p>
		{@render children()}
		<Button href={cancelHref} variant="secondary" disabled={pending}>Cancel</Button>
	</section>
{:else if open}
	<FormDialog
		{title}
		{description}
		{pending}
		{variant}
		onCancel={() => {
			if (!pending) open = false;
		}}
		onCloseAutoFocus={(event) => {
			if (returnFocus?.isConnected) {
				event.preventDefault();
				returnFocus.focus({ preventScroll: true });
			}
		}}
	>
		{@render children()}
		<div class="deck-dialog-cancel">
			<Button variant="secondary" disabled={pending} onclick={() => (open = false)}>Cancel</Button>
		</div>
	</FormDialog>
{/if}

<style>
	.native-deck-form {
		max-width: 42rem;
		margin-block: 1rem 1.5rem;
	}
	.deck-dialog-cancel {
		display: flex;
		justify-content: flex-end;
		margin-top: 0.75rem;
	}
</style>
