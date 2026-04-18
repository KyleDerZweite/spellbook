<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import { activeGameState, AVAILABLE_GAMES } from '$lib/state/activeGame.svelte';
	import type { Game } from '$lib/search/types';

	interface GameOption {
		id: Game;
		label: string;
		status: 'active' | 'coming-soon' | 'planned';
	}

	const GAME_OPTIONS: GameOption[] = [
		{ id: 'mtg', label: 'Magic: The Gathering', status: 'active' },
		{ id: 'pokemon', label: 'Pokemon', status: 'coming-soon' },
		{ id: 'yugioh', label: 'Yu-Gi-Oh!', status: 'planned' }
	];

	const triggerLabel = $derived(activeGameState.current.toUpperCase());

	function handleSelect(game: Game) {
		if (AVAILABLE_GAMES.includes(game)) {
			activeGameState.set(game);
		}
	}

	function statusLabel(status: GameOption['status']): string | null {
		if (status === 'active') return null;
		return status === 'coming-soon' ? 'soon' : 'planned';
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class="flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-[10px] uppercase tracking-[0.28em] text-text-secondary no-underline transition-colors hover:text-gold-bright focus:outline-none focus:text-gold-bright"
		style="border: 1px solid color-mix(in srgb, var(--color-gold) 20%, transparent); background-color: color-mix(in srgb, var(--color-slate) 65%, transparent);"
		aria-label="Select game"
	>
		{triggerLabel}
		<span class="text-[8px] text-text-muted" aria-hidden="true">&#9660;</span>
	</DropdownMenu.Trigger>

	<DropdownMenu.Portal>
		<DropdownMenu.Content
			class="z-[100] min-w-[220px] overflow-hidden rounded py-1"
			style="background-color: var(--color-slate); border: 1px solid color-mix(in srgb, var(--color-gold) 40%, transparent); box-shadow: 0 4px 24px rgba(13, 11, 15, 0.8);"
			sideOffset={8}
			align="start"
		>
			{#each GAME_OPTIONS as option}
				{@const disabled = !AVAILABLE_GAMES.includes(option.id)}
				{@const isActive = activeGameState.current === option.id}
				{@const badge = statusLabel(option.status)}
				<DropdownMenu.Item
					class="flex cursor-pointer items-center gap-2 px-3 py-2 font-body text-sm transition-colors data-[highlighted]:bg-mist data-[highlighted]:text-amber data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50
						{isActive ? 'text-gold-bright' : 'text-text-primary'}"
					{disabled}
					onSelect={() => handleSelect(option.id)}
				>
					<span class="flex-1">{option.label}</span>
					{#if badge}
						<span class="font-mono text-[9px] uppercase tracking-[0.2em] text-text-muted">
							{badge}
						</span>
					{:else if isActive}
						<span class="text-gold-bright" aria-hidden="true">&#10003;</span>
					{/if}
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>
