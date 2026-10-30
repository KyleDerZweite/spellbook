<script lang="ts">
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import PrototypeMetrics from './PrototypeMetrics.svelte';
	import PrototypeDeckCard from './PrototypeDeckCard.svelte';
	let { dashboard }: { dashboard: DashboardSummary } = $props();
	let importText = $state('');
	let preview = $state(false);
	let query = $state('');
	let added = $state<string[]>([]);
	let sync = $state(false);
	const examples = ['Sol Ring', 'Command Tower', 'Rhystic Study'];
	const totals = $derived(
		dashboard.decks.reduce(
			(a, d) => ({
				required: a.required + d.required,
				exact: a.exact + d.exact,
				alternate: a.alternate + d.alternate,
				missing: a.missing + d.missing
			}),
			{ required: 0, exact: 0, alternate: 0, missing: 0 }
		)
	);
	const statuses = $derived({
		complete: dashboard.decks.filter((d) => d.required > 0 && d.exact + d.alternate >= d.required)
			.length,
		partial: dashboard.decks.filter(
			(d) => d.required > 0 && d.exact + d.alternate > 0 && d.exact + d.alternate < d.required
		).length,
		empty: dashboard.decks.filter((d) => d.required === 0 || d.exact + d.alternate === 0).length
	});
	const available = $derived(
		dashboard.decks.length ? Math.round((statuses.complete / dashboard.decks.length) * 100) : 0
	);
	const started = $derived(
		dashboard.decks.length
			? ((statuses.complete + statuses.partial) / dashboard.decks.length) * 100
			: 0
	);

	function exportPreview() {
		const url = URL.createObjectURL(
			new Blob(['Mock deck export preview\n' + importText], { type: 'text/plain' })
		);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'spellbook-mock-preview.txt';
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="workbench">
	<div class="title">
		<div>
			<span class="eyebrow">Mock preview</span>
			<span class="context-title">Deck workbench</span>
		</div>
		<a class="button" href="/mtg/decks">View decks ↗</a>
	</div>
	<PrototypeMetrics {dashboard} />
	<div class="grid first">
		<section class="panel">
			<header>
				<h2>Deck availability</h2>
				<a href="/mtg/decks">All decks ↗</a>
			</header>
			<div class="availability">
				<div class="donut" style={`--amount: ${available}%; --started: ${started}%`}>
					<div><strong>{available}%</strong><small>complete decks</small></div>
				</div>
				<div class="legend">
					<p><b>{statuses.complete}</b> Complete</p>
					<p><b>{statuses.partial}</b> Partial</p>
					<p><b>{statuses.empty}</b> Empty</p>
					<small>{dashboard.decks.length} decks shown</small>
				</div>
			</div>
		</section>
		<section class="panel">
			<header><h2>Deck requirements</h2></header>
			<div class="counts">
				<div><strong>{totals.exact.toLocaleString()}</strong><span>Exact</span></div>
				<div><strong>{totals.alternate.toLocaleString()}</strong><span>Alternate</span></div>
				<div><strong>{totals.missing.toLocaleString()}</strong><span>Missing</span></div>
			</div>
			<small>Requirements can overlap across decks.</small>
		</section>
		<section class="panel">
			<header>
				<h2>Import / Export</h2>
				<span class="mock">Mock</span>
			</header>
			<label for="deck-import">Deck text</label><textarea
				id="deck-import"
				bind:value={importText}
				placeholder="Paste a decklist to preview"></textarea>
			<div class="buttons">
				<button onclick={() => (preview = true)}>Preview text</button><button
					onclick={exportPreview}>Export mock</button
				>
			</div>
			{#if preview}<p class="feedback" role="status">
					{importText.trim()
						? `${importText.trim().split('\n').length} lines in local preview`
						: 'Enter deck text to preview.'}
				</p>{/if}
		</section>
	</div>
	<div class="grid second">
		<section class="panel">
			<header>
				<h2>Missing cards</h2>
				<span class="mock">Mock</span>
			</header>
			{#each examples as name, i}<div class="row">
					<div class="tile">{i + 1}</div>
					<div><b>{name}</b><small>Example requirement</small></div>
					<span class="muted">Missing</span>
				</div>{/each}<a class="footer-link" href="/mtg/decks">Explore decks ↗</a>
		</section>
		<section class="panel">
			<header><h2>Exact vs. alternate printings</h2></header>
			<div
				class="bar"
				aria-label={`${totals.exact} exact, ${totals.alternate} alternate, ${totals.missing} missing`}
			>
				<span style={`flex:${totals.exact}`}></span><span style={`flex:${totals.alternate}`}
				></span><span style={`flex:${totals.missing}`}></span>
			</div>
			<div class="bar-labels">
				<span>Exact {totals.exact}</span><span>Alternate {totals.alternate}</span><span
					>Missing {totals.missing}</span
				>
			</div>
			<div class="subhead">Examples <span class="mock">Mock</span></div>
			{#each examples as name, i}<div class="row">
					<div class="tile">{i + 1}</div>
					<div>
						<b>{name}</b><small>{['Exact printing', 'Alternate printing', 'Missing'][i]}</small>
					</div>
				</div>{/each}
		</section>
		<section class="panel">
			<header>
				<h2>Top decks</h2>
				<a href="/mtg/decks">All decks ↗</a>
			</header>
			<div class="deck-list">
				{#each dashboard.decks.slice(0, 1) as deck (deck.id)}<PrototypeDeckCard
						{deck}
						appearance="plain"
					/>{:else}<p class="muted">No decks yet</p>{/each}
				{#each dashboard.decks.slice(1, 3) as deck}<a
						class="compact-deck"
						href={`/mtg/decks?deck=${encodeURIComponent(deck.id)}`}
						><span>{deck.name}</span><small
							>{deck.required
								? `${deck.exact + deck.alternate} / ${deck.required} available`
								: 'Empty deck'}</small
						></a
					>{/each}
			</div>
		</section>
	</div>
	<div class="grid bottom">
		<section class="panel">
			<header>
				<h2>Sync status</h2>
				<span class="mock">Mock</span>
			</header>
			<p>Inventory <span class="muted">Demo only</span></p>
			<p>Decks <span class="muted">Demo only</span></p>
			<button onclick={() => (sync = !sync)}>{sync ? 'Reset demo' : 'Simulate sync'}</button
			>{#if sync}<p class="feedback" role="status">Mock sync preview complete</p>{/if}
		</section>
		<section class="panel">
			<header>
				<h2>Recent deck edits</h2>
				<span class="mock">Mock</span>
			</header>
			<div class="row">Edited a deck <small>Example activity</small></div>
			<div class="row">Changed a printing <small>Example activity</small></div>
			<div class="row">Added a card <small>Example activity</small></div>
		</section>
		<section class="panel">
			<header>
				<h2>Find cards</h2>
				<span class="mock">Mock</span>
			</header>
			<label for="examples">Filter examples</label><input
				id="examples"
				bind:value={query}
				placeholder="Card name"
			/>{#each examples.filter((name) => name
					.toLowerCase()
					.includes(query.toLowerCase())) as name}<div class="row">
					<b>{name}</b><button
						onclick={() =>
							(added = added.includes(name)
								? added.filter((item) => item !== name)
								: [...added, name])}
						>{added.includes(name) ? 'Added locally' : 'Add locally'}</button
					>
				</div>{/each}<a class="footer-link" href="/mtg/search">Card Search ↗</a>
		</section>
	</div>
</div>

<style>
	.workbench {
		display: grid;
		gap: 16px;
		min-width: 0;
		color: var(--color-text-primary);
		font-family: var(--font-interface);
	}
	.title,
	header,
	.row,
	.buttons {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	h2,
	p {
		margin: 0;
	}

	h2 {
		font: 500 1rem var(--font-interface);
	}
	.eyebrow,
	.mock,
	small,
	label,
	.muted {
		font-size: 12px;
		color: var(--color-text-secondary);
	}
	.mock {
		border: 1px solid var(--color-border);
		border-radius: 12px;
		padding: 2px 8px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
		align-items: start;
	}
	.first {
		grid-template-columns: 1fr 1.1fr 0.85fr;
	}
	.panel {
		min-width: 0;
		padding: 16px;
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: 12px;
	}
	header {
		margin-bottom: 16px;
	}
	a {
		color: var(--color-text-secondary);
		font-size: 12px;
		text-decoration: none;
	}
	a:hover {
		text-decoration: underline;
	}
	.button,
	button {
		border: 1px solid var(--color-border);
		border-radius: 6px;
		background: var(--color-surface);
		color: var(--color-text-primary);
		padding: 8px 12px;
		font: 12px var(--font-interface);
		cursor: pointer;
	}
	.availability {
		display: flex;
		align-items: center;
		justify-content: space-around;
		gap: 16px;
	}
	.donut {
		width: 148px;
		aspect-ratio: 1;
		border-radius: 50%;
		background: conic-gradient(
			var(--color-success) var(--amount),
			var(--color-text-muted) var(--amount) var(--started),
			var(--color-border) var(--started)
		);
		display: grid;
		place-items: center;
		flex: none;
	}
	.donut > div {
		width: 72%;
		aspect-ratio: 1;
		border-radius: 50%;
		background: var(--color-card);
		display: grid;
		align-content: center;
		text-align: center;
	}
	.donut strong,
	.counts strong {
		font: 400 1.8rem var(--font-display);
	}
	.legend {
		display: grid;
		gap: 12px;
		font-size: 13px;
	}
	.legend b {
		margin-right: 8px;
	}
	.counts {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		margin: 8px 0 16px;
	}
	.counts div {
		background: var(--color-surface);
		border-radius: 8px;
		padding: 20px 8px;
		display: grid;
		text-align: center;
		gap: 8px;
	}
	.counts span {
		font-size: 12px;
		color: var(--color-text-secondary);
	}
	textarea,
	input {
		box-sizing: border-box;
		width: 100%;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		background: var(--color-surface);
		color: var(--color-text-primary);
		font: 13px var(--font-interface);
		padding: 8px;
		margin: 8px 0;
	}
	textarea {
		height: 68px;
		resize: vertical;
	}
	.buttons button {
		flex: 1;
	}
	.feedback {
		font-size: 12px;
		color: var(--color-text-secondary);
		margin-top: 8px;
	}
	.row {
		padding: 12px 0;
		border-bottom: 1px solid var(--color-border);
		font-size: 13px;
	}
	.row > div:nth-child(2) {
		flex: 1;
		min-width: 0;
	}
	.row small {
		display: block;
		margin-top: 4px;
	}
	.tile {
		width: 36px;
		height: 40px;
		display: grid;
		place-items: center;
		border-radius: 4px;
		background: var(--color-surface);
		color: var(--color-text-secondary);
	}
	.footer-link {
		display: block;
		margin-top: 12px;
	}
	.bar {
		height: 16px;
		display: flex;
		overflow: hidden;
		border-radius: 4px;
		background: var(--color-border);
	}
	.bar span:nth-child(1) {
		background: var(--color-success);
	}
	.bar span:nth-child(2) {
		background: var(--color-violet);
	}
	.bar span:nth-child(3) {
		background: var(--color-warning);
	}
	.bar-labels {
		display: flex;
		justify-content: space-between;
		gap: 4px;
		font-size: 11px;
		color: var(--color-text-secondary);
		margin-top: 8px;
	}
	.subhead {
		margin-top: 20px;
		font-size: 12px;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.compact-deck {
		display: grid;
		gap: 8px;
		padding: 12px 0;
		border-top: 1px solid var(--color-border);
	}
	.deck-list {
		display: grid;
		gap: 16px;
	}
	.context-title {
		display: block;
		font: 500 16px var(--font-interface);
		margin-top: 8px;
	}
	.bottom p {
		padding: 12px 0;
		border-bottom: 1px solid var(--color-border);
		font-size: 13px;
	}
	.bottom p .muted {
		float: right;
	}
	.bottom button {
		margin-top: 8px;
	}
	@media (max-width: 1050px) {
		.first,
		.second,
		.bottom {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 700px) {
		.first,
		.second,
		.bottom {
			grid-template-columns: 1fr;
		}
		.title {
			align-items: flex-end;
		}
		.availability {
			flex-wrap: wrap;
		}
		.donut {
			width: 120px;
		}
	}
</style>
