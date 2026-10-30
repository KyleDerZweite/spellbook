<script lang="ts">
	import { arc, pie, type PieArcDatum } from 'd3-shape';
	import TooltipButton from '#lib/components/ui/tooltip/TooltipButton.svelte';
	import type { DashboardDeck } from '@spellbook/contracts/dashboard.ts';
	let { deck }: { deck: DashboardDeck } = $props();
	let open = $state(false);
	const segments = $derived([
		{ label: 'Exact printing', value: deck.exact, color: 'var(--color-success)' },
		{ label: 'Alternate printing', value: deck.alternate, color: 'var(--color-violet)' },
		{ label: 'Missing', value: deck.missing, color: 'var(--color-warning)' }
	]);
	const slices = $derived(
		pie<(typeof segments)[number]>()
			.value((part) => part.value)
			.sort(null)(segments)
	);
	const shape = arc<PieArcDatum<(typeof segments)[number]>>()
		.innerRadius(14)
		.outerRadius(21)
		.cornerRadius(1.5)
		.padAngle(0.04);
	const available = $derived(deck.exact + deck.alternate);
	const percent = $derived(
		deck.required
			? Math.min(deck.missing > 0 ? 99 : 100, Math.round((available / deck.required) * 100))
			: 0
	);
	const label = $derived(
		`${deck.name} availability: ${deck.exact.toLocaleString()} exact, ${deck.alternate.toLocaleString()} alternate, ${deck.missing.toLocaleString()} missing`
	);
</script>

<TooltipButton {label} bind:open keepOpenOnClick onclick={() => (open = true)}>
	<svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
		<circle
			cx="24"
			cy="24"
			r="17.5"
			fill="none"
			stroke="var(--color-chart-track)"
			stroke-width="7"
		/>
		<g transform="translate(24 24)">
			{#each slices as slice}{#if slice.value > 0}
					<path d={shape(slice) ?? ''} fill={slice.data.color} />
				{/if}{/each}
		</g>
		<text x="24" y="27" text-anchor="middle">{percent}%</text>
	</svg>
	{#snippet content()}
		<div class="availability-tooltip">
			<strong>{available.toLocaleString()} / {deck.required.toLocaleString()} available</strong>
			<dl>
				{#each segments as part}
					<div>
						<dt><span style:background={part.color} aria-hidden="true"></span>{part.label}</dt>
						<dd>{part.value.toLocaleString()}</dd>
					</div>
				{/each}
			</dl>
			<p>Each deck uses your full inventory independently.</p>
		</div>
	{/snippet}
</TooltipButton>

<style>
	text {
		fill: var(--color-text-primary);
		font: 9px var(--font-body);
	}
	.availability-tooltip {
		min-width: 12rem;
	}
	strong {
		display: block;
		margin-bottom: 0.65rem;
		font-weight: 500;
	}
	dl {
		display: grid;
		gap: 0.5rem;
	}
	dl div,
	dt {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	dl div {
		justify-content: space-between;
	}
	dt {
		color: var(--color-text-secondary);
	}
	dd {
		font-variant-numeric: tabular-nums;
	}
	dt span {
		width: 8px;
		height: 8px;
		border-radius: 2px;
	}
	p {
		margin-top: 0.75rem;
		color: var(--color-text-muted);
		font-size: 0.6875rem;
		line-height: 1.5;
	}
</style>
