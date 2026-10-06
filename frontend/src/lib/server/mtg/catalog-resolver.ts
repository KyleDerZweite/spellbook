import { resolveCatalogCandidates } from '#lib/server/catalog/search.ts';
import { resolveDecklistLines as resolve } from '@spellbook/backend/decks/catalog-resolver.ts';
export type {
	ResolvedImportLine,
	UnresolvedImportLine,
	AmbiguousImportLine,
	CatalogResolutionResult
} from '@spellbook/backend/decks/catalog-resolver.ts';
export const resolveDecklistLines: (
	lines: Parameters<typeof resolve>[0],
	malformed?: Parameters<typeof resolve>[1],
	options?: { concurrency?: number }
) => ReturnType<typeof resolve> = (lines, malformed, options) =>
	resolve(lines, malformed, { ...options, resolveCatalogCandidates: resolveCatalogCandidates });
