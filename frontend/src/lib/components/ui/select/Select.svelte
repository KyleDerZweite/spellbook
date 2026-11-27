<script lang="ts">
	import { useLanguage } from '#lib/i18n/context.ts';
	const language = useLanguage();
	import { Select } from 'bits-ui';
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Funnel from '@lucide/svelte/icons/funnel';
	import ScrollArea from '#lib/components/ui/scroll-area/ScrollArea.svelte';

	let {
		value = $bindable(''),
		triggerRef = $bindable(null),
		options,
		label,
		name,
		id,
		required = false,
		native = false,
		disabled = false,
		iconOnly = false,
		placeholder,
		displayValue,
		class: className = '',
		onchange
	}: {
		value?: string;
		triggerRef?: HTMLButtonElement | null;
		options: Array<{ value: string; label: string; disabled?: boolean }>;
		label: string;
		name?: string;
		id?: string;
		required?: boolean;
		native?: boolean;
		disabled?: boolean;
		iconOnly?: boolean;
		placeholder?: string;
		displayValue?: string;
		class?: string;
		onchange?: (value: string) => void;
	} = $props();
</script>

{#if native}<select
		{id}
		{name}
		{required}
		{disabled}
		class={['input', className]}
		aria-label={label}
		bind:value
		onchange={(event) => onchange?.(event.currentTarget.value)}
	>
		{#each options as option}<option value={option.value} disabled={option.disabled}>
				{option.label}
			</option>{/each}
	</select>{:else}<Select.Root
		type="single"
		bind:value
		{name}
		{required}
		{disabled}
		items={options}
		onValueChange={onchange}
	>
		<Select.Trigger
			bind:ref={triggerRef}
			{id}
			class={[
				iconOnly
					? 'btn btn-ghost btn-icon'
					: 'input flex min-w-0 items-center justify-between gap-3 text-left',
				className
			]}
			aria-label={iconOnly
				? `${label}, ${options.find((option) => option.value === value)?.label ?? placeholder ?? language.t('ui.Any')}`
				: label}
		>
			{#if iconOnly}
				<Funnel size={20} aria-hidden="true" class="shrink-0" />
			{:else}
				<span class="truncate">
					{displayValue ??
						options.find((option) => option.value === value)?.label ??
						placeholder ??
						label}
				</span>
				<ChevronDown size={16} aria-hidden="true" class="shrink-0 text-text-muted" />
			{/if}
		</Select.Trigger>
		<Select.Portal>
			<Select.Content
				sideOffset={8}
				collisionPadding={12}
				class="surface-menu z-[120] w-[var(--bits-select-anchor-width)] min-w-40 max-w-[calc(100vw-1.5rem)] rounded-lg text-text-primary outline-none"
			>
				<ScrollArea
					viewportClass="select-scroll-viewport p-1"
					viewportTabindex={-1}
					smoothWheel={false}
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
									<Check
										size={16}
										aria-hidden="true"
										class={['shrink-0', !selected && 'invisible']}
									/>
								{/snippet}
							</Select.Item>
						{:else}
							<p class="px-3 py-2 text-sm text-text-muted">
								{language.t('ui.No.options.available')}
							</p>
						{/each}
					</Select.Viewport>
				</ScrollArea>
			</Select.Content>
		</Select.Portal>
	</Select.Root>
{/if}

<style>
	:global(.select-scroll-viewport) {
		max-height: min(20rem, calc(var(--bits-select-content-available-height) - 2px));
	}
</style>
