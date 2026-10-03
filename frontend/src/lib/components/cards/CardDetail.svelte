<script lang="ts">
	import { Dialog, Select } from 'bits-ui';
	import ManaCost from './ManaCost.svelte';
	import RarityBadge from './RarityBadge.svelte';
	import CardQuickAdd from './CardQuickAdd.svelte';
	import { searchPrintings } from '#lib/search/catalog.ts';
	import type { CardDocument } from '#lib/search/types.ts';
	import { getManaFontClass } from '#lib/utils/manaCostParser.ts';

	interface Props {
		card: CardDocument;
		onClose: () => void;
	}

	let { card, onClose }: Props = $props();

	let printings: CardDocument[] = $state([]);
	let selectedPrinting: CardDocument | null = $state(null);
	let loadingPrintings = $state(true);
	let printingsError = $state('');
	let detailOpen = $state(false);
	let selectedLang = $state('en');
	let allPrintingsView = $state(false);
	let foilFilter: 'all' | 'foil' | 'nonfoil' = $state('all');

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

	// bits-ui Dialog needs a false->true transition to properly open
	$effect(() => {
		detailOpen = true;
	});

	let activeCard = $derived(selectedPrinting ?? card);

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

	function handleOpenChange(open: boolean) {
		if (!open) onClose();
		detailOpen = open;
	}

	function selectPrinting(printing: CardDocument) {
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

<Dialog.Root open={detailOpen} onOpenChange={handleOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4 lg:p-8"
			style="background: rgba(8, 11, 13, 0.85); backdrop-filter: blur(4px); animation: fade-in 200ms ease-out;"
		>
			<Dialog.Content
				class="modal-content relative z-50 flex w-full flex-col rounded-t-xl sm:max-w-5xl sm:rounded-lg"
				style="
					max-height: 92dvh;
					background-color: var(--color-stone);
					border: 1px solid var(--color-border);
					box-shadow: 0 0 0 1px rgba(255,255,255,0.04) inset, 0 24px 64px rgba(8, 11, 13, 0.9);
					animation: modal-enter 220ms ease-out;
				"
			>
				<!-- Header: name + mana cost + close -->
				<div
					class="shrink-0 px-4 pt-4 sm:px-5"
					style="border-bottom: 1px solid var(--color-border);"
				>
					<div class="flex items-start justify-between gap-2 pr-10">
						<Dialog.Title
							class="min-w-0 break-words font-display text-base font-semibold text-text-primary"
							level={2}
						>
							{activeCard.name}
						</Dialog.Title>
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
								class="relative cursor-pointer border-none bg-transparent pb-2 font-display text-xs font-semibold transition-colors"
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

				<!-- Close button -->
				<Dialog.Close
					class="absolute right-3 top-3 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded border-none bg-void/60 text-text-secondary transition-colors hover:text-gold-bright"
					aria-label="Close card detail"
				>
					&#10005;
				</Dialog.Close>

				<!-- Body: stacked on mobile, side-by-side on lg+ -->
				<div class="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
					<!-- Card image -->
					{#if activeCard.image_uri || activeCard.image_uri_small}
						<div class="shrink-0 px-4 pt-3 pb-0 sm:px-5 sm:pt-4 lg:overflow-y-auto lg:pb-5">
							<img
								src={activeCard.image_uri || activeCard.image_uri_small}
								alt={activeCard.name}
								class="block w-full rounded-2xl sm:max-w-[300px] lg:w-[280px] xl:w-[320px]"
								style="aspect-ratio: 488 / 680;"
							/>
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
										onclick={() => (allPrintingsView = false)}
										class="cursor-pointer rounded border-none bg-transparent px-2 py-1 font-body text-xs text-text-muted transition-colors hover:text-gold-bright"
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
									<p class="font-body text-sm italic text-text-muted">
										Printings unavailable right now.
									</p>
								{:else}
									{#if availableLanguages.length > 1}
										<div class="mb-3 flex flex-wrap gap-1">
											{#each availableLanguages as lang (lang)}
												<button
													onclick={() => (selectedLang = lang)}
													class="cursor-pointer rounded px-1.5 py-0.5 text-sm leading-none transition-all duration-150"
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
												onclick={() => selectPrinting(printing)}
												class="cursor-pointer overflow-hidden rounded-lg p-0 text-left transition-all duration-150"
												style="
													background: transparent;
													border: 2px solid {isActive ? 'var(--color-gold-bright)' : 'transparent'};
												"
											>
												{#if isActive}
													<div
														class="py-0.5 text-center font-display text-[10px] uppercase tracking-wider"
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
													<span class="font-mono text-[10px] uppercase text-text-muted">
														{printing.set_code}
													</span>
													<RarityBadge rarity={printing.rarity} />
													<span class="font-mono text-[10px] text-text-muted">
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
								<p class="font-body text-sm italic text-text-muted">
									Printings unavailable right now.
								</p>
							{:else}
								<Select.Root
									type="single"
									value={activeCard.id}
									onValueChange={(id) => {
										const printing = filteredPrintings.find((item) => item.id === id);
										if (printing) selectPrinting(printing);
									}}
								>
									<Select.Trigger
										class="input flex items-center justify-between gap-2 text-left"
										aria-label="Select card printing"
									>
										<span class="truncate"
											>{activeCard.set_name} ({activeCard.set_code.toUpperCase()}) #{activeCard.collector_number}</span
										>
										<span aria-hidden="true">▾</span>
									</Select.Trigger>
									<Select.Portal>
										<Select.Content
											class="surface-menu z-[100] max-h-72 w-[var(--bits-select-anchor-width)] overflow-y-auto rounded-lg p-1"
											sideOffset={4}
										>
											<Select.Viewport>
												{#each filteredPrintings as printing (printing.id)}
													<Select.Item
														value={printing.id}
														label={`${printing.set_name} ${printing.collector_number}`}
														class="menu-item rounded"
													>
														{#snippet children({ selected })}
															<RarityBadge rarity={printing.rarity} />
															<span class="min-w-0 flex-1"
																><span class="block truncate">{printing.set_name}</span><span
																	class="text-xs text-text-muted"
																	>{printing.set_code.toUpperCase()} #{printing.collector_number}</span
																></span
															>
															{#if selected}<span aria-hidden="true" class="text-gold">✓</span>{/if}
														{/snippet}
													</Select.Item>
												{:else}<p class="p-3 text-sm text-text-muted">
														No printings match these filters.
													</p>{/each}
											</Select.Viewport>
										</Select.Content>
									</Select.Portal>
								</Select.Root>

								<!-- Action row: All printings + Foil/Nonfoil -->
								<div class="flex flex-wrap items-center gap-2">
									<button
										onclick={() => (allPrintingsView = true)}
										class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 font-display text-xs font-semibold transition-colors"
										style="
											background-color: var(--color-slate);
											border: 1px solid var(--color-border);
											color: var(--color-text-secondary);
										"
									>
										&#9638; All printings
									</button>
									<button
										onclick={() => (foilFilter = foilFilter === 'nonfoil' ? 'all' : 'nonfoil')}
										class="inline-flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 font-display text-xs font-semibold transition-colors"
										style="
											background-color: {foilFilter === 'nonfoil' ? 'var(--color-mist)' : 'var(--color-slate)'};
											border: 1px solid {foilFilter === 'nonfoil' ? 'var(--color-gold)' : 'var(--color-border)'};
											color: {foilFilter === 'nonfoil' ? 'var(--color-gold-bright)' : 'var(--color-text-secondary)'};
										"
									>
										Nonfoil
									</button>
									<button
										onclick={() => (foilFilter = foilFilter === 'foil' ? 'all' : 'foil')}
										class="inline-flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 font-display text-xs font-semibold transition-colors"
										style="
											background-color: {foilFilter === 'foil' ? 'var(--color-mist)' : 'var(--color-slate)'};
											border: 1px solid {foilFilter === 'foil' ? 'var(--color-gold)' : 'var(--color-border)'};
											color: {foilFilter === 'foil' ? 'var(--color-gold-bright)' : 'var(--color-text-secondary)'};
										"
									>
										Foil
									</button>
								</div>

								<!-- Language flags (own row) -->
								{#if availableLanguages.length > 1}
									<div class="flex flex-wrap gap-1">
										{#each availableLanguages as lang (lang)}
											<button
												onclick={() => (selectedLang = lang)}
												class="cursor-pointer rounded px-1.5 py-0.5 text-sm leading-none transition-all duration-150"
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
							<CardQuickAdd card={activeCard} />
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
										<span class="ml-1 text-text-primary"
											>{activeCard.power}/{activeCard.toughness}</span
										>
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

				<Dialog.Description class="sr-only">
					Details for {activeCard.name}{activeCard.type_line
						? `, a ${activeCard.type_line} card`
						: ''}.
				</Dialog.Description>
			</Dialog.Content>
		</Dialog.Overlay>
	</Dialog.Portal>
</Dialog.Root>
