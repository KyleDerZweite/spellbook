<script lang="ts">
	import { Select } from 'bits-ui';

	let {
		value = $bindable(''),
		options,
		label,
		name,
		id,
		required = false,
		disabled = false,
		placeholder,
		displayValue,
		class: className = '',
		onchange
	}: {
		value?: string;
		options: Array<{ value: string; label: string; disabled?: boolean }>;
		label: string;
		name?: string;
		id?: string;
		required?: boolean;
		disabled?: boolean;
		placeholder?: string;
		displayValue?: string;
		class?: string;
		onchange?: (value: string) => void;
	} = $props();
</script>

<Select.Root
	type="single"
	bind:value
	{name}
	{required}
	{disabled}
	items={options}
	onValueChange={onchange}
>
	<Select.Trigger
		{id}
		class={['input flex min-w-0 items-center justify-between gap-3 text-left', className]}
		aria-label={label}
	>
		<span class="truncate"
			>{displayValue ??
				options.find((option) => option.value === value)?.label ??
				placeholder ??
				label}</span
		>
		<svg
			aria-hidden="true"
			class="shrink-0 text-text-muted"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.7"
			stroke-linecap="round"
			stroke-linejoin="round"><path d="m7 10 5 5 5-5" /></svg
		>
	</Select.Trigger>
	<Select.Portal>
		<Select.Content
			sideOffset={5}
			collisionPadding={12}
			class="surface-menu z-[100] max-h-[min(20rem,var(--bits-select-content-available-height))] w-[var(--bits-select-anchor-width)] min-w-40 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-lg p-1 text-text-primary outline-none"
		>
			<Select.Viewport>
				{#each options as option (option.value)}
					<Select.Item
						value={option.value}
						label={option.label}
						disabled={option.disabled}
						class="menu-item rounded-md outline-none"
					>
						{#snippet children({ selected })}
							<span class="min-w-0 flex-1">{option.label}</span>
							<svg
								aria-hidden="true"
								class={['shrink-0', !selected && 'invisible']}
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.8"
								stroke-linecap="round"
								stroke-linejoin="round"><path d="m5 12 4 4L19 6" /></svg
							>
						{/snippet}
					</Select.Item>
				{:else}
					<p class="px-3 py-2 text-sm text-text-muted">No options available.</p>
				{/each}
			</Select.Viewport>
		</Select.Content>
	</Select.Portal>
</Select.Root>
