<script lang="ts">
	interface Props {
		value: string;
		onInput: (value: string) => void;
		placeholder?: string;
		class?: string;
	}

	let {
		value,
		onInput,
		placeholder = 'Search cards by name or rules text...',
		class: className = ''
	}: Props = $props();

	let inputEl: HTMLInputElement | null = $state(null);

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		onInput(target.value);
	}

	function handleClear() {
		onInput('');
		inputEl?.focus();
	}

	// Cmd+K / Ctrl+K to focus search
	$effect(() => {
		function handleKeydown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				inputEl?.focus();
			}
		}
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});
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

	<input
		bind:this={inputEl}
		type="search"
		aria-label="Search cards"
		autocomplete="off"
		{value}
		oninput={handleInput}
		{placeholder}
		class="input search-input w-full py-2.5 pl-10 pr-12 text-sm"
		style="
			background-color: var(--color-crypt);
			border: 1px solid var(--color-input);
		"
	/>

	<!-- Clear button or Cmd+K hint -->
	{#if value}
		<button
			type="button"
			onclick={handleClear}
			class="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-text-muted transition-colors hover:text-text-primary"
			aria-label="Clear search"
		>
			&#10005;
		</button>
	{:else}
		<span
			class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden items-center gap-0.5 font-mono text-[10px] text-text-muted sm:flex"
		>
			<kbd class="rounded bg-slate px-1 py-0.5">&#8984;K</kbd>
		</span>
	{/if}
</div>

<style>
	.search-input::-webkit-search-cancel-button {
		-webkit-appearance: none;
	}
</style>
