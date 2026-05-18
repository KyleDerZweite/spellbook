import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	__setCatalogResolverClient,
	resolveDecklistLines
} from '../../src/lib/server/mtg/catalog-resolver';
import { normalizeCardName, type ParsedDecklistLine } from '../../src/lib/server/mtg/decklist';

interface MockHit {
	id: string;
	name: string;
	normalized_name: string;
	set_code: string;
	collector_number: string;
}

function line(name: string, overrides: Partial<ParsedDecklistLine> = {}): ParsedDecklistLine {
	return {
		quantity: 1,
		name,
		normalizedName: normalizeCardName(name),
		setCode: null,
		collectorNumber: null,
		role: 'main',
		raw: `1 ${name}`,
		...overrides
	};
}

interface SearchCall {
	indexUid: string;
	args: Record<string, unknown>;
}

function makeMockClient(handler: (call: SearchCall) => { hits: MockHit[] }): {
	calls: SearchCall[];
	client: Parameters<typeof __setCatalogResolverClient>[0];
} {
	const calls: SearchCall[] = [];

	function makeIndex(indexUid: string) {
		return {
			search: vi.fn(async (_query: string, args: Record<string, unknown>) => {
				const call = { indexUid, args };
				calls.push(call);
				return handler(call);
			})
		};
	}

	const client = {
		index: (uid: string) => makeIndex(uid)
	} as unknown as Parameters<typeof __setCatalogResolverClient>[0];

	return { calls, client };
}

afterEach(() => {
	__setCatalogResolverClient(null);
});

describe('resolveDecklistLines', () => {
	it('resolves exact set + collector_number lookups against cards_all', async () => {
		const { calls, client } = makeMockClient(() => ({
			hits: [
				{
					id: 'a',
					name: 'Opt',
					normalized_name: 'opt',
					set_code: 'sta',
					collector_number: '47'
				}
			]
		}));
		__setCatalogResolverClient(client);

		const result = await resolveDecklistLines([
			line('Opt', { setCode: 'STA', collectorNumber: '47' })
		]);

		expect(result.resolved).toHaveLength(1);
		expect(result.resolved[0].card.id).toBe('a');
		expect(result.unresolved).toHaveLength(0);
		expect(result.ambiguous).toHaveLength(0);
		expect(calls[0].indexUid).toBe('cards_all');
		expect(calls[0].args.filter).toEqual(['set_code = "sta"', 'collector_number = "47"']);
	});

	it('resolves bare-name lookups via cards_distinct', async () => {
		const { calls, client } = makeMockClient(() => ({
			hits: [
				{
					id: 'b',
					name: 'Lightning Bolt',
					normalized_name: 'lightning bolt',
					set_code: 'lea',
					collector_number: '161'
				}
			]
		}));
		__setCatalogResolverClient(client);

		const result = await resolveDecklistLines([line('Lightning Bolt')]);
		expect(result.resolved).toHaveLength(1);
		expect(calls[0].indexUid).toBe('cards_distinct');
	});

	it('marks lookups with multiple hits as ambiguous', async () => {
		const { client } = makeMockClient(() => ({
			hits: [
				{ id: 'x', name: 'Ghost', normalized_name: 'ghost', set_code: 'a', collector_number: '1' },
				{ id: 'y', name: 'Ghost', normalized_name: 'ghost', set_code: 'b', collector_number: '2' }
			]
		}));
		__setCatalogResolverClient(client);

		const result = await resolveDecklistLines([line('Ghost')]);
		expect(result.ambiguous).toHaveLength(1);
		expect(result.resolved).toHaveLength(0);
	});

	it('reports unresolved when no exact-name match exists', async () => {
		const { client } = makeMockClient(() => ({
			hits: [
				{
					id: 'z',
					name: 'Notreally',
					normalized_name: 'notreally',
					set_code: 'a',
					collector_number: '1'
				}
			]
		}));
		__setCatalogResolverClient(client);

		const result = await resolveDecklistLines([line('Opt')]);
		expect(result.resolved).toHaveLength(0);
		expect(result.unresolved).toHaveLength(1);
		expect(result.unresolved[0].reason).toBe('No exact catalog match');
	});

	it('forwards malformed input lines to unresolved', async () => {
		const { client } = makeMockClient(() => ({ hits: [] }));
		__setCatalogResolverClient(client);

		const result = await resolveDecklistLines(
			[],
			[{ raw: 'garbage', reason: 'Unrecognized', role: 'main' }]
		);
		expect(result.unresolved).toHaveLength(1);
		expect(result.unresolved[0].line).toMatchObject({ raw: 'garbage', role: 'main' });
	});

	it('deduplicates lookups for repeated cards', async () => {
		const { calls, client } = makeMockClient(() => ({
			hits: [
				{
					id: 'p',
					name: 'Plains',
					normalized_name: 'plains',
					set_code: 'fdn',
					collector_number: '270'
				}
			]
		}));
		__setCatalogResolverClient(client);

		const repeated = Array.from({ length: 30 }, () => line('Plains'));
		const result = await resolveDecklistLines(repeated);

		expect(result.resolved).toHaveLength(30);
		expect(calls).toHaveLength(1);
	});
});
