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

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		onInput(target.value);
	}

	function handleClear() {
		onInput('');
	}
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
		type="text"
		{value}
		oninput={handleInput}
		{placeholder}
		class="w-full rounded py-2.5 pl-10 pr-10 font-body text-base text-text-primary transition-all duration-150 placeholder:italic placeholder:text-text-muted focus:outline-none"
		style="
			background-color: var(--color-crypt);
			border: 1px solid rgba(196, 146, 42, 0.3);
		"
		onfocus={(e: FocusEvent) => { const el = e.currentTarget as HTMLInputElement; el.style.borderColor = 'var(--color-gold)'; el.style.boxShadow = '0 0 0 2px rgba(196, 146, 42, 0.15)'; }}
		onblur={(e: FocusEvent) => { const el = e.currentTarget as HTMLInputElement; el.style.borderColor = 'rgba(196, 146, 42, 0.3)'; el.style.boxShadow = 'none'; }}
	/>

	<!-- Clear button -->
	{#if value}
		<button
			onclick={handleClear}
			class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted transition-colors hover:text-gold-bright"
			aria-label="Clear search"
		>
			&#10005;
		</button>
	{/if}
</div>
