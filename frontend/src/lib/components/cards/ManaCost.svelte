<script lang="ts">
	interface Props {
		cost: string;
		class?: string;
	}

	let { cost, class: className = '' }: Props = $props();

	const MANA_COLORS: Record<string, { bg: string; text: string }> = {
		W: { bg: 'var(--color-mana-white)', text: '#1a1208' },
		U: { bg: 'var(--color-mana-blue)', text: '#e8dfc8' },
		B: { bg: 'var(--color-mana-black)', text: '#e8dfc8' },
		R: { bg: 'var(--color-mana-red)', text: '#e8dfc8' },
		G: { bg: 'var(--color-mana-green)', text: '#e8dfc8' },
		C: { bg: 'var(--color-mana-colorless)', text: '#1a1208' }
	};

	function parseManaCost(mana: string): string[] {
		const symbols: string[] = [];
		const regex = /\{([^}]+)\}/g;
		let match: RegExpExecArray | null;
		while ((match = regex.exec(mana)) !== null) {
			symbols.push(match[1]);
		}
		return symbols;
	}

	function getStyle(symbol: string): { bg: string; text: string } {
		const color = MANA_COLORS[symbol.toUpperCase()];
		if (color) return color;
		// Generic mana (numbers, X, etc.)
		return { bg: 'var(--color-smoke)', text: 'var(--color-text-primary)' };
	}

	let symbols = $derived(parseManaCost(cost));
</script>

<div class="inline-flex items-center gap-0.5 {className}">
	{#each symbols as symbol}
		{@const style = getStyle(symbol)}
		<span
			class="inline-flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-medium leading-none"
			style="background-color: {style.bg}; color: {style.text};"
			title={symbol}
		>
			{symbol}
		</span>
	{/each}
</div>
