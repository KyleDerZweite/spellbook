import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const frontendRoot = resolve(import.meta.dirname, '../..');
const srcRoot = resolve(frontendRoot, 'src');
const readSrc = (rel: string) => readFileSync(resolve(srcRoot, rel), 'utf8');

function walkFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const stats = statSync(full);
		if (stats.isDirectory()) files.push(...walkFiles(full));
		else if (/\.(?:svelte|ts|js)$/.test(entry)) files.push(full);
	}
	return files;
}

describe('design-system SVG icon library (@lucide/svelte) (#429)', () => {
	it('installs @lucide/svelte (not deprecated lucide-svelte) and preserves mana-font', () => {
		const pkg = JSON.parse(readFileSync(resolve(frontendRoot, 'package.json'), 'utf8')) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		expect(pkg.dependencies?.['@lucide/svelte']).toBeTruthy();
		expect(pkg.dependencies?.['lucide-svelte']).toBeUndefined();
		expect(pkg.devDependencies?.['lucide-svelte']).toBeUndefined();
		expect(pkg.dependencies?.['mana-font']).toBeTruthy();
		expect(readSrc('app.css')).toContain("@import 'mana-font/css/mana.min.css';");
	});

	it('removes superseded PlusIcon.svelte and uses static per-icon @lucide/svelte imports only', () => {
		expect(existsSync(resolve(srcRoot, 'lib/components/ui/PlusIcon.svelte'))).toBe(false);

		const sourceFiles = walkFiles(srcRoot);
		const lucideBarrelImport = /from\s+['"]@lucide\/svelte['"]/;
		const lucideStaticImport = /from\s+['"]@lucide\/svelte\/icons\/[a-z0-9-]+['"]/;
		let staticImportCount = 0;

		for (const file of sourceFiles) {
			const content = readFileSync(file, 'utf8');
			expect(content, `${file} must not reference removed PlusIcon`).not.toContain('PlusIcon');
			expect(
				content,
				`${file} must use static per-icon @lucide/svelte/icons/* imports instead of barrel imports`
			).not.toMatch(lucideBarrelImport);
			if (lucideStaticImport.test(content)) staticImportCount++;
		}

		expect(staticImportCount).toBeGreaterThan(0);
	});

	it('applies 16px inline / 20px standalone sizing and accessible icon-only labels on shared controls', () => {
		const nav = readSrc('lib/components/layout/Nav.svelte');
		expect(nav).toContain('@lucide/svelte/icons/search');
		expect(nav).toContain('size={16}');
		expect(nav).toContain('size={20}');
		expect(nav).not.toContain('<svg');

		const searchOverlay = readSrc('lib/components/search/SearchOverlay.svelte');
		expect(searchOverlay).toContain('@lucide/svelte/icons/x');
		expect(searchOverlay).toContain('size={20}');

		const cardDetail = readSrc('lib/components/cards/CardDetail.svelte');
		expect(cardDetail).toContain('@lucide/svelte/icons/x');
		expect(cardDetail).toContain('size={20}');

		const themeToggle = readSrc('lib/components/layout/ThemeToggle.svelte');
		expect(themeToggle).toContain('@lucide/svelte/icons/monitor');
		expect(themeToggle).toContain('@lucide/svelte/icons/sun');
		expect(themeToggle).toContain('@lucide/svelte/icons/moon');
		expect(themeToggle).toContain('size={20}');
		expect(themeToggle).not.toContain('<svg');

		const actionMenu = readSrc('lib/components/ui/menu/ActionMenu.svelte');
		expect(actionMenu).toContain('@lucide/svelte/icons/ellipsis-vertical');
		expect(actionMenu).toContain('@lucide/svelte/icons/chevron-down');
		expect(actionMenu).toContain('aria-label={label}');
		expect(actionMenu).not.toContain('<svg');

		const select = readSrc('lib/components/ui/select/Select.svelte');
		expect(select).toContain('@lucide/svelte/icons/funnel');
		expect(select).toContain('@lucide/svelte/icons/chevron-down');
		expect(select).toContain('@lucide/svelte/icons/check');
		expect(select).not.toContain('<svg');

		const filterPopover = readSrc('lib/components/ui/popover/FilterPopover.svelte');
		expect(filterPopover).toContain('@lucide/svelte/icons/funnel');
		expect(filterPopover).not.toContain('<svg');

		const passwordInput = readSrc('lib/components/auth/PasswordInput.svelte');
		expect(passwordInput).toContain('@lucide/svelte/icons/eye');
		expect(passwordInput).toContain('@lucide/svelte/icons/eye-off');
		expect(passwordInput).toContain('aria-label=');
		expect(passwordInput).not.toContain('<svg');

		const quantityControl = readSrc('lib/components/ui/QuantityControl.svelte');
		expect(quantityControl).toContain('@lucide/svelte/icons/minus');
		expect(quantityControl).toContain('@lucide/svelte/icons/plus');
		expect(quantityControl).not.toContain('<svg');

		const inventoryPage = readSrc('routes/mtg/inventory/+page.svelte');
		expect(inventoryPage).toContain('@lucide/svelte/icons/x');
		expect(inventoryPage).toMatch(
			/\.filter-chip-remove\s*\{[^}]*display:\s*grid;[^}]*place-items:\s*center;/s
		);
	});
});
