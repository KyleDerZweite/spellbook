import { Meilisearch } from 'meilisearch';
import { privateEnv } from '$lib/env/private';
import type { CardDocument } from '$lib/search/types';
import type { ParsedDecklistLine, ParsedDecklistRole } from './decklist';
import { normalizeCardName } from './decklist';

export interface ResolvedImportLine {
	line: ParsedDecklistLine;
	card: CardDocument;
}

export interface UnresolvedImportLine {
	line: ParsedDecklistLine | { raw: string; role: ParsedDecklistRole };
	reason: string;
}

export interface AmbiguousImportLine {
	line: ParsedDecklistLine;
	candidates: CardDocument[];
}

export interface CatalogResolutionResult {
	resolved: ResolvedImportLine[];
	unresolved: UnresolvedImportLine[];
	ambiguous: AmbiguousImportLine[];
}

const DEFAULT_CONCURRENCY = 8;

let client: Meilisearch | null = null;

function getClient(): Meilisearch {
	if (client) {
		return client;
	}
	const host = privateEnv.MEILISEARCH_INTERNAL_URL ?? privateEnv.PUBLIC_MEILISEARCH_URL;
	const apiKey = privateEnv.MEILI_MASTER_KEY;
	if (!host || !apiKey) {
		throw new Error(
			'Catalog resolver requires MEILISEARCH_INTERNAL_URL/PUBLIC_MEILISEARCH_URL and MEILI_MASTER_KEY'
		);
	}
	client = new Meilisearch({ host, apiKey });
	return client;
}

/**
 * For testing only - inject a search client so unit tests can mock MeiliSearch
 * without touching network or env vars.
 */
export function __setCatalogResolverClient(override: Meilisearch | null): void {
	client = override;
}

function lineKey(line: ParsedDecklistLine): string {
	const set = line.setCode ? line.setCode.toLowerCase() : '';
	const cn = line.collectorNumber ?? '';
	return JSON.stringify([line.normalizedName, set, cn]);
}

export async function resolveDecklistLines(
	lines: ParsedDecklistLine[],
	malformed: Array<{ raw: string; role: ParsedDecklistRole; reason: string }> = [],
	options: { concurrency?: number } = {}
): Promise<CatalogResolutionResult> {
	const result: CatalogResolutionResult = {
		resolved: [],
		unresolved: malformed.map((line) => ({
			line: { raw: line.raw, role: line.role },
			reason: line.reason
		})),
		ambiguous: []
	};

	// Deduplicate lookups by (normalizedName, setCode, collectorNumber).
	// A 75-card deck commonly has many duplicates, especially basics.
	const uniqueByKey = new Map<string, ParsedDecklistLine>();
	for (const line of lines) {
		const key = lineKey(line);
		if (!uniqueByKey.has(key)) {
			uniqueByKey.set(key, line);
		}
	}

	const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
	const candidateByKey = new Map<string, CardDocument[]>();
	const tasks = Array.from(uniqueByKey.entries());
	let next = 0;

	async function worker(): Promise<void> {
		while (true) {
			const i = next++;
			if (i >= tasks.length) {
				return;
			}
			const [key, line] = tasks[i];
			candidateByKey.set(key, await resolveCandidates(line));
		}
	}

	await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));

	for (const line of lines) {
		const candidates = candidateByKey.get(lineKey(line)) ?? [];
		if (candidates.length === 0) {
			result.unresolved.push({ line, reason: 'No exact catalog match' });
		} else if (candidates.length > 1) {
			result.ambiguous.push({ line, candidates });
		} else {
			result.resolved.push({ line, card: candidates[0] });
		}
	}

	return result;
}

function exactNameMatch(card: CardDocument, normalizedName: string): boolean {
	return (card.normalized_name ?? normalizeCardName(card.name)) === normalizedName;
}

async function resolveCandidates(line: ParsedDecklistLine): Promise<CardDocument[]> {
	if (line.setCode && line.collectorNumber) {
		const index = getClient().index<CardDocument>('cards_all');
		const response = await index.search('', {
			filter: [
				`set_code = "${escapeFilterValue(line.setCode.toLowerCase())}"`,
				`collector_number = "${escapeFilterValue(line.collectorNumber)}"`
			],
			limit: 10
		});
		return response.hits.filter((card) => exactNameMatch(card, line.normalizedName));
	}

	const index = getClient().index<CardDocument>('cards_distinct');
	const response = await index.search('', {
		filter: [`normalized_name = "${escapeFilterValue(line.normalizedName)}"`],
		limit: 10
	});
	return response.hits.filter((card) => exactNameMatch(card, line.normalizedName));
}

function escapeFilterValue(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
