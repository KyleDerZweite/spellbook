import { resolveCatalogCandidates } from '#lib/server/catalog/search.ts';
import { resolveDecklistLines as resolve } from '@spellbook/backend/transport.ts';
export type {
	ResolvedImportLine,
	UnresolvedImportLine,
	AmbiguousImportLine,
	CatalogResolutionResult
} from '@spellbook/backend/transport.ts';
export const resolveDecklistLines: (
	lines: Parameters<typeof resolve>[0],
	malformed?: Parameters<typeof resolve>[1],
	options?: { concurrency?: number }
) => ReturnType<typeof resolve> = (lines, malformed, options) =>
	resolve(lines, malformed, { ...options, resolveCatalogCandidates: resolveCatalogCandidates });
