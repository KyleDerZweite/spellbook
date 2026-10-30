<script lang="ts">
	import { arc, pie, type PieArcDatum } from 'd3-shape';
	interface Item {
		label: string;
		value: number;
		share: number;
		color: string;
	}
	let {
		label,
		items,
		layout = 'compact'
	}: { label: string; items: Item[]; layout?: 'compact' | 'overview' } = $props();
	let selected = $state<string | null>(null);
	const total = $derived(items.reduce((sum, item) => sum + item.value, 0));
	const slices = $derived(
		pie<Item>()
			.value((item) => item.value)
			.sort(null)(items)
	);
	const shape = arc<PieArcDatum<Item>>()
		.innerRadius(40)
		.outerRadius(63)
		.cornerRadius(4)
		.padAngle(0.045);
	const compactCount = new Intl.NumberFormat(undefined, {
		notation: 'compact',
		maximumFractionDigits: 1
	});
	const active = $derived(items.find((item) => item.label === selected));
	const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });
</script>

<div
	class="composition-ring"
	class:overview={layout === 'overview'}
	role="group"
	aria-label={label}
>
	<svg viewBox="0 0 144 144" role="img" aria-label={`${label}: ${total.toLocaleString()} copies`}>
		<circle
			cx="72"
			cy="72"
			r="51.5"
			fill="none"
			stroke="var(--color-chart-track)"
			stroke-width="23"
		/>
		<g transform="translate(72 72)">
			{#each slices as slice}{#if slice.value > 0}
					<path
						d={shape(slice) ?? ''}
						fill={slice.data.color}
						opacity={active && active.label !== slice.data.label ? 0.65 : 1}
						><title
							>{slice.data.label}: {slice.data.value.toLocaleString()} copies, {percent.format(
								slice.data.share
							)}</title
						></path
					>
				{/if}{/each}
		</g>
		<text x="72" y="72" class="ring-total" text-anchor="middle"
			>{compactCount.format(active?.value ?? total)}</text
		>
		<text x="72" y="92" class="ring-label" text-anchor="middle"
			>{active && layout === 'overview'
				? percent.format(active.share)
				: (active?.label ?? 'copies')}</text
		>
	</svg>
	<div class="ring-legend">
		{#each items as item (item.label)}
			<button
				type="button"
				aria-pressed={selected === item.label}
				aria-label={`${item.label}: ${item.value.toLocaleString()} copies, ${percent.format(item.share)}`}
				onclick={() => (selected = item.label)}
				onfocus={() => (selected = item.label)}
				onpointerenter={() => (selected = item.label)}
			>
				<span class="ring-mark" style:background={item.color}></span><span>{item.label}</span
				><strong>{item.value.toLocaleString()}</strong><small>{percent.format(item.share)}</small>
			</button>
		{/each}
		<p aria-live="polite" class="sr-only">
			{active
				? `${active.label}: ${active.value.toLocaleString()} copies, ${percent.format(active.share)}`
				: `${total.toLocaleString()} copies total`}
		</p>
	</div>
</div>

<style>
	.composition-ring {
		display: flex;
		align-items: center;
		gap: 1rem;
		min-width: 0;
	}
	.overview {
		flex-wrap: wrap;
		justify-content: center;
		gap: 1.5rem;
	}
	.overview svg {
		width: 208px;
		height: 208px;
	}
	.overview .ring-legend {
		flex: 1 1 220px;
	}
	svg {
		width: 152px;
		height: 152px;
		flex-shrink: 0;
	}
	.ring-total {
		fill: var(--color-text-primary);
		font: 25px var(--font-display);
		font-variant-numeric: tabular-nums;
	}
	.ring-label {
		fill: var(--color-text-secondary);
		font: 11px var(--font-body);
	}
	.ring-legend {
		min-width: 0;
		flex: 1;
	}
	button {
		width: 100%;
		display: grid;
		grid-template-columns: 10px minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.25rem 0.5rem;
		min-height: 48px;
		padding: 0.5rem;
		border: 0;
		border-radius: 0.5rem;
		background: transparent;
		color: var(--color-text-secondary);
		text-align: left;
		font-size: 0.75rem;
		cursor: pointer;
	}
	button:hover,
	button[aria-pressed='true'] {
		background: var(--color-surface);
		color: var(--color-text-primary);
	}
	.ring-mark {
		width: 10px;
		height: 10px;
		border-radius: 3px;
	}
	strong {
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		color: var(--color-text-primary);
	}
	small {
		grid-column: 2 / -1;
		font-size: 0.6875rem;
		color: var(--color-text-muted);
	}
	@media (max-width: 380px) {
		svg {
			width: 112px;
			height: 112px;
		}
		.composition-ring {
			gap: 0.5rem;
		}
	}
</style>
