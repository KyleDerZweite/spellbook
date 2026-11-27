<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Search from '@lucide/svelte/icons/search';
	import X from '@lucide/svelte/icons/x';
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
		placeholder = language.t('ui.Search.cards.by.name.or.rules.text'),
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
		<Search size={16} aria-hidden="true" />
	</span>

	<label>
		<span class="sr-only">{language.t('ui.Search.cards')}</span>
		<input
			bind:this={inputRef}
			type="search"
			{name}
			enterkeyhint={submitLabel ? 'search' : undefined}
			autocomplete="off"
			{value}
			oninput={handleInput}
			{placeholder}
			class="input search-input w-full py-2.5 pl-10 pr-12"
			class:with-submit={!!submitLabel}
			style="
			background-color: var(--color-crypt);
			border: 1px solid var(--color-input);
		"
		/>
	</label>

	{#if value}
		<button
			type="button"
			onclick={handleClear}
			class="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-text-muted transition-colors hover:text-text-primary"
			class:clear-before-submit={!!submitLabel}
			aria-label={language.t('ui.Clear.search')}
		>
			<X size={20} aria-hidden="true" />
		</button>
	{/if}
	{#if submitLabel}
		<button type="submit" class="btn btn-ghost submit-search" aria-label={submitLabel}>
			<ArrowRight size={20} aria-hidden="true" />
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
