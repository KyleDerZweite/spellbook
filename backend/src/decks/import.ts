import type { CatalogApplication } from '@spellbook/contracts/catalog.ts';
import type { CardDocument } from '@spellbook/contracts/catalog.ts';
import type { ParsedDecklistRole } from './decklist.ts';
import { parseArenaDecklist } from './decklist.ts';
import { resolveDecklistLines } from './catalog-resolver.ts';
import { generateLegalityWarnings } from './legality.ts';

export async function previewMtgImport(catalog: CatalogApplication, text: string, format = '') {
	const parsed = parseArenaDecklist(text);
	const resolution = await resolveDecklistLines(parsed.lines, parsed.malformed, {
		resolveCatalogCandidates: catalog.resolveCatalogCandidates
	});
	const warnings = generateLegalityWarnings(
		resolution.resolved.map(({ line, card }) => ({
			quantity: line.quantity,
			role: line.role,
			card
		})),
		format
	);

	return {
		parsed: parsed.lines,
		resolved: resolution.resolved,
		unresolved: resolution.unresolved,
		ambiguous: resolution.ambiguous,
		warnings
	};
}

export function toCardIdentity(card: CardDocument) {
	return {
		catalogCardId: card.id,
		canonicalCardId: card.oracle_id,
		name: card.name,
		setCode: card.set_code,
		imageUri: card.image_uri
	};
}

export function isCommittedDeckRole(
	role: ParsedDecklistRole
): role is 'main' | 'sideboard' | 'commander' | 'companion' {
	return role === 'main' || role === 'sideboard' || role === 'commander' || role === 'companion';
}
