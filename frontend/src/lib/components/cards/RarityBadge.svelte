<script lang="ts">
	interface Props {
		rarity: string;
		class?: string;
	}

	let { rarity, class: className = '' }: Props = $props();

	const RARITY_COLORS: Record<string, string> = {
		common: 'var(--color-rarity-common)',
		uncommon: 'var(--color-rarity-uncommon)',
		rare: 'var(--color-rarity-rare)',
		mythic: 'var(--color-rarity-mythic)'
	};

	let color = $derived(RARITY_COLORS[rarity.toLowerCase()] ?? 'var(--color-rarity-common)');
	let label = $derived(rarity.charAt(0).toUpperCase() + rarity.slice(1));
</script>

<span
	class="inline-block h-2.5 w-2.5 rounded-full {className}"
	style="background-color: {color};"
	title={label}
	role="img"
	aria-label="{label} rarity"
></span>
