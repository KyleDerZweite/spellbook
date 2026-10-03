<script lang="ts">
	import { Select } from 'bits-ui';
	let {
		value = $bindable(''),
		options,
		label,
		name,
		id,
		onchange
	}: {
		value?: string;
		options: Array<{ value: string; label: string }>;
		label: string;
		name?: string;
		id?: string;
		onchange?: (value: string) => void;
	} = $props();
</script>

<Select.Root type="single" bind:value {name} onValueChange={onchange}>
	<Select.Trigger
		{id}
		class="input flex min-w-0 items-center justify-between gap-3 text-left"
		aria-label={label}
	>
		<span class="truncate">{options.find((option) => option.value === value)?.label ?? label}</span>
		<span aria-hidden="true">▾</span>
	</Select.Trigger>
	<Select.Portal>
		<Select.Content
			sideOffset={5}
			class="z-[60] max-h-72 min-w-[var(--bits-select-anchor-width)] overflow-y-auto rounded-lg border border-mist bg-stone p-1 text-text-primary shadow-xl"
		>
			<Select.Viewport>
				{#each options as option}
					<Select.Item
						value={option.value}
						label={option.label}
						class="cursor-pointer rounded px-3 py-2 text-sm outline-none data-[highlighted]:bg-mist data-[selected]:text-gold-bright"
					>
						{option.label}
					</Select.Item>
				{/each}
			</Select.Viewport>
		</Select.Content>
	</Select.Portal>
</Select.Root>
