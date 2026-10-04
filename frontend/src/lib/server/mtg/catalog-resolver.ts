import type { CardDocument } from '#lib/search/types.ts';
import type { ParsedDecklistLine, ParsedDecklistRole } from './decklist';
import { resolveCatalogCandidates } from '#lib/server/catalog/search.ts';

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
			candidateByKey.set(key, await resolveCatalogCandidates(line));
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
