<script lang="ts">
	import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
	import PrototypeMetrics from './PrototypeMetrics.svelte';
	import ProportionChart from '#lib/components/charts/ProportionChart.svelte';
	let { dashboard }: { dashboard: DashboardSummary } = $props();
	let query = $state('');
	let set = $state('');
	let tab = $state<'add' | 'edit'>('add');
	let list = $state<'wishlist' | 'watchlist'>('wishlist');
	let name = $state('');
	let quantity = $state(1);
	let feedback = $state('');
	let reviews = $state(['Unknown card', 'Sheoldred, the Apocalypse', 'Lightning Bolt']);
	const colors = [
		{ name: 'White', value: 22 },
		{ name: 'Blue', value: 18 },
		{ name: 'Black', value: 20 },
		{ name: 'Red', value: 16 },
		{ name: 'Green', value: 18 },
		{ name: 'Multicolor', value: 5 },
		{ name: 'Colorless', value: 1 }
	];
	const rarities = [
		{ name: 'Common', value: 38 },
		{ name: 'Uncommon', value: 30 },
		{ name: 'Rare', value: 23 },
		{ name: 'Mythic', value: 9 }
	];
	const types = [
		{ name: 'Creature', value: 38 },
		{ name: 'Instant', value: 16 },
		{ name: 'Sorcery', value: 12 },
		{ name: 'Enchantment', value: 10 },
		{ name: 'Artifact', value: 9 },
		{ name: 'Land', value: 9 },
		{ name: 'Other', value: 6 }
	];
	let entries = $derived(
		dashboard.recentEntries.filter(
			(e) =>
				e.name.toLowerCase().includes(query.toLowerCase()) &&
				(!set || e.setCode.toLowerCase() === set.toLowerCase())
		)
	);
	function review(item: string, action: string) {
		reviews = reviews.filter((x) => x !== item);
		feedback = `${item}: ${action} in mock preview.`;
	}
</script>

