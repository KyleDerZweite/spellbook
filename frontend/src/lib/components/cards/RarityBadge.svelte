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

	let safeRarity = $derived(rarity ?? 'common');
	let color = $derived(RARITY_COLORS[safeRarity.toLowerCase()] ?? 'var(--color-rarity-common)');
	let label = $derived(safeRarity.charAt(0).toUpperCase() + safeRarity.slice(1));
</script>

<i
	class="ms ms-rarity {className}"
	style="color: {color};"
	title={label}
	role="img"
	aria-label="{label} rarity"
></i>
