<script lang="ts">
	import { workspaceSavedState } from '#lib/saved-state/workspace.svelte.ts';
	import PriceReference from './PriceReference.svelte';
	import Select from '#lib/components/ui/select/Select.svelte';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import ManaCost from './ManaCost.svelte';
	import RarityBadge from './RarityBadge.svelte';
	import CardQuickAdd from './CardQuickAdd.svelte';
	import { searchPrintings } from '#lib/search/catalog.ts';
	import type { CardDocument } from '#lib/search/types.ts';
	import { getManaFontClass } from '#lib/utils/manaCostParser.ts';

	interface Props {
		card: CardDocument;
		inventoryEntryId?: string;
		inventoryPriceRefreshKey?: string;
		onPendingChange?: (pending: boolean) => void;
		actions?: Snippet<[CardDocument]>;
	}

	let { card, onPendingChange, actions, inventoryEntryId, inventoryPriceRefreshKey }: Props =
		$props();

	let printings: CardDocument[] = $state([]);
	let selectedPrinting: CardDocument | null = $state(null);
	let loadingPrintings = $state(true);
	let printingsError = $state('');
	let selectedLang = $state('en');
	let allPrintingsView = $state(false);
	let foilFilter: 'all' | 'foil' | 'nonfoil' = $state('all');
	let quickAddPending = $state(false);

	type TabId = 'printings' | 'info';
	let activeTab: TabId = $state('printings');

	const LANG_FLAGS: Record<string, string> = {
		en: '\u{1F1EC}\u{1F1E7}',
		de: '\u{1F1E9}\u{1F1EA}',
		fr: '\u{1F1EB}\u{1F1F7}',
		it: '\u{1F1EE}\u{1F1F9}',
		es: '\u{1F1EA}\u{1F1F8}',
		pt: '\u{1F1E7}\u{1F1F7}',
		ja: '\u{1F1EF}\u{1F1F5}',
		ko: '\u{1F1F0}\u{1F1F7}',
		ru: '\u{1F1F7}\u{1F1FA}',
		zhs: '\u{1F1E8}\u{1F1F3}',
		zht: '\u{1F1F9}\u{1F1FC}',
		he: '\u{1F1EE}\u{1F1F1}',
		la: '\u{1F3DB}\u{FE0F}',
		grc: '\u{1F3DB}\u{FE0F}',
		ar: '\u{1F1F8}\u{1F1E6}',
		sa: '\u{1F1EE}\u{1F1F3}',
		ph: '\u{1F1F5}\u{1F1ED}'
	};

	let activeCard = $derived(
		selectedPrinting ?? printings.find((printing) => printing.id === card.id) ?? card
	);

	// Fetch printings with AbortController cleanup
	$effect(() => {
		const oracleId = card.oracle_id;
		const controller = new AbortController();
		printings = [];
		selectedPrinting = null;
		loadingPrintings = true;
		printingsError = '';
		selectedLang = 'en';
		foilFilter = 'all';
		allPrintingsView = false;
		activeTab = 'printings';

		searchPrintings(oracleId, { signal: controller.signal })
			.then((result) => {
				if (!controller.signal.aborted) {
					printings = result.hits;
					loadingPrintings = false;
				}
			})
			.catch((cause: unknown) => {
				if (!controller.signal.aborted) {
					loadingPrintings = false;
					printingsError = cause instanceof Error ? cause.message : 'Unable to load printings.';
				}
			});

		return () => controller.abort();
	});

	// Unique languages from all printings
	let availableLanguages = $derived.by(() => {
		const langs = new Set<string>();
		for (const p of printings) {
			if (p.lang) langs.add(p.lang);
		}
		return Array.from(langs).sort((a, b) => {
			if (a === 'en') return -1;
			if (b === 'en') return 1;
			return a.localeCompare(b);
		});
	});

	// Filter by language + foil
	let filteredPrintings = $derived.by(() => {
		let result = printings.filter((p) => p.lang === selectedLang);
		if (foilFilter === 'foil') result = result.filter((p) => p.is_foil_available);
		else if (foilFilter === 'nonfoil') result = result.filter((p) => p.is_nonfoil_available);
		return result;
	});

	function selectPrinting(printing: CardDocument) {
		if (quickAddPending) return;
		selectedPrinting = printing;
		allPrintingsView = false;
	}

	interface OracleSegment {
		type: 'text' | 'mana';
		value: string;
	}

	function parseOracleSegments(text: string): OracleSegment[] {
		if (!text) return [];
		const segments: OracleSegment[] = [];
		const regex = /\{([^}]+)\}/g;
		let lastIndex = 0;
		let match: RegExpExecArray | null;

		while ((match = regex.exec(text)) !== null) {
			if (match.index > lastIndex) {
				segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
			}
			segments.push({ type: 'mana', value: match[1] });
			lastIndex = match.index + match[0].length;
		}

		if (lastIndex < text.length) {
			segments.push({ type: 'text', value: text.slice(lastIndex) });
		}

		return segments;
	}

	let oracleLines = $derived(activeCard.oracle_text ? activeCard.oracle_text.split('\n') : []);

	let hasPowerToughness = $derived(activeCard.power != null && activeCard.toughness != null);
