import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../src');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

describe('design-system typography scale (#428)', () => {
	it('defines the 6 semantic typography tokens and preserves font families in app.css', () => {
		const css = read('app.css');
		expect(css).toContain("--font-display: 'Marcellus', Georgia, serif;");
		expect(css).toContain("--font-body: 'IBM Plex Mono', monospace;");
		expect(css).toContain('--font-interface: ui-sans-serif, system-ui, sans-serif;');

		expect(css).toContain('--text-page-title: 1.5rem;');
		expect(css).toContain('--text-page-title--line-height: 2rem;');
		expect(css).toContain('--text-section-title: 1.25rem;');
		expect(css).toContain('--text-section-title--line-height: 1.75rem;');
		expect(css).toContain('--text-body: 1rem;');
		expect(css).toContain('--text-body--line-height: 1.5rem;');
		expect(css).toContain('--text-body-compact: 0.875rem;');
		expect(css).toContain('--text-body-compact--line-height: 1.25rem;');
		expect(css).toContain('--text-control: 0.875rem;');
		expect(css).toContain('--text-control--line-height: 1.25rem;');
		expect(css).toContain('--text-control--font-weight: 500;');
		expect(css).toContain('--text-meta: 0.75rem;');
		expect(css).toContain('--text-meta--line-height: 1rem;');
	});

	it('migrates shared app.css page titles, navigation, buttons, labels, and mobile inputs to tokens', () => {
		const css = read('app.css');
		expect(css).toMatch(
			/\.page-title h1,\s*\.account-form h1\s*\{[^}]*font-size:\s*var\(--text-page-title\);/s
		);
		expect(css).toMatch(/\.nav-link\s*\{[^}]*font-size:\s*var\(--text-control\);/s);
		expect(css).toMatch(/\.btn,\s*\.btn-gold\s*\{[^}]*font-size:\s*var\(--text-control\);/s);
		expect(css).toMatch(/\.label\s*\{[^}]*font-size:\s*var\(--text-control\);/s);
		expect(css).toMatch(/\.input\s*\{[^}]*font-size:\s*var\(--text-body-compact\);/s);
		expect(css).toMatch(
			/@media \(max-width: 700px\)\s*\{[\s\S]*\.input\s*\{[^}]*font-size:\s*var\(--text-body\);/s
		);

		expect(css).not.toContain('font-size: 1.65rem;');
		expect(css).not.toContain('font-size: 0.8rem;');
		expect(css).not.toContain('font-size: 0.8125rem;');
	});

	it('keeps mobile inputs at 16px without utility text-size overrides', () => {
		const conflictingTextSize =
			/(?:^|\s)text-(?:xs|sm|meta|body-compact|control|\[[^\]]*(?:px|rem|em)\])(?:\s|$)/;

		const searchBar = read('lib/components/search/SearchBar.svelte');
		const searchInputClass = searchBar.match(/<input[\s\S]*?class="([^"]+)"/)?.[1] ?? '';
		expect(searchInputClass.split(/\s+/)).toContain('input');
		expect(searchInputClass).not.toMatch(conflictingTextSize);

		const scanWorkspace = read('routes/mtg/scan/ScanWorkspace.svelte');
		const scanInputClass =
			scanWorkspace.match(/id="scan-session-id"[\s\S]*?class="([^"]+)"/)?.[1] ?? '';
		expect(scanInputClass.split(/\s+/)).toContain('input');
		expect(scanInputClass).not.toMatch(conflictingTextSize);

		const powerSearch = read('lib/components/search/PowerSearch.svelte');
		expect(powerSearch).toMatch(
			/@media \(max-width: 700px\)\s*\{[^}]*\.power-search-field :global\(input\)\s*\{[^}]*font-size:\s*var\(--text-body\);/s
		);

		const historyFilters = read('lib/components/valuation/HistoryFilters.svelte');
		expect(historyFilters).toMatch(
			/@media \(max-width: 700px\)\s*\{[^}]*input\s*\{[^}]*font-size:\s*var\(--text-body\);/s
		);
	});

	it('aligns view navigation, tabs, section headings, readouts, and toolbar triggers on semantic tokens', () => {
		const settingsLayout = read('routes/settings/+layout.svelte');
		expect(settingsLayout).toMatch(
			/\.settings-nav a\s*\{[^}]*font-size:\s*var\(--text-control\);/s
		);

		const settingsPage = read('routes/settings/+page.svelte');
		expect(settingsPage).toContain('id="phase-rs-heading" class="font-display text-section-title"');

		const cardInspector = read('lib/components/cards/CardInspector.svelte');
		expect(cardInspector).toMatch(/aria-pressed=\{activeTab === tab\.id\}[\s\S]*?text-control/);

		const valueHistoryChart = read('lib/components/charts/ValueHistoryChart.svelte');
		expect(valueHistoryChart).toMatch(
			/\.history-readout\s*\{[^}]*font-size:\s*var\(--text-meta\);/s
		);

		const inventoryPage = read('routes/mtg/inventory/+page.svelte');
		expect(inventoryPage).toMatch(
			/\.inventory-views a\s*\{[^}]*font-size:\s*var\(--text-control\);/s
		);

		const actionMenu = read('lib/components/ui/menu/ActionMenu.svelte');
		expect(actionMenu).not.toMatch(/:global\(\.menu-trigger-toolbar\)\s*\{[^}]*font-size:/s);

		const filterPopover = read('lib/components/ui/popover/FilterPopover.svelte');
		expect(filterPopover).not.toMatch(/:global\(\.filter-trigger\)\s*\{[^}]*font-size:/s);
	});
});
