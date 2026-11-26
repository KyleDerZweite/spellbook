import type { CardDocument } from './catalog.ts';
import type { ParsedDecklistRole } from './decklist.ts';

export interface LegalityLine {
	quantity: number;
	role: ParsedDecklistRole;
	card: CardDocument;
}

export type { LegalityWarning } from './decks.ts';
import type { LegalityWarning } from './decks.ts';

export const DECK_RULES_VERSION = 'v1' as const;

const CONSTRUCTED_FORMATS = new Set([
	'standard',
	'pioneer',
	'modern',
	'legacy',
	'vintage',
	'pauper'
]);
const BASIC_LANDS = new Set(['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes']);
const PARTNER_WITH_RE = /\bpartner with ([^\n(]+)/i;
const GENERIC_PARTNER_LINE_RE = /(?:^|\n)\s*partner(?:\s*\([^)]*\))?\s*(?:\n|$)/i;
const PARTNER_VARIANT_RE = /\bpartner(?:\s+with\b|\s*[—–-])/i;
const FRIENDS_FOREVER_RE = /\bfriends forever\b/i;
const CHOOSE_A_BACKGROUND_RE = /\bchoose a background\b/i;
const DOCTORS_COMPANION_RE = /\bdoctor['’]s companion\b/i;
const CAN_BE_COMMANDER_RE = /\bcan be your commander\b/i;

function cardKey(card: CardDocument): string {
	return card.oracle_id || card.name.toLowerCase();
}

function frontTypeLine(card: CardDocument): string {
	return card.type_line.split('//')[0] ?? '';
}

function frontName(card: CardDocument): string {
	return (card.name.split('//')[0] ?? '').trim().toLowerCase();
}

function hasType(typeLine: string, token: string): boolean {
	const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`\\b${escaped}\\b`, 'i').test(typeLine);
}

function hasKeyword(card: CardDocument, keyword: string): boolean {
	return (card.keywords ?? []).some((item) => item.trim().toLowerCase() === keyword);
}

function isLegendaryCreature(card: CardDocument): boolean {
	const front = frontTypeLine(card);
	return hasType(front, 'Legendary') && hasType(front, 'Creature');
}

function isLegendaryBackground(card: CardDocument): boolean {
	const front = frontTypeLine(card);
	return hasType(front, 'Legendary') && hasType(front, 'Background');
}

function isEligiblePrimaryCommander(card: CardDocument): boolean {
	return isLegendaryCreature(card) || CAN_BE_COMMANDER_RE.test(card.oracle_text ?? '');
}

function partnerWithTarget(card: CardDocument): string | null {
	const match = (card.oracle_text ?? '').match(PARTNER_WITH_RE);
	if (!match) return null;
	const target = match[1].replace(/^[ \t\r\n.,;]+|[ \t\r\n.,;]+$/g, '').toLowerCase();
	return target || null;
}

function hasGenericPartner(card: CardDocument): boolean {
	const oracleText = card.oracle_text ?? '';
	if (GENERIC_PARTNER_LINE_RE.test(oracleText)) return true;
	return hasKeyword(card, 'partner') && !PARTNER_VARIANT_RE.test(oracleText);
}

function hasFriendsForever(card: CardDocument): boolean {
	return hasKeyword(card, 'friends forever') || FRIENDS_FOREVER_RE.test(card.oracle_text ?? '');
}

function hasChooseABackground(card: CardDocument): boolean {
	return (
		hasKeyword(card, 'choose a background') || CHOOSE_A_BACKGROUND_RE.test(card.oracle_text ?? '')
	);
}

function hasDoctorsCompanion(card: CardDocument): boolean {
	return (
		hasKeyword(card, "doctor's companion") ||
		hasKeyword(card, 'doctor’s companion') ||
		DOCTORS_COMPANION_RE.test(card.oracle_text ?? '')
	);
}

function isTimeLordDoctor(card: CardDocument): boolean {
	const front = frontTypeLine(card);
	return isLegendaryCreature(card) && hasType(front, 'Time Lord') && hasType(front, 'Doctor');
}

function isBackgroundPair(first: CardDocument, second: CardDocument): boolean {
	return (
		(hasChooseABackground(first) && isLegendaryBackground(second)) ||
		(hasChooseABackground(second) && isLegendaryBackground(first))
	);
}

