<script lang="ts">
	import { goto } from '$app/navigation';
	import { activeGameState, AVAILABLE_GAMES } from '#lib/state/activeGame.svelte.ts';
	import TooltipButton from '#lib/components/ui/tooltip/TooltipButton.svelte';
	let open = $state(false);

	async function cycleGame() {
		const index = AVAILABLE_GAMES.indexOf(activeGameState.current);
		const next = AVAILABLE_GAMES[(index + 1) % AVAILABLE_GAMES.length];
		if (!next || next === activeGameState.current) {
			open = true;
			return;
		}
		open = false;
		await goto(`/${next}/search`);
		activeGameState.set(next);
	}
</script>

<TooltipButton
	label="Game: Magic: The Gathering"
	tooltip="Magic: The Gathering · Only available game"
	bind:open
	keepOpenOnClick
	onclick={cycleGame}
>
	<i class="ms ms-planeswalker game-symbol" aria-hidden="true"></i>
</TooltipButton>

<style>
	.game-symbol {
		font-size: 1.2rem;
		color: var(--color-warning);
	}
</style>
