import type { CardDocument } from '$lib/search/types';
import type { ParsedDecklistRole } from './decklist';
import { parseArenaDecklist } from './decklist';
import { resolveDecklistLines } from './catalog-resolver';
import { generateLegalityWarnings } from './legality';

export async function previewMtgImport(text: string, format = '') {
	const parsed = parseArenaDecklist(text);
	const resolution = await resolveDecklistLines(parsed.lines, parsed.malformed);
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
