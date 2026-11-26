<script lang="ts">
	import { onMount } from 'svelte';
	import { useLanguage } from '#lib/i18n/context.ts';
	import { pluralKey, translate, type MessageKey } from '#lib/i18n/messages.ts';
	import type { CardDocument } from '@spellbook/contracts/catalog.ts';
	import type { Deck, DeckCard } from '@spellbook/contracts/decks.ts';
	import Button from '#lib/components/ui/button/Button.svelte';
	import PlaytesterHelper from '#lib/components/decks/PlaytesterHelper.svelte';
	import {
		createPlaytestState,
		PLAYTEST_PHASES,
		playtestReducer,
		type PlaytestAction,
		type PlaytestCard,
		type PlaytestCounters,
		type PlaytestPhase,
		type PlaytestState,
		type PlaytestZone
	} from '#lib/decks/playtest.ts';

	const language = useLanguage();

	let {
		deck,
		cards,
		documents
	}: {
		deck: Deck;
		cards: readonly DeckCard[];
		documents: Record<string, CardDocument>;
	} = $props();

	const deckInput = $derived({ cards, documents, format: deck.format });
	let game = $state<PlaytestState | null>(null);
	let showHelper = $state(true);
	let inspectedZone = $state<'library' | 'graveyard' | 'exile' | null>(null);
	let libraryFilter = $state('');
	let statusMessage = $state('');

	onMount(() => {
		game = createPlaytestState(deckInput);
	});

	const hasPlayableCards = $derived(
		cards.some((card) => (card.role === 'main' || card.role === 'commander') && card.quantity > 0)
	);
	const battlefieldLands = $derived(
		game ? game.zones.battlefield.filter((card) => card.isLand) : []
	);
	const battlefieldPermanents = $derived(
		game ? game.zones.battlefield.filter((card) => !card.isLand) : []
	);

	const inspectedCards = $derived.by(() => {
		if (!game || !inspectedZone) return [];
		const list = game.zones[inspectedZone];
		if (inspectedZone !== 'library' || !libraryFilter.trim()) return list;
		const needle = libraryFilter.trim().toLowerCase();
		return list.filter((card) => card.name.toLowerCase().includes(needle));
	});

	const playerCounters: readonly { key: keyof PlaytestCounters; labelKey: MessageKey }[] = [
		{ key: 'poison', labelKey: 'playtest.counter.poison' },
		{ key: 'storm', labelKey: 'playtest.counter.storm' },
		{ key: 'energy', labelKey: 'playtest.counter.energy' }
	];

	function dispatch(action: PlaytestAction, announcement?: string) {
		if (!game) return;
		game = playtestReducer(game, action, deckInput);
		if (announcement) statusMessage = announcement;
	}

	function drawOne() {
		if (!game) return;
		const top = game.zones.library[0];
		if (!top) return;
		dispatch({ type: 'draw', count: 1 }, language.t('playtest.status.drew', { name: top.name }));
	}

	function millOne() {
		if (!game) return;
		const top = game.zones.library[0];
		if (!top) return;
		dispatch({ type: 'moveCard', instanceId: top.instanceId, from: 'library', to: 'graveyard' });
	}

	function doMulligan() {
		if (!game) return;
		const nextCount = game.mulliganCount + 1;
		dispatch({ type: 'mulligan' }, language.t('playtest.status.mulliganed', { count: nextCount }));
	}

	function handleMoveSelect(card: PlaytestCard, from: PlaytestZone, event: Event) {
		const select = event.currentTarget as HTMLSelectElement;
		const value = select.value;
		select.value = '';
		if (!value) return;
		if (value === 'library:top') {
			dispatch({
				type: 'moveCard',
				instanceId: card.instanceId,
				from,
				to: 'library',
				position: 'top'
			});
			return;
		}
		if (value === 'library:bottom') {
			dispatch({
				type: 'moveCard',
				instanceId: card.instanceId,
				from,
				to: 'library',
				position: 'bottom'
			});
			return;
		}
		dispatch({
			type: 'moveCard',
			instanceId: card.instanceId,
			from,
			to: value as PlaytestZone
		});
	}

	function phaseLabel(phase: PlaytestPhase): string {
		return translate(language.locale, `playtest.phase.${phase}` as MessageKey);
	}

	function zoneLabel(zone: PlaytestZone): string {
		return translate(language.locale, `playtest.zone.${zone}` as MessageKey);
	}

	function toggleInspect(zone: 'library' | 'graveyard' | 'exile') {
		if (inspectedZone === zone) {
			inspectedZone = null;
			libraryFilter = '';
		} else {
			inspectedZone = zone;
			libraryFilter = '';
		}
	}
