import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../static/theme.js', import.meta.url), 'utf8');
function boot(saved: string | null = null, blocked = false) {
	const events = new Map<
		string,
		(event: { detail?: string; key?: string; newValue?: string | null }) => void
	>();
	let mediaChanged = () => {};
	const media = {
		matches: false,
		addEventListener: (_: string, fn: () => void) => {
			mediaChanged = fn;
		}
	};
	const classes = new Set<string>();
	const root = {
		dataset: { theme: '' },
		classList: {
			toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name))
		}
	};
	const storage = {
		getItem: () => {
			if (blocked) throw new Error('blocked');
			return saved;
		},
		setItem: (_: string, value: string) => {
			if (blocked) throw new Error('blocked');
			saved = value;
		}
	};
	runInNewContext(source, {
		window: {
			matchMedia: () => media,
			addEventListener: (name: string, fn: typeof mediaChanged) => events.set(name, fn),
			dispatchEvent: () => {}
		},
		document: { documentElement: root, querySelector: () => null },
		localStorage: storage,
		Event: class {}
	});
	return {
		root,
		classes,
		saved: () => saved,
		choose: (detail: string) => events.get('spellbook:set-theme')!({ detail }),
		system: (dark: boolean) => {
			media.matches = dark;
			mediaChanged();
		}
	};
}

describe('theme bootstrap', () => {
	it('follows system changes until an explicit preference is selected', () => {
		const page = boot();
		expect(page.classes.has('light')).toBe(true);
		page.system(true);
		expect(page.classes.has('dark')).toBe(true);
		page.choose('light');
		page.system(true);
		expect(page.classes.has('light')).toBe(true);
		expect(page.saved()).toBe('light');
	});
	it('restores saved preferences and rejects invalid choices', () => {
		const page = boot('dark');
		expect(page.classes.has('dark')).toBe(true);
		page.choose('invalid');
		expect(page.root.dataset.theme).toBe('dark');
		expect(boot('invalid').root.dataset.theme).toBe('system');
	});
	it('remains usable with unavailable storage', () => {
		const page = boot(null, true);
		page.choose('dark');
		expect(page.classes.has('dark')).toBe(true);
	});
});
