import { readFile } from 'node:fs/promises';
import { parse } from 'svelte/compiler';
import { expect, it } from 'vitest';

it('keeps the production Quick Add editor in the dialog lifetime rather than a task-mode branch', async () => {
	const source = await readFile(
		new URL('../../src/routes/mtg/inventory/+page.svelte', import.meta.url),
		'utf8'
	);
	const ast = parse(source, { modern: true });
	const owners: string[][] = [];
	function visit(value: unknown, branches: string[] = [], snippet = false) {
		if (!value || typeof value !== 'object') return;
		if (Array.isArray(value)) {
			for (const item of value) visit(item, branches, snippet);
			return;
		}
		const node = value as Record<string, unknown>;
		if (node.type === 'SnippetBlock') {
			branches = [];
			snippet = true;
		}
		if (snippet && ['IfBlock', 'KeyBlock', 'EachBlock'].includes(String(node.type)))
			branches = [...branches, String(node.type)];
		if (node.type === 'Component' && node.name === 'CardQuickAdd') owners.push(branches);
		for (const [key, child] of Object.entries(node))
			if (key !== 'parent') visit(child, branches, snippet);
	}
	visit(ast);
	expect(owners).toEqual([[]]);
});