</script>

<div class="playtest-page workspace-container">
	<header class="playtest-header">
		<div class="header-title">
			<div class="title-row">
				<h1>{deck.name}</h1>
				<span class="format-badge">{deck.format}</span>
				<span class="ephemeral-badge">{language.t('playtest.ephemeralNotice')}</span>
			</div>
		</div>
		<div class="header-actions">
			<Button
				variant={showHelper ? 'default' : 'secondary'}
				size="sm"
				aria-pressed={showHelper}
				onclick={() => (showHelper = !showHelper)}
			>
				{showHelper ? language.t('playtest.hideHelper') : language.t('playtest.showHelper')}
			</Button>
			<Button href={`/mtg/decks?deck=${deck.id}`} variant="secondary" size="sm">
				{language.t('ui.Back.to.deck')}
			</Button>
		</div>
	</header>

	<p class="sr-only" aria-live="polite">{statusMessage}</p>

	{#if !hasPlayableCards}
		<section class="empty-state">
			<p>{language.t('playtest.deckEmpty')}</p>
			<Button href={`/mtg/decks?deck=${deck.id}`} variant="secondary">
				{language.t('ui.Back.to.deck')}
			</Button>
		</section>
	{:else if !game}
		<section class="empty-state" aria-busy="true">
			<p>{language.t('playtest.loading')}</p>
		</section>
	{:else}
		<section class="control-strip" aria-label={language.t('playtest.title')}>
			<div class="tracker-group">
				<div class="tracker-pill">
					<span class="tracker-label">{language.t('playtest.turn')}</span>
					<button
						type="button"
						class="step-btn"
						aria-label={language.t('playtest.decreaseTurn')}
						disabled={game.turn <= 1}
						onclick={() => dispatch({ type: 'adjustTurn', delta: -1 })}>-</button
					>
					<strong class="tracker-value">{game.turn}</strong>
					<button
						type="button"
						class="step-btn"
						aria-label={language.t('playtest.increaseTurn')}
						onclick={() => dispatch({ type: 'adjustTurn', delta: 1 })}>+</button
					>
					<Button size="sm" variant="secondary" onclick={() => dispatch({ type: 'nextTurn' })}>
						{language.t('playtest.nextTurn')}
					</Button>
				</div>

				<div class="tracker-pill">
					<span class="tracker-label">{language.t('playtest.life')}</span>
					<button
						type="button"
						class="step-btn"
						aria-label={`${language.t('playtest.decreaseLife')} 5`}
						onclick={() => dispatch({ type: 'adjustLife', delta: -5 })}>-5</button
					>
					<button
						type="button"
						class="step-btn"
						aria-label={language.t('playtest.decreaseLife')}
						onclick={() => dispatch({ type: 'adjustLife', delta: -1 })}>-1</button
					>
					<strong class="tracker-value life-value">{game.life}</strong>
					<button
						type="button"
						class="step-btn"
						aria-label={language.t('playtest.increaseLife')}
						onclick={() => dispatch({ type: 'adjustLife', delta: 1 })}>+1</button
					>
					<button
						type="button"
						class="step-btn"
						aria-label={`${language.t('playtest.increaseLife')} 5`}
						onclick={() => dispatch({ type: 'adjustLife', delta: 5 })}>+5</button
					>
				</div>

				{#each playerCounters as item (item.key)}
					{@const label = language.t(item.labelKey)}
					<div class="tracker-pill compact-counter">
						<span class="tracker-label">{label}</span>
						<button
							type="button"
							class="step-btn"
							aria-label={language.t('playtest.counter.decrease', { counter: label })}
							disabled={game.counters[item.key] <= 0}
							onclick={() =>
								dispatch({ type: 'adjustPlayerCounter', counter: item.key, delta: -1 })}>-</button
						>
						<strong class="tracker-value">{game.counters[item.key]}</strong>
						<button
							type="button"
							class="step-btn"
							aria-label={language.t('playtest.counter.increase', { counter: label })}
							onclick={() => dispatch({ type: 'adjustPlayerCounter', counter: item.key, delta: 1 })}
							>+</button
						>
					</div>
				{/each}
			</div>

			<div class="quick-actions">
				<Button size="sm" disabled={game.zones.library.length === 0} onclick={drawOne}>
					{language.t('playtest.draw')}
				</Button>
				<Button
					size="sm"
					variant="secondary"
					disabled={game.zones.library.length < 2}
					onclick={() => dispatch({ type: 'shuffle' }, language.t('playtest.status.shuffled'))}
				>
					{language.t('playtest.shuffle')}
				</Button>
				<Button
					size="sm"
					variant="secondary"
					disabled={!game.zones.battlefield.some((c) => c.tapped)}
					onclick={() => dispatch({ type: 'untapAll' }, language.t('playtest.status.untappedAll'))}
				>
					{language.t('playtest.untapAll')}
				</Button>
				<Button size="sm" variant="secondary" onclick={doMulligan}>
					{language.t('playtest.mulligan')}
				</Button>
				<Button
					size="sm"
					variant="ghost"
					onclick={() => {
						inspectedZone = null;
						dispatch({ type: 'reset' }, language.t('playtest.status.reset'));
					}}
				>
					{language.t('playtest.reset')}
				</Button>
			</div>
		</section>

		<nav class="phase-bar" aria-label={language.t('playtest.phaseBarLabel')}>
			<button
				type="button"
				class="phase-step"
				aria-label={language.t('playtest.prevPhase')}
				disabled={game.turn === 1 && game.phase === PLAYTEST_PHASES[0]}
				onclick={() => dispatch({ type: 'stepPhase', direction: 'prev' })}>‹</button
			>
			<div class="phase-pills">
				{#each PLAYTEST_PHASES as phase (phase)}
					<button
						type="button"
						class={['phase-pill', game.phase === phase && 'active']}
						aria-pressed={game.phase === phase}
						onclick={() => dispatch({ type: 'setPhase', phase })}
					>
						{phaseLabel(phase)}
					</button>
				{/each}
			</div>
			<button
				type="button"
				class="phase-step"
				aria-label={language.t('playtest.nextPhase')}
				onclick={() => dispatch({ type: 'stepPhase', direction: 'next' })}>›</button
			>
		</nav>

		{#if game.pendingMulliganBottom > 0}
			<div class="mulligan-banner" role="status">
				<p>
					{language.t(
						pluralKey(language.locale, game.pendingMulliganBottom) === 'one'
							? 'playtest.mulliganBanner.one'
							: 'playtest.mulliganBanner.other',
						{
							mulligans: game.mulliganCount,
							count: game.pendingMulliganBottom
						}
					)}
				</p>
			</div>
		{/if}

		{#if showHelper}
			<PlaytesterHelper
				hand={game.zones.hand}
				mulliganCount={game.mulliganCount}
				{cards}
				{documents}
			/>
		{/if}

		<div class="playmat-layout">
			<section class="battlefield-panel" aria-label={language.t('playtest.zone.battlefield')}>
				<div class="zone-header">
					<h2>
						{language.t('playtest.zone.count', {
							zone: zoneLabel('battlefield'),
							count: game.zones.battlefield.length
						})}
					</h2>
				</div>

				{#if game.zones.battlefield.length === 0}
					<p class="zone-placeholder">{language.t('playtest.battlefield.empty')}</p>
				{:else}
					{#if battlefieldPermanents.length > 0}
						<div class="battlefield-row">
							<span class="row-label">{language.t('playtest.battlefield.permanents')}</span>
							<div class="card-grid">
								{#each battlefieldPermanents as card (card.instanceId)}
									<div class={['bf-card-slot', card.tapped && 'is-tapped']}>
										<button
											type="button"
											class={['card-tile', card.tapped && 'tapped']}
											aria-pressed={card.tapped}
											aria-label={language.t('playtest.card.tapAria', {
												name: card.name,
												state: card.tapped
													? language.t('playtest.tapped')
													: language.t('playtest.untapped')
											})}
											onclick={() => dispatch({ type: 'toggleTap', instanceId: card.instanceId })}
										>
											{#if card.imageUri}
												<img src={card.imageUri} alt={card.name} loading="lazy" />
											{:else}
												<span class="card-fallback">{card.name}</span>
											{/if}
											{#if card.counters !== 0}
												<span class="counter-badge" aria-hidden="true">
													{card.counters > 0 ? `+${card.counters}` : card.counters}
												</span>
											{/if}
										</button>
										<div class="card-controls">
											<div class="mini-counter">
												<button
													type="button"
													class="mini-btn"
													aria-label={language.t('playtest.card.counterDecrease', {
														name: card.name
													})}
													onclick={() =>
														dispatch({
															type: 'adjustCardCounter',
															instanceId: card.instanceId,
															delta: -1
														})}>-</button
												>
												<span class="mini-count">{card.counters}</span>
												<button
													type="button"
													class="mini-btn"
													aria-label={language.t('playtest.card.counterIncrease', {
														name: card.name
													})}
													onclick={() =>
														dispatch({
															type: 'adjustCardCounter',
															instanceId: card.instanceId,
															delta: 1
														})}>+</button
												>
											</div>
											<select
												class="zone-select"
												aria-label={language.t('playtest.card.moveAria', { name: card.name })}
												onchange={(e) => handleMoveSelect(card, 'battlefield', e)}
											>
												<option value="">{language.t('playtest.action.moveTo')}</option>
												<option value="hand">{language.t('playtest.action.toHand')}</option>
												<option value="graveyard"
													>{language.t('playtest.action.toGraveyard')}</option
												>
												<option value="exile">{language.t('playtest.action.toExile')}</option>
												<option value="command">{language.t('playtest.action.toCommand')}</option>
												<option value="library:top"
													>{language.t('playtest.action.toLibraryTop')}</option
												>
												<option value="library:bottom"
													>{language.t('playtest.action.toLibraryBottom')}</option
												>
											</select>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if battlefieldLands.length > 0}
						<div class="battlefield-row lands-row">
							<span class="row-label">{language.t('playtest.battlefield.lands')}</span>
							<div class="card-grid">
								{#each battlefieldLands as card (card.instanceId)}
									<div class={['bf-card-slot', card.tapped && 'is-tapped']}>
										<button
											type="button"
											class={['card-tile', card.tapped && 'tapped']}
											aria-pressed={card.tapped}
											aria-label={language.t('playtest.card.tapAria', {
												name: card.name,
												state: card.tapped
													? language.t('playtest.tapped')
													: language.t('playtest.untapped')
											})}
											onclick={() => dispatch({ type: 'toggleTap', instanceId: card.instanceId })}
										>
											{#if card.imageUri}
												<img src={card.imageUri} alt={card.name} loading="lazy" />
											{:else}
												<span class="card-fallback">{card.name}</span>
											{/if}
											{#if card.counters !== 0}
												<span class="counter-badge" aria-hidden="true">
													{card.counters > 0 ? `+${card.counters}` : card.counters}
												</span>
											{/if}
										</button>
										<div class="card-controls">
											<div class="mini-counter">
												<button
													type="button"
													class="mini-btn"
													aria-label={language.t('playtest.card.counterDecrease', {
														name: card.name
													})}
													onclick={() =>
														dispatch({
															type: 'adjustCardCounter',
															instanceId: card.instanceId,
															delta: -1
														})}>-</button
												>
												<span class="mini-count">{card.counters}</span>
												<button
													type="button"
													class="mini-btn"
													aria-label={language.t('playtest.card.counterIncrease', {
														name: card.name
													})}
													onclick={() =>
														dispatch({
															type: 'adjustCardCounter',
															instanceId: card.instanceId,
															delta: 1
														})}>+</button
												>
											</div>
											<select
												class="zone-select"
												aria-label={language.t('playtest.card.moveAria', { name: card.name })}
												onchange={(e) => handleMoveSelect(card, 'battlefield', e)}
											>
												<option value="">{language.t('playtest.action.moveTo')}</option>
												<option value="hand">{language.t('playtest.action.toHand')}</option>
												<option value="graveyard"
													>{language.t('playtest.action.toGraveyard')}</option
												>
												<option value="exile">{language.t('playtest.action.toExile')}</option>
												<option value="command">{language.t('playtest.action.toCommand')}</option>
												<option value="library:top"
													>{language.t('playtest.action.toLibraryTop')}</option
												>
												<option value="library:bottom"
													>{language.t('playtest.action.toLibraryBottom')}</option
												>
											</select>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/if}
			</section>

			<aside class="zones-sidebar" aria-label={language.t('playtest.zone.library')}>
				<div class="zone-box">
					<div class="zone-box-head">
						<h3>
							{language.t('playtest.zone.count', {
								zone: zoneLabel('library'),
								count: game.zones.library.length
							})}
						</h3>
					</div>
					<div class="zone-box-actions">
						<Button size="sm" disabled={game.zones.library.length === 0} onclick={drawOne}>
							{language.t('playtest.draw')}
						</Button>
						<Button
							size="sm"
							variant="secondary"
							disabled={game.zones.library.length === 0}
							onclick={millOne}
						>
							{language.t('playtest.action.mill')}
						</Button>
						<Button
							size="sm"
							variant={inspectedZone === 'library' ? 'default' : 'secondary'}
							onclick={() => toggleInspect('library')}
						>
							{language.t('playtest.action.inspect')}
						</Button>
					</div>
				</div>

				<div class="zone-box">
					<div class="zone-box-head">
						<h3>
							{language.t('playtest.zone.count', {
								zone: zoneLabel('command'),
								count: game.zones.command.length
							})}
						</h3>
					</div>
					{#if game.zones.command.length === 0}
						<p class="zone-empty">{language.t('playtest.zone.empty')}</p>
					{:else}
						<div class="command-list">
							{#each game.zones.command as card (card.instanceId)}
								<div class="command-card">
									<button
										type="button"
										class="card-tile compact-tile"
										aria-label={language.t('playtest.card.playAria', { name: card.name })}
										onclick={() =>
											dispatch({
												type: 'moveCard',
												instanceId: card.instanceId,
												from: 'command',
												to: 'battlefield'
											})}
									>
										{#if card.imageUri}
											<img src={card.imageUri} alt={card.name} loading="lazy" />
										{:else}
											<span class="card-fallback">{card.name}</span>
										{/if}
									</button>
									<select
										class="zone-select"
										aria-label={language.t('playtest.card.moveAria', { name: card.name })}
										onchange={(e) => handleMoveSelect(card, 'command', e)}
									>
										<option value="">{language.t('playtest.action.moveTo')}</option>
										<option value="battlefield"
											>{language.t('playtest.action.toBattlefield')}</option
										>
										<option value="hand">{language.t('playtest.action.toHand')}</option>
										<option value="graveyard">{language.t('playtest.action.toGraveyard')}</option>
										<option value="exile">{language.t('playtest.action.toExile')}</option>
										<option value="library:top">{language.t('playtest.action.toLibraryTop')}</option
										>
										<option value="library:bottom"
											>{language.t('playtest.action.toLibraryBottom')}</option
										>
									</select>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<div class="zone-box">
					<div class="zone-box-head">
						<h3>
							{language.t('playtest.zone.count', {
								zone: zoneLabel('graveyard'),
								count: game.zones.graveyard.length
							})}
						</h3>
						<Button
							size="sm"
							variant={inspectedZone === 'graveyard' ? 'default' : 'secondary'}
							onclick={() => toggleInspect('graveyard')}
						>
							{language.t('playtest.action.inspect')}
						</Button>
					</div>
					{#if game.zones.graveyard.length > 0}
						{@const topGy = game.zones.graveyard[game.zones.graveyard.length - 1]}
						<p class="pile-top">{topGy.name}</p>
					{:else}
						<p class="zone-empty">{language.t('playtest.zone.empty')}</p>
					{/if}
				</div>

				<div class="zone-box">
					<div class="zone-box-head">
						<h3>
							{language.t('playtest.zone.count', {
								zone: zoneLabel('exile'),
								count: game.zones.exile.length
							})}
						</h3>
						<Button
							size="sm"
							variant={inspectedZone === 'exile' ? 'default' : 'secondary'}
							onclick={() => toggleInspect('exile')}
						>
							{language.t('playtest.action.inspect')}
						</Button>
					</div>
					{#if game.zones.exile.length > 0}
						{@const topEx = game.zones.exile[game.zones.exile.length - 1]}
						<p class="pile-top">{topEx.name}</p>
					{:else}
						<p class="zone-empty">{language.t('playtest.zone.empty')}</p>
					{/if}
				</div>
			</aside>
		</div>

		{#if inspectedZone}
			<section
				class="inspector-panel"
				aria-label={language.t('playtest.zone.count', {
					zone: zoneLabel(inspectedZone),
					count: game.zones[inspectedZone].length
				})}
			>
				<div class="inspector-head">
					<h3>
						{language.t('playtest.zone.count', {
							zone: zoneLabel(inspectedZone),
							count: game.zones[inspectedZone].length
						})}
					</h3>
					<div class="inspector-tools">
						{#if inspectedZone === 'library'}
							<input
								type="search"
								class="input filter-input"
								placeholder={language.t('playtest.filterLibrary')}
								aria-label={language.t('playtest.filterLibrary')}
								bind:value={libraryFilter}
							/>
						{/if}
						<Button
							size="sm"
							variant="secondary"
							onclick={() => {
								inspectedZone = null;
								libraryFilter = '';
							}}
						>
							{language.t('playtest.action.close')}
						</Button>
					</div>
				</div>

				{#if inspectedCards.length === 0}
					<p class="zone-empty">{language.t('playtest.zone.empty')}</p>
				{:else}
					<ul class="inspector-list">
						{#each inspectedCards as card (card.instanceId)}
							<li class="inspector-item">
								<span class="inspector-name">{card.name}</span>
								<div class="inspector-actions">
									<Button
										size="sm"
										variant="secondary"
										onclick={() =>
											dispatch({
												type: 'moveCard',
												instanceId: card.instanceId,
												from: inspectedZone!,
												to: 'hand'
											})}>{language.t('playtest.action.toHand')}</Button
									>
									<Button
										size="sm"
										variant="secondary"
										onclick={() =>
											dispatch({
												type: 'moveCard',
												instanceId: card.instanceId,
												from: inspectedZone!,
												to: 'battlefield'
											})}>{language.t('playtest.action.toBattlefield')}</Button
									>
									<select
										class="zone-select"
										aria-label={language.t('playtest.card.moveAria', { name: card.name })}
										onchange={(e) => handleMoveSelect(card, inspectedZone!, e)}
									>
										<option value="">{language.t('playtest.action.moveTo')}</option>
										{#if inspectedZone !== 'graveyard'}
											<option value="graveyard">{language.t('playtest.action.toGraveyard')}</option>
										{/if}
										{#if inspectedZone !== 'exile'}
											<option value="exile">{language.t('playtest.action.toExile')}</option>
										{/if}
										<option value="command">{language.t('playtest.action.toCommand')}</option>
										<option value="library:top">{language.t('playtest.action.toLibraryTop')}</option
										>
										<option value="library:bottom"
											>{language.t('playtest.action.toLibraryBottom')}</option
										>
									</select>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		<section class="hand-panel" aria-label={language.t('playtest.zone.hand')}>
			<div class="zone-header">
				<h2>
					{language.t('playtest.zone.count', {
						zone: zoneLabel('hand'),
						count: game.zones.hand.length
					})}
				</h2>
			</div>
			{#if game.zones.hand.length === 0}
				<p class="zone-placeholder">{language.t('playtest.hand.empty')}</p>
			{:else}
				<div class="hand-row">
					{#each game.zones.hand as card (card.instanceId)}
						<div class="hand-card-slot">
							<button
								type="button"
								class="card-tile hand-tile"
								aria-label={game.pendingMulliganBottom > 0
									? `${language.t('playtest.action.putOnBottom')}: ${card.name}`
									: language.t('playtest.card.playAria', { name: card.name })}
								onclick={() =>
									game!.pendingMulliganBottom > 0
										? dispatch({ type: 'mulliganBottom', instanceId: card.instanceId })
										: dispatch({
												type: 'moveCard',
												instanceId: card.instanceId,
												from: 'hand',
												to: 'battlefield'
											})}
							>
								{#if card.imageUri}
									<img src={card.imageUri} alt={card.name} loading="lazy" />
								{:else}
									<span class="card-fallback">{card.name}</span>
								{/if}
							</button>
							<div class="card-controls">
								{#if game.pendingMulliganBottom > 0}
									<Button
										size="sm"
										onclick={() =>
											dispatch({ type: 'mulliganBottom', instanceId: card.instanceId })}
									>
										{language.t('playtest.action.putOnBottom')}
									</Button>
								{/if}
								<select
									class="zone-select"
									aria-label={language.t('playtest.card.moveAria', { name: card.name })}
									onchange={(e) => handleMoveSelect(card, 'hand', e)}
								>
									<option value="">{language.t('playtest.action.moveTo')}</option>
									<option value="battlefield">{language.t('playtest.action.toBattlefield')}</option>
									<option value="graveyard">{language.t('playtest.action.toGraveyard')}</option>
									<option value="exile">{language.t('playtest.action.toExile')}</option>
									<option value="command">{language.t('playtest.action.toCommand')}</option>
									<option value="library:top">{language.t('playtest.action.toLibraryTop')}</option>
									<option value="library:bottom"
										>{language.t('playtest.action.toLibraryBottom')}</option
									>
								</select>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>

<style>
	.playtest-page {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding-block: 1.25rem 2.5rem;
	}
	.playtest-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.title-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.625rem;
	}
	h1 {
		font: 400 1.6rem var(--font-display);
		margin: 0;
	}
	h2 {
		font: 400 1.05rem var(--font-display);
		margin: 0;
	}
	h3 {
		font: 400 0.95rem var(--font-display);
		margin: 0;
	}
	.format-badge,
	.ephemeral-badge {
		font-size: 0.6875rem;
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text-secondary);
	}
	.header-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.empty-state {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		padding: 2rem;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1rem;
	}
	.control-strip {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		padding: 0.75rem 1rem;
	}
	.tracker-group,
	.quick-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.tracker-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem 0.5rem;
		border-radius: 0.5rem;
		background: var(--color-card);
		border: 1px solid var(--color-border);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
	}
	.tracker-label {
		color: var(--color-text-secondary);
		font-size: 0.6875rem;
	}
	.tracker-value {
		min-width: 1.5rem;
		text-align: center;
		font-weight: 600;
	}
	.life-value {
		color: var(--color-accent);
		font-size: 0.95rem;
	}
	.step-btn {
		min-width: 1.6rem;
		height: 1.6rem;
		padding: 0 0.35rem;
		border-radius: 0.35rem;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text-primary);
		font-size: 0.75rem;
		cursor: pointer;
	}
	.step-btn:hover:not(:disabled) {
		background: var(--color-muted);
	}
	.step-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.phase-bar {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		padding: 0.5rem;
	}
	.phase-pills {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 0.35rem;
		flex: 1;
	}
	.phase-pill,
	.phase-step {
		border: 1px solid var(--color-border);
		background: var(--color-card);
		color: var(--color-text-secondary);
		border-radius: 0.5rem;
		padding: 0.45rem 0.5rem;
		font-size: 0.75rem;
		cursor: pointer;
		transition:
			background-color 140ms ease,
			color 140ms ease,
			border-color 140ms ease;
	}
	.phase-step {
		min-width: 2.25rem;
		font-size: 1rem;
		line-height: 1;
	}
	.phase-pill:hover,
	.phase-step:hover:not(:disabled) {
		color: var(--color-text-primary);
		background: var(--color-muted);
	}
	.phase-step:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.phase-pill.active {
		background: var(--color-primary);
		color: var(--color-primary-foreground);
		border-color: var(--color-primary);
		font-weight: 600;
	}
	.mulligan-banner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border-radius: 0.75rem;
		border: 1px solid var(--color-warning);
		background: var(--color-surface);
		font-size: 0.8125rem;
	}
	.mulligan-banner p {
		margin: 0;
	}
	.playmat-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 16.5rem;
		gap: 1rem;
		align-items: start;
	}
	.battlefield-panel,
	.hand-panel,
	.inspector-panel {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		min-width: 0;
	}
	.battlefield-panel {
		min-height: 22rem;
	}
	.zone-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.zone-placeholder,
	.zone-empty,
	.pile-top {
		margin: 0;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}
	.pile-top {
		color: var(--color-text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.battlefield-row {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.lands-row {
		padding-top: 0.75rem;
		border-top: 1px dashed var(--color-border);
	}
	.row-label {
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
	}
	.card-grid,
	.hand-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.85rem;
		align-items: flex-start;
	}
	.bf-card-slot,
	.hand-card-slot {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		width: 8.5rem;
		animation: card-enter 180ms ease-out;
		transition: margin-inline 180ms ease;
	}
	.bf-card-slot.is-tapped {
		margin-inline: 1.35rem;
	}
	.card-tile {
		position: relative;
		width: 8.5rem;
		aspect-ratio: 63 / 88;
		border-radius: 0.5rem;
		overflow: hidden;
		border: 1px solid var(--color-border);
		background: var(--color-card);
		padding: 0;
		cursor: pointer;
		transition:
			transform 180ms ease,
			box-shadow 180ms ease;
	}
	.card-tile img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.card-tile.tapped {
		transform: rotate(90deg);
	}
	.hand-tile:hover,
	.hand-tile:focus-visible {
		transform: translateY(-0.35rem);
		box-shadow: 0 8px 18px rgb(0 0 0 / 0.25);
	}
	.compact-tile {
		width: 6.5rem;
	}
	.card-fallback {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		padding: 0.5rem;
		text-align: center;
		font-size: 0.75rem;
		color: var(--color-text-primary);
	}
	.counter-badge {
		position: absolute;
		top: 0.35rem;
		right: 0.35rem;
		padding: 0.15rem 0.4rem;
		border-radius: 999px;
		background: var(--color-primary);
		color: var(--color-primary-foreground);
		font-size: 0.75rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.card-controls {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		width: 100%;
	}
	.mini-counter {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		font-size: 0.6875rem;
		font-variant-numeric: tabular-nums;
	}
	.mini-btn {
		width: 1.4rem;
		height: 1.4rem;
		border-radius: 0.25rem;
		border: 1px solid var(--color-border);
		background: var(--color-card);
		color: var(--color-text-primary);
		cursor: pointer;
	}
	.mini-btn:hover {
		background: var(--color-muted);
	}
	.mini-count {
		min-width: 1.25rem;
		text-align: center;
	}
	.zone-select {
		width: 100%;
		font-size: 0.6875rem;
		padding: 0.25rem 0.35rem;
		border-radius: 0.375rem;
		border: 1px solid var(--color-border);
		background: var(--color-card);
		color: var(--color-text-primary);
	}
	.zones-sidebar {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.zone-box {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.zone-box-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.zone-box-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}
	.command-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.command-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		width: 6.5rem;
	}
	.inspector-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.inspector-tools {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.filter-input {
		width: 14rem;
		max-width: 100%;
		font-size: 0.75rem;
	}
	.inspector-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.4rem;
		max-height: 18rem;
		overflow-y: auto;
	}
	.inspector-item {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.45rem 0.65rem;
		border-radius: 0.5rem;
		background: var(--color-card);
		border: 1px solid var(--color-border);
	}
	.inspector-name {
		font-size: 0.8125rem;
		font-weight: 500;
	}
	.inspector-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
	}
	.inspector-actions .zone-select {
		width: auto;
	}
	@keyframes card-enter {
		from {
			opacity: 0;
			transform: translateY(6px) scale(0.97);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
	@media (max-width: 960px) {
		.playmat-layout {
			grid-template-columns: 1fr;
		}
		.phase-pills {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
	@media (max-width: 600px) {
		.bf-card-slot,
		.hand-card-slot,
		.card-tile {
			width: 7rem;
		}
		.bf-card-slot.is-tapped {
			margin-inline: 1rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.bf-card-slot,
		.hand-card-slot,
		.card-tile,
		.phase-pill,
		.phase-step {
			animation: none;
			transition: none;
		}
	}
</style>