<div class="workbench">
	<div class="top"><span class="badge">Mock preview</span><a href="/mtg/decks">Decks ↗</a></div>
	<div class="toolbar">
		<select aria-label="Filter by set" bind:value={set}
			><option value="">All sets</option>{#each dashboard.sets as s}<option value={s.label}
					>{s.label.toUpperCase()}</option
				>{/each}</select
		>
		<input
			aria-label="Filter recent cards"
			placeholder="Filter recent cards..."
			bind:value={query}
		/>
		<button
			onclick={() => {
				query = '';
				set = '';
			}}>Clear</button
		>
	</div>
	<div class="layout">
		<div class="main-panels">
			<PrototypeMetrics {dashboard} />
			<div class="analytics">
				<section>
					<header>
						<h2>Sets</h2>
						<a href="/mtg/inventory">Inventory ↗</a>
					</header>
					<p class="muted">Share of owned copies</p>
					{#each dashboard.sets.slice(0, 5) as s}<div class="barrow">
							<div>
								<span>{s.label.toUpperCase()}</span><span
									>{s.quantity.toLocaleString()} · {dashboard.totals.total
										? Math.round((s.quantity / dashboard.totals.total) * 100)
										: 0}%</span
								>
							</div>
							<div class="track">
								<i
									style:width={`${dashboard.totals.total ? Math.min(100, (s.quantity / dashboard.totals.total) * 100) : 0}%`}
								></i>
							</div>
						</div>{:else}<p class="muted">No sets in inventory.</p>{/each}
				</section>
				<section>
					<header>
						<h2>Color distribution</h2>
						<span class="badge">Mock</span>
					</header>
					<div class="colorchart">
						<ProportionChart
							label="Mock color distribution, 100 sample cards"
							kind="pie"
							items={colors.map((c, i) => ({
								label: c.name,
								value: c.value,
								color: [
									'#b8b6a9',
									'#8fabc0',
									'#77777c',
									'#b98a8a',
									'#89a898',
									'#b6a980',
									'#979b9f'
								][i]
							}))}
						/>
					</div>
				</section>
				<section>
					<header>
						<h2>Rarity</h2>
						<span class="badge">Mock</span>
					</header>
					<div class="columns">
						{#each rarities as item}<div>
								<span>{item.value}%</span><i style:height={`${item.value * 3}px`}></i><small
									>{item.name}</small
								>
							</div>{/each}
					</div>
				</section>
				<section>
					<header>
						<h2>Card types</h2>
						<span class="badge">Mock</span>
					</header>
					{#each types as item}<div class="type">
							<span>{item.name}</span>
							<div class="track"><i style:width={`${item.value}%`}></i></div>
							<strong>{item.value}%</strong>
						</div>{/each}
				</section>
			</div>
			<div class="bottom">
				<section>
					<header>
						<h2>Recently edited cards</h2>
						<a href="/mtg/inventory">View all ↗</a>
					</header>
					<div class="rows">
						{#each entries.slice(0, 6) as entry}<a
								class="entry"
								href={`/mtg/inventory/${encodeURIComponent(entry.id)}`}
							>
								{#if entry.imageUri}<img src={entry.imageUri} alt="" />{:else}<span
										class="placeholder">{entry.setCode.toUpperCase()}</span
									>{/if}<span class="entryname"
									>{entry.name}<small>{entry.setCode.toUpperCase()}</small></span
								><span>{entry.quantity}×</span></a
							>{:else}<p class="muted">No matching recent cards.</p>{/each}
					</div>
				</section>
				<section>
					<header>
						<h2>Pending scan review</h2>
						<span class="badge">Mock</span>
					</header>
					{#each reviews as item}<div class="review">
							<span>{item}<small>Sample review item</small></span><button
								onclick={() => review(item, 'Confirmed')}>Confirm</button
							><button aria-label={`Dismiss ${item}`} onclick={() => review(item, 'Dismissed')}
								>×</button
							>
						</div>{:else}<p class="muted">No mock items remaining.</p>{/each}
				</section>
			</div>
		</div>
		<aside>
			<section>
				<header>
					<h2>Quick add / edit</h2>
					<span class="badge">Mock</span>
				</header>
				<div class="tabs">
					<button class:active={tab === 'add'} onclick={() => (tab = 'add')}>Add cards</button
					><button class:active={tab === 'edit'} onclick={() => (tab = 'edit')}>Quick edit</button>
				</div>
				<div class="demo">
					<span class="symbol">＋</span><strong
						>{tab === 'add' ? 'Preview a card addition' : 'Preview an edit'}</strong
					><small>Local demonstration</small>
				</div>
				<label>Card name<input bind:value={name} placeholder="Enter card name" /></label>
				<div class="add">
					<label>Qty<input type="number" min="1" bind:value={quantity} /></label><button
						class="primary"
						onclick={() =>
							(feedback = name.trim()
								? `${name.trim()} · ${quantity} in local preview.`
								: 'Enter a card name first.')}
						>{tab === 'add' ? 'Preview add' : 'Preview edit'}</button
					>
				</div>
				<p class="feedback" aria-live="polite">{feedback}</p>
			</section>
			<section>
				<header>
					<h2>Wishlist / Watchlist</h2>
					<span class="badge">Mock</span>
				</header>
				<div class="tabs">
					<button class:active={list === 'wishlist'} onclick={() => (list = 'wishlist')}
						>Wishlist</button
					><button class:active={list === 'watchlist'} onclick={() => (list = 'watchlist')}
						>Watchlist</button
					>
				</div>
				{#each list === 'wishlist' ? ['The One Ring', 'Mana Crypt', 'Jeweled Lotus', 'Smothering Tithe'] : ['Sol Ring', 'Lightning Bolt', 'Counterspell'] as item}<div
						class="wish"
					>
						<span class="placeholder">◇</span><span>{item}<small>Sample card</small></span><button
							aria-label={`Preview ${item}`}
							onclick={() => {
								name = item;
								feedback = `${item} selected for local preview.`;
							}}>＋</button
						>
					</div>{/each}
			</section>
		</aside>
	</div>
</div>

<style>
	.workbench {
		font: 13px var(--font-interface);
		color: var(--color-text-primary);
		display: grid;
		gap: 12px;
		min-width: 0;
	}
	.top,
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.top a,
	header a {
		color: var(--color-text-secondary);
		font-size: 12px;
		text-decoration: none;
	}
	.badge {
		font-size: 11px;
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		padding: 4px 8px;
		white-space: nowrap;
	}
	.toolbar {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	input,
	select,
	button {
		font: inherit;
		color: inherit;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		padding: 8px;
		min-width: 0;
	}
	button {
		cursor: pointer;
	}
	.toolbar input {
		flex: 1;
		min-width: 140px;
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 300px;
		gap: 12px;
	}
	.main-panels,
	aside {
		display: grid;
		align-content: start;
		gap: 12px;
		min-width: 0;
	}
	section {
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		padding: 16px;
		min-width: 0;
	}
	h2 {
		font: 500 15px var(--font-interface);
		margin: 0;
	}
	header {
		margin-bottom: 16px;
	}
	.analytics,
	.bottom {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}
	.muted,
	small {
		color: var(--color-text-muted);
		font-size: 11px;
	}
	.muted {
		margin: 0 0 12px;
	}
	.barrow {
		margin: 12px 0;
	}
	.barrow > div:first-child {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 4px;
	}
	.track {
		height: 8px;
		background: var(--color-surface);
		border-radius: 4px;
		overflow: hidden;
	}
	.track i {
		display: block;
		height: 100%;
		background: var(--color-chart-primary);
		border-radius: 4px;
	}
	.colorchart {
		display: flex;
		align-items: center;
		justify-content: space-around;
		gap: 16px;
	}
	.columns {
		height: 185px;
		display: flex;
		align-items: end;
		justify-content: space-around;
		gap: 8px;
	}
	.columns div {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: end;
		gap: 8px;
		min-width: 0;
	}
	.columns i {
		width: 36px;
		max-width: 100%;
		background: var(--color-chart-primary);
		border-radius: 4px 4px 0 0;
	}
	.type {
		display: grid;
		grid-template-columns: 90px 1fr 32px;
		align-items: center;
		gap: 8px;
		margin: 8px 0;
	}
	.type strong {
		text-align: right;
		font-weight: 400;
	}
	.entry,
	.review,
	.wish {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 0;
		border-bottom: 1px solid var(--color-border);
	}
	.entry {
		color: inherit;
		text-decoration: none;
	}
	.entry small,
	.review small,
	.wish small {
		display: block;
	}
	.entryname,
	.review > span,
	.wish > span:nth-child(2) {
		flex: 1;
		min-width: 0;
	}
	.entry img,
	.placeholder {
		width: 32px;
		height: 40px;
		object-fit: cover;
		border-radius: 4px;
		background: var(--color-surface);
	}
	.placeholder {
		display: grid;
		place-items: center;
		font-size: 11px;
	}
	.tabs {
		display: flex;
		background: var(--color-surface);
		border-radius: 8px;
		margin-bottom: 12px;
	}
	.tabs button {
		flex: 1;
		border: 0;
		background: transparent;
		border-radius: 0;
	}
	.tabs .active {
		border-bottom: 2px solid var(--color-text-primary);
	}
	.demo {
		min-height: 140px;
		border: 1px dashed var(--color-border);
		display: grid;
		place-content: center;
		text-align: center;
		gap: 8px;
		margin-bottom: 12px;
	}
	.symbol {
		font-size: 24px;
	}
	label {
		display: grid;
		gap: 4px;
		font-size: 11px;
		color: var(--color-text-secondary);
	}
	label input {
		width: 100%;
		box-sizing: border-box;
	}
	.add {
		display: flex;
		align-items: end;
		gap: 8px;
		margin-top: 8px;
	}
	.add label {
		width: 64px;
	}
	.primary {
		flex: 1;
		background: var(--color-text-primary);
		color: var(--color-card);
	}
	.feedback {
		min-height: 16px;
		font-size: 11px;
		color: var(--color-text-secondary);
		margin: 8px 0 0;
	}
	.wish button {
		margin-left: auto;
	}
	.review button {
		padding: 4px 8px;
	}
	@media (max-width: 1050px) {
		.layout {
			grid-template-columns: 1fr;
		}
		aside {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 650px) {
		.analytics,
		.bottom,
		aside {
			grid-template-columns: 1fr;
		}
		.colorchart {
			justify-content: flex-start;
		}
		.toolbar select {
			max-width: 100%;
		}
	}
</style>