function isValidCommanderPair(first: CardDocument, second: CardDocument): boolean {
	if (cardKey(first) === cardKey(second)) return false;
	if (hasGenericPartner(first) && hasGenericPartner(second)) return true;
	const targetFirst = partnerWithTarget(first);
	const targetSecond = partnerWithTarget(second);
	if (
		targetFirst &&
		targetSecond &&
		(targetFirst === second.name.trim().toLowerCase() || targetFirst === frontName(second)) &&
		(targetSecond === first.name.trim().toLowerCase() || targetSecond === frontName(first))
	) {
		return true;
	}
	if (hasFriendsForever(first) && hasFriendsForever(second)) return true;
	if (isBackgroundPair(first, second)) return true;
	return (
		(hasDoctorsCompanion(first) && isTimeLordDoctor(second)) ||
		(hasDoctorsCompanion(second) && isTimeLordDoctor(first))
	);
}

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
	if (
		CONSTRUCTED_FORMATS.has(normalizedFormat) &&
		sideboardCount + sumRoles(lines, ['companion']) > 15
	) {
		warnings.push({
			code: 'sideboard_over_15',
			message: 'Sideboard has more than 15 cards.'
		});
	}

	const copyCounts = new Map<string, { card: CardDocument; quantity: number }>();
	const includedRoles =
		normalizedFormat === 'commander' ? ['main', 'commander'] : ['main', 'sideboard', 'companion'];
	for (const line of lines.filter((line) => includedRoles.includes(line.role))) {
		const key = cardKey(line.card);
		const current = copyCounts.get(key) ?? { card: line.card, quantity: 0 };
		current.quantity += line.quantity;
		copyCounts.set(key, current);
	}
	for (const { card, quantity } of copyCounts.values()) {
		const legality = card.legalities?.[normalizedFormat];
		const basic = card.type_line.includes('Basic') || BASIC_LANDS.has(card.name.toLowerCase());
		const unlimited = /deck can have any number of cards named/i.test(card.oracle_text);
		const copyLimit = legality === 'restricted' || normalizedFormat === 'commander' ? 1 : 4;
		const numberedException = card.oracle_text.match(
			/deck can have up to (seven|nine) cards named/i
		);
		const limit = numberedException
			? numberedException[1].toLowerCase() === 'seven'
				? 7
				: 9
			: copyLimit;
		if (
			(CONSTRUCTED_FORMATS.has(normalizedFormat) || normalizedFormat === 'commander') &&
			!basic &&
			!unlimited &&
			quantity > limit
		) {
			warnings.push({
				code:
					legality === 'restricted'
						? 'restricted_copies'
						: normalizedFormat === 'commander'
							? 'commander_singleton'
							: 'too_many_copies',
				message: `${card.name} exceeds the ${limit}-copy limit in ${format}.`,
				cardName: card.name
			});
		}
	}
	const checkedCards = new Set<string>();
	for (const { card, role } of lines) {
		const key = cardKey(card);
		if (role === 'maybeboard' || checkedCards.has(key)) continue;
		checkedCards.add(key);
		const legality = card.legalities?.[normalizedFormat];
		if (normalizedFormat && legality && legality !== 'legal' && legality !== 'restricted') {
			warnings.push({
				code: 'format_illegal',
				message: `${card.name} is ${legality} in ${format}.`,
				cardName: card.name
			});
		}
	}

	if (normalizedFormat === 'commander') {
		const committedTotal = sumRoles(lines, ['main', 'commander']);
		const commanderEntries = lines.filter((line) => line.role === 'commander' && line.quantity > 0);
		const commanderCount = commanderEntries.reduce((sum, line) => sum + line.quantity, 0);
		if (committedTotal !== 100) {
			warnings.push({
				code: 'commander_size',
				message: 'Commander main deck and commanders should contain exactly 100 cards.'
			});
		}
		if (commanderCount !== 1 && commanderCount !== 2) {
			warnings.push({
				code: 'commander_count',
				message: 'Commander decks should have 1 or 2 commander cards.'
			});
		}
		const commanderPair: [CardDocument, CardDocument] | null =
			commanderCount === 2
				? commanderEntries.length === 1
					? [commanderEntries[0].card, commanderEntries[0].card]
					: [commanderEntries[0].card, commanderEntries[1].card]
				: null;
		const validBackgroundPair =
			commanderPair !== null && isBackgroundPair(commanderPair[0], commanderPair[1]);
		const checkedCommanders = new Set<string>();
		for (const { card: commander } of commanderEntries) {
			const key = cardKey(commander);
			if (checkedCommanders.has(key)) continue;
			checkedCommanders.add(key);
			if (!(
				isEligiblePrimaryCommander(commander) ||
				(validBackgroundPair && isLegendaryBackground(commander))
			)) {
				warnings.push({
					code: 'commander_ineligible',
					message: `${commander.name} cannot be a commander.`,
					cardName: commander.name
				});
			}
		}
		if (commanderPair !== null && !isValidCommanderPair(commanderPair[0], commanderPair[1])) {
			warnings.push({
				code: 'commander_invalid_pairing',
				message: `${commanderPair[0].name} and ${commanderPair[1].name} cannot be paired as commanders.`
			});
		}
		if (commanderEntries.length > 0) {
			const allowedIdentity = new Set(
				commanderEntries.flatMap(({ card: commander }) =>
					(commander.color_identity ?? []).filter(Boolean).map((color) => color.toUpperCase())
				)
			);
			const checkedIdentity = new Set<string>();
			for (const { card, role } of lines) {
				if (role === 'maybeboard' || role === 'commander') continue;
				const key = cardKey(card);
				if (checkedIdentity.has(key)) continue;
				checkedIdentity.add(key);
				const cardIdentity = (card.color_identity ?? [])
					.filter(Boolean)
					.map((color) => color.toUpperCase());
				if (cardIdentity.some((color) => !allowedIdentity.has(color))) {
					warnings.push({
						code: 'commander_color_identity',
						message: `${card.name} is outside the commander's color identity.`,
						cardName: card.name
					});
				}
			}
		}
	}

	return warnings;
}

function sumRoles(lines: LegalityLine[], roles: ParsedDecklistRole[]): number {
	return lines
		.filter((line) => roles.includes(line.role))
		.reduce((sum, line) => sum + line.quantity, 0);
}
