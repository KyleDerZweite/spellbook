<script lang="ts">
	interface Props {
		value: string;
		onInput: (value: string) => void;
		placeholder?: string;
		name?: string;
		submitLabel?: string;
		class?: string;
		inputRef?: HTMLInputElement | null;
	}

	let {
		value,
		onInput,
		placeholder = 'Search cards by name or rules text...',
		name,
		submitLabel,
		inputRef = $bindable(null),
		class: className = ''
	}: Props = $props();

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		onInput(target.value);
	}

	function handleClear() {
		onInput('');
		inputRef?.focus();
	}
</script>

<div class="relative {className}">
	<!-- Search icon -->
	<span
		class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
		aria-hidden="true"
	>
		<svg
			width="17"
			height="17"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg
		>
	</span>

	<label>
		<span class="sr-only">Search cards</span>
		<input
			bind:this={inputRef}
			type="search"
			{name}
			enterkeyhint={submitLabel ? 'search' : undefined}
			autocomplete="off"
			{value}
			oninput={handleInput}
			{placeholder}
			class="input search-input w-full py-2.5 pl-10 pr-12 text-sm"
			class:with-submit={!!submitLabel}
			style="
			background-color: var(--color-crypt);
			border: 1px solid var(--color-input);
		"
		/>
	</label>

	<!-- Clear button or Cmd+K hint -->
	{#if value}
		<button
			type="button"
			onclick={handleClear}
			class="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-text-muted transition-colors hover:text-text-primary"
			class:clear-before-submit={!!submitLabel}
			aria-label="Clear search"
		>
			&#10005;
		</button>
	{:else if !submitLabel}
		<span
			class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden items-center gap-0.5 font-mono text-[10px] text-text-muted sm:flex"
		>
			<kbd class="rounded bg-slate px-1 py-0.5">&#8984;K</kbd>
		</span>
	{/if}
	{#if submitLabel}
		<button type="submit" class="btn btn-ghost submit-search" aria-label={submitLabel}>
			<svg
				aria-hidden="true"
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="round"
				stroke-linejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg
			>
		</button>
	{/if}
</div>

<style>
	.with-submit {
		padding-right: 5.5rem;
	}
	.clear-before-submit {
		right: 2.75rem;
	}
	.submit-search {
		position: absolute;
		right: 0;
		top: 50%;
		transform: translateY(-50%);
		width: 44px;
		height: 44px;
		padding: 0;
		border: 0;
	}
	.search-input::-webkit-search-cancel-button {
		-webkit-appearance: none;
	}
</style>
