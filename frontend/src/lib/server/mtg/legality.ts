import type { CardDocument } from '$lib/search/types';
import type { ParsedDecklistRole } from './decklist';

export interface LegalityLine {
	quantity: number;
	role: ParsedDecklistRole;
	card: CardDocument;
}

export interface LegalityWarning {
	code: string;
	message: string;
	cardName?: string;
}

const CONSTRUCTED_FORMATS = new Set([
	'standard',
	'pioneer',
	'modern',
	'legacy',
	'vintage',
	'pauper'
]);
const BASIC_LANDS = new Set(['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes']);

export function generateLegalityWarnings(lines: LegalityLine[], format = ''): LegalityWarning[] {
	const warnings: LegalityWarning[] = [];
	const normalizedFormat = format.trim().toLowerCase();
	const mainCount = sumRoles(lines, ['main']);
	const sideboardCount = sumRoles(lines, ['sideboard']);

	if (CONSTRUCTED_FORMATS.has(normalizedFormat) && mainCount < 60) {
		warnings.push({
			code: 'main_under_60',
			message: 'Main deck has fewer than 60 cards.'
		});
	}
	if (sideboardCount > 15) {
		warnings.push({
			code: 'sideboard_over_15',
			message: 'Sideboard has more than 15 cards.'
		});
	}

	const copyCounts = new Map<string, { name: string; quantity: number }>();
	for (const line of lines.filter((line) => line.role === 'main' || line.role === 'sideboard')) {
		const key = line.card.oracle_id || line.card.name.toLowerCase();
		const current = copyCounts.get(key) ?? { name: line.card.name, quantity: 0 };
		current.quantity += line.quantity;
		copyCounts.set(key, current);
	}
	for (const count of copyCounts.values()) {
		if (count.quantity > 4 && !BASIC_LANDS.has(count.name.toLowerCase())) {
			warnings.push({
				code: 'too_many_copies',
				message: `${count.name} has more than 4 copies across main deck and sideboard.`,
				cardName: count.name
			});
		}
	}

	if (normalizedFormat) {
		for (const line of lines) {
			const legality = line.card.legalities?.[normalizedFormat];
			if (legality && legality !== 'legal') {
				warnings.push({
					code: 'format_illegal',
					message: `${line.card.name} is ${legality} in ${format}.`,
					cardName: line.card.name
				});
			}
		}
	}

	if (normalizedFormat === 'commander') {
		const committedTotal = sumRoles(lines, ['main', 'sideboard', 'commander', 'companion']);
		const commanderCount = sumRoles(lines, ['commander']);
		if (committedTotal !== 100) {
			warnings.push({
				code: 'commander_size',
				message: 'Commander decks should contain exactly 100 committed cards.'
			});
		}
		if (commanderCount !== 1 && commanderCount !== 2) {
			warnings.push({
				code: 'commander_count',
				message: 'Commander decks should have 1 or 2 commander cards.'
			});
		}
	}

	return warnings;
}

function sumRoles(lines: LegalityLine[], roles: ParsedDecklistRole[]): number {
	return lines
		.filter((line) => roles.includes(line.role))
		.reduce((sum, line) => sum + line.quantity, 0);
}