</script>

<!-- Header: name + mana cost + close -->
<div class="shrink-0 px-4 pt-4 sm:px-5" style="border-bottom: 1px solid var(--color-border);">
	<div class="flex items-start justify-between gap-2 pr-10">
		<h2 class="min-w-0 break-words font-display text-base font-semibold text-text-primary">
			{activeCard.name}
		</h2>
		{#if activeCard.mana_cost}
			<ManaCost cost={activeCard.mana_cost} class="shrink-0 flex-wrap justify-end" />
		{/if}
	</div>

	<!-- Tab bar -->
	<div class="mt-3 flex gap-6">
		{#each [{ id: 'printings' as TabId, label: 'Printings' }, { id: 'info' as TabId, label: 'Card Info' }] as tab (tab.id)}
			<button
				onclick={() => {
					activeTab = tab.id;
					allPrintingsView = false;
				}}
				aria-pressed={activeTab === tab.id}
				disabled={quickAddPending}
				class="relative min-h-11 cursor-pointer border-none bg-transparent pb-2 font-body text-sm transition-colors disabled:opacity-50"
				style="color: {activeTab === tab.id
					? 'var(--color-gold-bright)'
					: 'var(--color-text-muted)'};"
			>
				{tab.label}
				{#if activeTab === tab.id}
					<span
						class="absolute bottom-0 left-0 h-0.5 w-full rounded"
						style="background-color: var(--color-gold);"
					></span>
				{/if}
			</button>
		{/each}
	</div>
</div>

<!-- Body: stacked on mobile, side-by-side on lg+ -->
<div class="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
	<!-- Card image -->
	{#if activeCard.image_uri || activeCard.image_uri_small}
		<div class="inspector-media">
			<img
				src={activeCard.image_uri || activeCard.image_uri_small}
				alt={activeCard.name}
				class="inspector-art"
				style="aspect-ratio: 488 / 680;"
			/>
			<div class="mobile-printing-identity">
				<p>{activeCard.set_name || activeCard.set_code.toUpperCase()}</p>
				<p class="text-text-secondary">
					{[
						activeCard.set_code.toUpperCase(),
						activeCard.collector_number ? `#${activeCard.collector_number}` : '',
						activeCard.lang ? `· ${activeCard.lang.toUpperCase()}` : ''
					]
						.filter(Boolean)
						.join(' ')}
				</p>
			</div>
		</div>
	{/if}

	<!-- Tab content (scrollable on desktop) -->
	<div class="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-5 lg:overflow-y-auto">
		{#if printingsError}<p role="alert" class="text-sm text-text-secondary">
				{printingsError}
			</p>{/if}
		{#if allPrintingsView}
			<!-- ==================== ALL PRINTINGS GRID ==================== -->
			<div>
				<div class="mb-3 flex items-center justify-between">
					<h3 class="sr-only">Select a printing</h3>
					<button
						disabled={quickAddPending}
						onclick={() => (allPrintingsView = false)}
						class="min-h-11 cursor-pointer rounded border-none bg-transparent px-2 py-1 font-body text-sm text-text-muted transition-colors hover:text-gold-bright"
					>
						&#8592; Back
					</button>
				</div>

				{#if loadingPrintings}
					<div
						class="flex items-center gap-3 rounded-lg px-3 py-4"
						style="background-color: var(--color-slate);"
					>
						<div
							class="h-5 w-5 animate-spin rounded-full"
							style="border: 2px solid var(--color-gold-dim); border-top-color: var(--color-gold-bright);"
						></div>
						<p class="font-body text-sm text-text-secondary">Loading printings...</p>
					</div>
				{:else if printings.length === 0}
					<p class="font-body text-sm italic text-text-muted">Printings unavailable right now.</p>
				{:else}
					{#if availableLanguages.length > 1}
						<div class="mb-3 flex flex-wrap gap-1">
							{#each availableLanguages as lang (lang)}
								<button
									disabled={quickAddPending}
									onclick={() => (selectedLang = lang)}
									class="min-h-11 min-w-11 cursor-pointer rounded px-2 py-1 text-sm leading-none transition-all duration-150"
									style="
													background-color: {selectedLang === lang ? 'var(--color-mist)' : 'transparent'};
													border: 1px solid {selectedLang === lang ? 'var(--color-gold)' : 'transparent'};
													opacity: {selectedLang === lang ? '1' : '0.5'};
												"
									title={lang}
									aria-label={`Show ${lang} printings`}
									aria-pressed={selectedLang === lang}
								>
									{LANG_FLAGS[lang] ?? lang}
								</button>
							{/each}
						</div>
					{/if}

					<div
						class="grid gap-3"
						style="grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));"
					>
						{#each filteredPrintings as printing (printing.id)}
							{@const isActive =
								selectedPrinting?.id === printing.id ||
								(!selectedPrinting && printing.id === card.id)}
							<button
								disabled={quickAddPending}
								onclick={() => selectPrinting(printing)}
								class="cursor-pointer overflow-hidden rounded-lg p-0 text-left transition-all duration-150"
								style="
													background: transparent;
													border: 2px solid {isActive ? 'var(--color-gold-bright)' : 'transparent'};
												"
							>
								{#if isActive}
									<div
										class="py-1 text-center font-body text-xs"
										style="background-color: var(--color-gold); color: var(--color-text-on-gold);"
									>
										Selected
									</div>
								{/if}
								<img
									src={printing.image_uri_small || printing.image_uri}
									alt="{printing.set_name} #{printing.collector_number}"
									class="block w-full"
									style="aspect-ratio: 488 / 680;"
									loading="lazy"
								/>
								<div class="flex items-center gap-1 px-1.5 py-1">
									<span class="font-body text-xs uppercase text-text-muted">
										{printing.set_code}
									</span>
									<RarityBadge rarity={printing.rarity} />
									<span class="font-body text-xs text-text-muted">
										#{printing.collector_number}
									</span>
								</div>
							</button>
						{/each}
					</div>

					{#if filteredPrintings.length === 0}
						<p class="font-body text-xs italic text-text-muted">
							No printings match the current filters.
						</p>
					{/if}
				{/if}
			</div>
		{:else if activeTab === 'printings'}
			<!-- ==================== PRINTINGS TAB ==================== -->

			{#if loadingPrintings}
				<div
					class="flex items-center gap-3 rounded-lg px-3 py-4"
					style="background-color: var(--color-slate);"
				>
					<div
						class="h-5 w-5 animate-spin rounded-full"
						style="border: 2px solid var(--color-gold-dim); border-top-color: var(--color-gold-bright);"
					></div>
					<p class="font-body text-sm text-text-secondary">Loading printings...</p>
				</div>
			{:else if printings.length === 0}
				<p class="font-body text-sm italic text-text-muted">Printings unavailable right now.</p>
			{:else}
				<Select
					label="Select card printing"
					disabled={quickAddPending}
					value={activeCard.id}
					displayValue={`${activeCard.set_name} (${activeCard.set_code.toUpperCase()}) #${activeCard.collector_number}`}
					options={filteredPrintings.map((printing) => ({
						value: printing.id,
						label: `${printing.set_name} (${printing.set_code.toUpperCase()}) #${printing.collector_number}`
					}))}
					onchange={(id) => {
						const printing = filteredPrintings.find((item) => item.id === id);
						if (printing) selectPrinting(printing);
					}}
				/>

				<div class="printing-tools">
					<button
						type="button"
						onclick={() => (allPrintingsView = true)}
						disabled={quickAddPending}
						class="btn btn-secondary font-body text-xs">All printings</button
					>
					<fieldset class="printing-availability" disabled={quickAddPending}>
						<legend>Printing availability</legend>
						<div>
							{#each ['nonfoil', 'foil'] as finish}
								<button
									type="button"
									onclick={() =>
										(foilFilter =
											foilFilter === finish ? 'all' : finish === 'foil' ? 'foil' : 'nonfoil')}
									aria-pressed={foilFilter === finish}
									>{finish === 'foil' ? 'Foil' : 'Nonfoil'}</button
								>
							{/each}
						</div>
					</fieldset>
				</div>

				<!-- Language flags (own row) -->
				{#if availableLanguages.length > 1}
					<div class="flex flex-wrap gap-1">
						{#each availableLanguages as lang (lang)}
							<button
								disabled={quickAddPending}
								onclick={() => (selectedLang = lang)}
								class="min-h-11 min-w-11 cursor-pointer rounded px-2 py-1 text-sm leading-none transition-all duration-150"
								style="
													background-color: {selectedLang === lang ? 'var(--color-mist)' : 'transparent'};
													border: 1px solid {selectedLang === lang ? 'var(--color-gold)' : 'transparent'};
													opacity: {selectedLang === lang ? '1' : '0.5'};
												"
								title={lang}
								aria-label={`Show ${lang} printings`}
								aria-pressed={selectedLang === lang}
							>
								{LANG_FLAGS[lang] ?? lang}
							</button>
						{/each}
					</div>
				{/if}
			{/if}

			<div class="border-t border-border" aria-hidden="true"></div>

			<!-- Inventory add -->
			<PriceReference
				printingId={activeCard.id}
				entryId={activeCard.id === card.id ? inventoryEntryId : undefined}
				{inventoryPriceRefreshKey}
				historyEnabled={inventoryEntryId === undefined}
			/>
			{#if actions}{@render actions(activeCard)}
			{:else if page.data.user && workspaceSavedState.getState() !== 'expired'}<CardQuickAdd
					card={activeCard}
					onPendingChange={(pending) => {
						quickAddPending = pending;
						onPendingChange?.(pending);
					}}
				/>
			{:else}<a
					class="btn btn-primary"
					href={`/auth/login?returnTo=${encodeURIComponent(`/mtg/search?q=${encodeURIComponent(card.name)}`)}`}
					>Sign in to add to inventory</a
				>{/if}
		{:else}
			<!-- ==================== CARD INFO TAB ==================== -->

			<!-- Type line -->
			{#if activeCard.type_line}
				<p class="font-body text-sm italic text-text-secondary">
					{activeCard.type_line}
				</p>
			{/if}

			<!-- Oracle text with mana symbols -->
			{#if oracleLines.length > 0}
				<div class="flex flex-col gap-1.5">
					{#each oracleLines as line}
						<p class="break-words font-body text-sm leading-relaxed text-text-primary">
							{#each parseOracleSegments(line) as seg}
								{#if seg.type === 'mana'}
									<i
										class="ms ms-cost ms-shadow {getManaFontClass(seg.value)}"
										title={seg.value}
										role="img"
										aria-label="{seg.value} mana"
									></i>
								{:else}
									{seg.value}
								{/if}
							{/each}
						</p>
					{/each}
				</div>
			{/if}

			<div class="border-t border-border" aria-hidden="true"></div>

			<!-- Card details -->
			<div class="flex flex-col gap-1.5 font-body text-sm">
				{#if hasPowerToughness}
					<p>
						<span class="font-semibold text-text-secondary">Power/Toughness:</span>
						<span class="ml-1 text-text-primary">{activeCard.power}/{activeCard.toughness}</span>
					</p>
				{/if}
				<p>
					<span class="font-semibold text-text-secondary">Rarity:</span>
					<span class="ml-1 capitalize text-text-primary">{activeCard.rarity}</span>
				</p>
				{#if activeCard.collector_number}
					<p>
						<span class="font-semibold text-text-secondary">Collector Number:</span>
						<span class="ml-1 text-text-primary">{activeCard.collector_number}</span>
					</p>
				{/if}
				<p>
					<span class="font-semibold text-text-secondary">Set:</span>
					<span class="ml-1 text-text-primary">{activeCard.set_name}</span>
				</p>
			</div>

			<!-- Legalities -->
			{#if activeCard.legalities && Object.keys(activeCard.legalities).length > 0}
				<div class="border-t border-border" aria-hidden="true"></div>
				<div>
					<h3 class="sr-only">Legalities</h3>
					<div class="flex flex-wrap gap-1.5">
						{#each Object.entries(activeCard.legalities) as [format, status]}
							<span
								class="rounded px-2 py-0.5 font-mono text-[10px] uppercase"
								style="
													background-color: {status === 'legal'
									? 'var(--color-success)'
									: status === 'banned'
										? 'var(--color-error)'
										: 'var(--color-slate)'};
													color: {status === 'legal' || status === 'banned'
									? 'var(--color-void)'
									: 'var(--color-text-muted)'};
												"
							>
								{format.replace(/_/g, ' ')}
							</span>
						{/each}
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.inspector-media {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-shrink: 0;
		padding: 1rem 1rem 0;
	}
	.inspector-art {
		display: block;
		width: 160px;
		max-width: 100%;
		height: auto;
		object-fit: contain;
		border-radius: 0.625rem;
		flex-shrink: 0;
	}
	.mobile-printing-identity {
		min-width: 0;
		font-size: 0.8125rem;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.mobile-printing-identity p + p {
		margin-top: 0.5rem;
	}
	.printing-tools {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.printing-availability {
		min-width: 0;
	}
	.printing-availability legend {
		color: var(--color-text-secondary);
		font-size: 0.75rem;
	}
	.printing-availability > div {
		display: flex;
		gap: 0.75rem;
	}
	.printing-availability button {
		min-height: 44px;
		min-width: 44px;
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
		cursor: pointer;
	}
	.printing-availability button[aria-pressed='true'] {
		color: var(--color-text-primary);
		text-decoration: underline;
		text-underline-offset: 5px;
	}
	.printing-availability button:disabled {
		opacity: 0.5;
	}
	@media (min-width: 1024px) {
		.inspector-media {
			display: block;
			padding: 1.25rem;
			overflow-y: auto;
		}
		.inspector-art {
			width: 280px;
		}
		.mobile-printing-identity {
			display: none;
		}
	}
	@media (max-width: 359px) {
		.inspector-media {
			gap: 0.75rem;
		}
		.mobile-printing-identity {
			font-size: 0.75rem;
		}
	}
</style>
