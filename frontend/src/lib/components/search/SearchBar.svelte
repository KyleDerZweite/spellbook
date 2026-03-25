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
		placeholder = 'Search the multiverse...',
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
		&#128269;
	</span>

	<input
		bind:this={inputEl}
		type="text"
		{value}
		oninput={handleInput}
		{placeholder}
		class="search-input w-full rounded py-2.5 pl-10 pr-10 font-body text-base text-text-primary transition-all duration-150 placeholder:italic placeholder:text-text-muted focus:outline-none"
		style="
			background-color: var(--color-crypt);
			border: 1px solid rgba(196, 146, 42, 0.3);
		"
	/>

	<!-- Clear button or Cmd+K hint -->
	{#if value}
		<button
			onclick={handleClear}
			class="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer border-none bg-transparent text-text-muted transition-colors hover:text-gold-bright"
			aria-label="Clear search"
		>
			&#10005;
		</button>
	{:else}
		<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden items-center gap-0.5 font-mono text-[10px] text-text-muted sm:flex">
			<kbd class="rounded bg-slate px-1 py-0.5">&#8984;K</kbd>
		</span>
	{/if}
</div>
