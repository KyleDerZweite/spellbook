import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeCardName, type ParsedDecklistLine } from '../../src/lib/server/mtg/decklist';
const lookup = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/server/catalog/search.ts', () => ({ resolveCatalogCandidates: lookup }));
import { resolveDecklistLines } from '../../src/lib/server/mtg/catalog-resolver';

const line = (name: string, overrides: Partial<ParsedDecklistLine> = {}): ParsedDecklistLine => ({
	quantity: 1,
	name,
	normalizedName: normalizeCardName(name),
	setCode: null,
	collectorNumber: null,
	role: 'main',
	raw: `1 ${name}`,
	...overrides
});
beforeEach(() => {
	vi.clearAllMocks();
	lookup.mockResolvedValue([]);
});
describe('catalog import resolution', () => {
	it('deduplicates exact lookups while preserving roles and quantities', async () => {
		lookup.mockResolvedValue([{ id: 'printing', name: 'Opt' }]);
		const lines = [
			line('Opt', { setCode: 'sta', collectorNumber: '19' }),
			line('Opt', { setCode: 'sta', collectorNumber: '19', role: 'sideboard', quantity: 2 })
		];
		const result = await resolveDecklistLines(lines);
		expect(lookup).toHaveBeenCalledTimes(1);
		expect(lookup).toHaveBeenCalledWith(lines[0]);
		expect(result.resolved.map((result) => result.line)).toEqual(lines);
	});
	it('reports ambiguous printing matches and unresolved malformed lines', async () => {
		lookup.mockResolvedValue([{ id: 'english' }, { id: 'japanese' }]);
		const result = await resolveDecklistLines(
			[line('Opt')],
			[{ raw: 'bad', reason: 'Unrecognized', role: 'main' }]
		);
		expect(result.resolved).toEqual([]);
		expect(result.ambiguous[0].candidates).toHaveLength(2);
		expect(result.unresolved).toMatchObject([{ line: { raw: 'bad' }, reason: 'Unrecognized' }]);
	});
	it('reports no exact catalog match and propagates database failures', async () => {
		expect((await resolveDecklistLines([line('Unknown')])).unresolved[0].reason).toBe(
			'No exact catalog match'
		);
		lookup.mockRejectedValue(new Error('Database unavailable'));
		await expect(resolveDecklistLines([line('Opt')])).rejects.toThrow('Database unavailable');
	});
});
