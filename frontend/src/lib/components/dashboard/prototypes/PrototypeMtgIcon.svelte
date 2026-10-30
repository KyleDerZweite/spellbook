<script lang="ts">
	import RarityBadge from '#lib/components/cards/RarityBadge.svelte';
	let { kind, label }: { kind: 'color' | 'type' | 'rarity'; label: string } = $props();
	const colorSymbols: Record<string, string> = {
		White: 'w',
		Blue: 'u',
		Black: 'b',
		Red: 'r',
		Green: 'g',
		Colorless: 'c',
		Multicolor: 'multicolor'
	};
	const typeSymbols: Record<string, string> = {
		Land: 'land',
		Creature: 'creature',
		Instant: 'instant',
		Sorcery: 'sorcery',
		Enchantment: 'enchantment',
		Artifact: 'artifact',
		Planeswalker: 'planeswalker',
		Battle: 'battle'
	};
	const symbol = $derived(
		kind === 'color' ? colorSymbols[label] : kind === 'type' ? typeSymbols[label] : null
	);
</script>

<span class="mtg-icon" aria-hidden="true">
	{#if kind === 'rarity' && ['common', 'uncommon', 'rare', 'mythic'].includes(label.toLowerCase())}<RarityBadge
			rarity={label}
		/>
	{:else if symbol}<i
			class={`ms ms-${symbol}`}
			class:ms-cost={kind === 'color' && symbol !== 'multicolor'}
		></i>
	{:else}<svg
			viewBox="0 0 24 24"
			width="18"
			height="18"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			><rect x="6" y="3" width="14" height="18" rx="2" /><path d="M4 6H2v14a2 2 0 0 0 2 2" /></svg
		>{/if}
</span>

<style>
	.mtg-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		flex: none;
		font-size: 16px;
		line-height: 1;
		color: var(--color-text-secondary);
	}
</style>
