import type { DeckCard } from '$lib/server/data/types';
import { assertDeckRole, type DeckRole } from './validation';

export type ParsedDecklistRole = DeckRole | 'maybeboard';

export interface ParsedDecklistLine {
	quantity: number;
	name: string;
	normalizedName: string;
	setCode: string | null;
	collectorNumber: string | null;
	role: ParsedDecklistRole;
	raw: string;
}

export interface MalformedDecklistLine {
	raw: string;
	reason: string;
	role: ParsedDecklistRole;
}

export interface ParsedDecklist {
	lines: ParsedDecklistLine[];
	malformed: MalformedDecklistLine[];
}

const SECTION_ROLES: Record<string, ParsedDecklistRole> = {
	deck: 'main',
	main: 'main',
	mainboard: 'main',
	maindeck: 'main',
	sideboard: 'sideboard',
	commander: 'commander',
	companion: 'companion',
	maybeboard: 'maybeboard'
};

export function normalizeCardName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[’']/g, '')
		.replace(/[^a-z0-9/]+/g, ' ')
		.replace(/\s*\/\s*/g, ' // ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function parseArenaDecklist(text: string): ParsedDecklist {
	const merged = new Map<string, ParsedDecklistLine>();
	const malformed: MalformedDecklistLine[] = [];
	let role: ParsedDecklistRole = 'main';

	for (const rawLine of text.split(/\r?\n/)) {
		const raw = rawLine.trim();
		if (!raw || raw.startsWith('#') || raw.startsWith('//') || raw.startsWith(';')) {
			continue;
		}

		const headerRole = SECTION_ROLES[raw.toLowerCase()];
		if (headerRole) {
			role = headerRole;
			continue;
		}

		const parsed = parseCardLine(raw, role);
		if (!parsed) {
			malformed.push({ raw, reason: 'Unrecognized card line', role });
			continue;
		}

		const key = [
			parsed.normalizedName,
			parsed.setCode?.toLowerCase() ?? '',
			parsed.collectorNumber ?? '',
			parsed.role
		].join('|');
		const existing = merged.get(key);
		if (existing) {
			existing.quantity += parsed.quantity;
			existing.raw = `${existing.raw}\n${raw}`;
		} else {
			merged.set(key, parsed);
		}
	}

	return { lines: [...merged.values()], malformed };
}

export function formatArenaDecklist(cards: DeckCard[]): string {
	const sections: Array<{ label: string; role: DeckRole }> = [
		{ label: 'Deck', role: 'main' },
		{ label: 'Sideboard', role: 'sideboard' },
		{ label: 'Commander', role: 'commander' },
		{ label: 'Companion', role: 'companion' }
	];
	const chunks: string[] = [];

	for (const section of sections) {
		const rows = cards.filter((card) => card.role === section.role);
		if (section.role !== 'main' && rows.length === 0) {
			continue;
		}
		chunks.push([section.label, ...rows.map(formatCardLine)].join('\n'));
	}

	return `${chunks.join('\n\n')}\n`;
}

function parseCardLine(raw: string, currentRole: ParsedDecklistRole): ParsedDecklistLine | null {
	let role = currentRole;
	let line = raw.replace(/^SB:\s*/i, () => {
		role = 'sideboard';
		return '';
	});

	const match = line.match(/^(\d+)\s*x?\s+(.+)$/i);
	if (!match) {
		return null;
	}

	const quantity = Number(match[1]);
	if (!Number.isInteger(quantity) || quantity <= 0) {
		return null;
	}

	line = match[2].trim();
	const printingMatch = line.match(/^(.*?)\s+\(([A-Za-z0-9]+)\)\s+([A-Za-z0-9\-★]+)$/u);
	const name = (printingMatch?.[1] ?? line).trim();
	if (!name) {
		return null;
	}

	return {
		quantity,
		name,
		normalizedName: normalizeCardName(name),
		setCode: printingMatch?.[2]?.toLowerCase() ?? null,
		collectorNumber: printingMatch?.[3] ?? null,
		role: role === 'maybeboard' ? role : assertDeckRole(role),
		raw
	};
}

function formatCardLine(card: DeckCard): string {
	const setCode = card.setCode.trim();
	const collectorNumber =
		'collectorNumber' in card ? String(card.collectorNumber ?? '').trim() : '';
	if (setCode && collectorNumber) {
		return `${card.quantity} ${card.name} (${setCode.toUpperCase()}) ${collectorNumber}`;
	}
	if (setCode) {
		return `${card.quantity} ${card.name} (${setCode.toUpperCase()})`;
	}
	return `${card.quantity} ${card.name}`;
}
