<script lang="ts">
	import { Dialog } from 'bits-ui';
	import ManaCost from './ManaCost.svelte';
	import RarityBadge from './RarityBadge.svelte';
	import CardQuickAdd from './CardQuickAdd.svelte';
	import OrnamentalDivider from '$lib/components/layout/OrnamentalDivider.svelte';
	import { searchPrintings } from '$lib/search/meilisearch';
	import type { CardDocument } from '$lib/search/types';
	import { getManaFontClass } from '$lib/utils/manaCostParser';

	interface Props {
		card: CardDocument;
		onClose: () => void;
	}

	let { card, onClose }: Props = $props();

	let printings: CardDocument[] = $state([]);
	let selectedPrinting: CardDocument | null = $state(null);
	let loadingPrintings = $state(true);
	let detailOpen = $state(false);
	let selectedLang = $state('en');
	let dropdownOpen = $state(false);
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
		selectedPrinting = null;
		loadingPrintings = true;
		selectedLang = 'en';
		foilFilter = 'all';
		allPrintingsView = false;
		activeTab = 'printings';

		searchPrintings(oracleId)
			.then((result) => {
				if (!controller.signal.aborted) {
					printings = result.hits;
					loadingPrintings = false;
				}
			})
			.catch(() => {
				if (!controller.signal.aborted) {
					loadingPrintings = false;
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
		dropdownOpen = false;
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

	let oracleLines = $derived(
		activeCard.oracle_text ? activeCard.oracle_text.split('\n') : []
	);

	let hasPowerToughness = $derived(
		activeCard.power != null && activeCard.toughness != null
	);
</script>

<Dialog.Root open={detailOpen} onOpenChange={handleOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4 lg:p-8"
			style="background: rgba(13, 11, 15, 0.85); backdrop-filter: blur(4px); animation: fade-in 200ms ease-out;"
		>
			<Dialog.Content
				class="modal-content relative z-50 flex w-full flex-col rounded-t-xl sm:max-w-5xl sm:rounded-lg"
				style="
					max-height: 92dvh;
					background-color: var(--color-stone);
					border: 1px solid rgba(196, 146, 42, 0.35);
					box-shadow: 0 0 0 1px rgba(255,255,255,0.04) inset, 0 24px 64px rgba(13, 11, 15, 0.9);
					animation: modal-enter 220ms ease-out;
				"
				onInteractOutside={(e) => e.preventDefault()}
			>
				<!-- Header: name + mana cost + close -->
				<div class="shrink-0 px-4 pt-4 sm:px-5" style="border-bottom: 1px solid rgba(196, 146, 42, 0.2);">
					<div class="flex items-start justify-between gap-2 pr-10">
						<Dialog.Title
							class="min-w-0 break-words font-display text-base font-bold text-text-primary sm:text-xl"
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
						{#each [
							{ id: 'printings' as TabId, label: 'Printings' },
							{ id: 'info' as TabId, label: 'Card Info' }
						] as tab (tab.id)}
							<button
								onclick={() => { activeTab = tab.id; allPrintingsView = false; }}
								class="relative cursor-pointer border-none bg-transparent pb-2 font-display text-xs uppercase tracking-widest transition-colors"
								style="color: {activeTab === tab.id ? 'var(--color-gold-bright)' : 'var(--color-text-muted)'};"
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

						{#if allPrintingsView}
							<!-- ==================== ALL PRINTINGS GRID ==================== -->
							<div>
								<div class="mb-3 flex items-center justify-between">
									<h3 class="font-display text-sm font-bold text-text-primary">
										Select a printing
									</h3>
									<button
										onclick={() => (allPrintingsView = false)}
										class="cursor-pointer rounded border-none bg-transparent px-2 py-1 font-body text-xs text-text-muted transition-colors hover:text-gold-bright"
									>
										&#8592; Back
									</button>
								</div>

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
									<p class="font-body text-xs italic text-text-muted">No printings match the current filters.</p>
								{/if}
							</div>

						{:else if activeTab === 'printings'}
							<!-- ==================== PRINTINGS TAB ==================== -->

							<!-- Printing dropdown -->
							<div>
								<span class="mb-1.5 block font-display text-xs uppercase tracking-widest text-text-secondary">
									Printing
								</span>
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div class="relative">
									<button
										onclick={() => (dropdownOpen = !dropdownOpen)}
										class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left font-body text-sm transition-colors"
										style="
											background-color: var(--color-slate);
											border: 1px solid {dropdownOpen ? 'var(--color-gold)' : 'rgba(196, 146, 42, 0.25)'};
											color: var(--color-text-primary);
										"
									>
										<span class="flex min-w-0 items-center gap-2">
											<RarityBadge rarity={activeCard.rarity} />
											<span class="truncate">
												{activeCard.set_name}
												<span class="text-text-muted">
													({activeCard.set_code}) #{activeCard.collector_number}
												</span>
											</span>
										</span>
										<span
											class="shrink-0 text-xs text-text-muted transition-transform duration-150"
											style="transform: rotate({dropdownOpen ? '180deg' : '0deg'});"
										>&#9660;</span>
									</button>

									{#if dropdownOpen}
										<div
											class="fixed inset-0"
											onclick={() => (dropdownOpen = false)}
											onkeydown={(e) => { if (e.key === 'Escape') dropdownOpen = false; }}
											role="button"
											tabindex="-1"
											aria-label="Close dropdown"
										></div>
										<div
											class="absolute left-0 z-20 mt-1 w-full overflow-y-auto rounded-lg"
											style="
												max-height: 280px;
												background-color: var(--color-crypt);
												border: 1px solid rgba(196, 146, 42, 0.3);
												box-shadow: 0 8px 32px rgba(13, 11, 15, 0.8);
											"
										>
											{#each filteredPrintings as printing (printing.id)}
												{@const isCurrent =
													selectedPrinting?.id === printing.id ||
													(!selectedPrinting && printing.id === card.id)}
												<button
													onclick={() => selectPrinting(printing)}
													class="flex w-full cursor-pointer items-start gap-3 px-3 py-2.5 text-left font-body text-sm transition-colors"
													style="
														background-color: {isCurrent ? 'var(--color-mist)' : 'transparent'};
														border: none;
														border-bottom: 1px solid rgba(196, 146, 42, 0.08);
														color: var(--color-text-primary);
													"
													onmouseenter={(e) => {
														if (!isCurrent) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-slate)';
													}}
													onmouseleave={(e) => {
														if (!isCurrent) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
													}}
												>
													<RarityBadge rarity={printing.rarity} />
													<div class="min-w-0 flex-1">
														<span class="block truncate font-medium">
															{printing.set_name}
															{#if isCurrent}
																<span class="ml-1 text-xs text-gold">(Current)</span>
															{/if}
														</span>
														<span class="text-xs text-text-muted">
															({printing.set_code}) #{printing.collector_number}
														</span>
													</div>
												</button>
											{/each}
											{#if filteredPrintings.length === 0}
												<p class="px-3 py-3 font-body text-xs italic text-text-muted">
													No printings match the current filters.
												</p>
											{/if}
										</div>
									{/if}
								</div>
							</div>

							<!-- Action row: All printings + Foil/Nonfoil -->
							<div class="flex flex-wrap items-center gap-2">
								<button
									onclick={() => (allPrintingsView = true)}
									class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 font-display text-xs uppercase tracking-wider transition-colors"
									style="
										background-color: var(--color-slate);
										border: 1px solid rgba(196, 146, 42, 0.25);
										color: var(--color-text-secondary);
									"
								>
									&#9638; All printings
								</button>
								<button
									onclick={() => (foilFilter = foilFilter === 'nonfoil' ? 'all' : 'nonfoil')}
									class="inline-flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 font-display text-xs uppercase tracking-wider transition-colors"
									style="
										background-color: {foilFilter === 'nonfoil' ? 'var(--color-mist)' : 'var(--color-slate)'};
										border: 1px solid {foilFilter === 'nonfoil' ? 'var(--color-gold)' : 'rgba(196, 146, 42, 0.25)'};
										color: {foilFilter === 'nonfoil' ? 'var(--color-gold-bright)' : 'var(--color-text-secondary)'};
									"
								>
									Nonfoil
								</button>
								<button
									onclick={() => (foilFilter = foilFilter === 'foil' ? 'all' : 'foil')}
									class="inline-flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 font-display text-xs uppercase tracking-wider transition-colors"
									style="
										background-color: {foilFilter === 'foil' ? 'var(--color-mist)' : 'var(--color-slate)'};
										border: 1px solid {foilFilter === 'foil' ? 'var(--color-gold)' : 'rgba(196, 146, 42, 0.25)'};
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
										>
											{LANG_FLAGS[lang] ?? lang}
										</button>
									{/each}
								</div>
							{/if}

							<OrnamentalDivider />

							<!-- Collection add -->
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

							<OrnamentalDivider />

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
								<OrnamentalDivider />
								<div>
									<h3 class="mb-2 font-display text-xs uppercase tracking-widest text-text-secondary">
										Legalities
									</h3>
									<div class="flex flex-wrap gap-1.5">
										{#each Object.entries(activeCard.legalities) as [format, status]}
											<span
												class="rounded px-2 py-0.5 font-mono text-[10px] uppercase"
												style="
													background-color: {status === 'legal' ? 'var(--color-success)' : status === 'banned' ? 'var(--color-error)' : 'var(--color-slate)'};
													color: {status === 'legal' || status === 'banned' ? '#fff' : 'var(--color-text-muted)'};
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
					Details for {activeCard.name}{activeCard.type_line ? `, a ${activeCard.type_line} card` : ''}.
				</Dialog.Description>
			</Dialog.Content>
		</Dialog.Overlay>
	</Dialog.Portal>
</Dialog.Root>
