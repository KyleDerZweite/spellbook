<script lang="ts">
	let { kind }: { kind: 'value' | 'total' | 'sets' | 'decks' } = $props();
</script>

<svg
	class="card-material"
	viewBox="0 0 180 144"
	aria-hidden="true"
	focusable="false"
	fill="none"
	stroke="currentColor"
	stroke-width="1.4"
>
	{#if kind === 'value'}
		<g transform="rotate(-12 112 64)">
			<path class="solid" d="M88 30h50v45c0 12-50 12-50 0V30Z" />
			<ellipse cx="113" cy="30" rx="25" ry="9" /><ellipse cx="113" cy="30" rx="19" ry="5" />
			<path
				d="M88 39c0 12 50 12 50 0M88 48c0 12 50 12 50 0M88 57c0 12 50 12 50 0M88 66c0 12 50 12 50 0M88 75c0 12 50 12 50 0"
			/>
		</g>
		<g transform="rotate(-24 63 95)"
			><ellipse class="solid" cx="63" cy="95" rx="27" ry="10" /><ellipse
				cx="63"
				cy="95"
				rx="20"
				ry="6"
			/><path d="M36 95v5c0 14 54 14 54 0v-5" /></g
		>
		<g transform="rotate(16 135 108)"
			><ellipse class="solid" cx="135" cy="108" rx="24" ry="9" /><ellipse
				cx="135"
				cy="108"
				rx="17"
				ry="5"
			/></g
		>
	{:else if kind === 'sets'}
		<g transform="rotate(12 114 72)">
			<path class="solid" d="m66 45 46-18 46 18v62l-46 19-46-19V45Z" />
			<path d="m66 45 46 18 46-18M112 63v63M77 45l35 14 35-14-35-13-35 13Z" />
			<path d="M77 72v19l24 10V82L77 72Z" />
		</g>
	{:else}
		<g transform={kind === 'decks' ? 'rotate(-18 116 72)' : 'rotate(13 114 72)'}>
			<rect
				class="solid"
				x="64"
				y="17"
				width="63"
				height="91"
				rx="5"
				transform="rotate(-12 96 62)"
			/>
			<rect class="solid" x="81" y="20" width="63" height="91" rx="5" />
			<rect x="86" y="26" width="53" height="78" rx="3" />
			<path d="M91 33h30M91 38h20" /><rect x="91" y="44" width="43" height="31" rx="2" />
			<path d="m93 69 10-15 11 10 9-9 9 17M92 83h40M92 88h35M92 93h39M122 100h10" />
		</g>
	{/if}
</svg>

<style>
	.card-material {
		position: absolute;
		top: -8px;
		right: 0;
		width: 180px;
		height: 144px;
		color: var(--color-text-secondary);
		opacity: 0.13;
		pointer-events: none;
	}
	.solid {
		fill: var(--color-card);
	}
	:global(html:not(.dark)) .card-material {
		opacity: 0.09;
	}
	@media (max-width: 650px) {
		.card-material {
			width: 144px;
			height: 116px;
			right: -12px;
			opacity: 0.09;
		}
	}
</style>
