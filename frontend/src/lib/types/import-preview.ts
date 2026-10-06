import type { CardDocument } from '@spellbook/contracts/catalog.ts';
export interface ImportLine {
	quantity: number;
	name: string;
	normalizedName: string;
	setCode: string | null;
	collectorNumber: string | null;
	role: 'main' | 'sideboard' | 'commander' | 'companion' | 'maybeboard';
	raw: string;
}
export interface ImportPreview {
	parsed: ImportLine[];
	resolved: { line: ImportLine; card: CardDocument }[];
	unresolved: { line: ImportLine | { raw: string; role: ImportLine['role'] }; reason: string }[];
	ambiguous: { line: ImportLine; candidates: CardDocument[] }[];
	warnings: { code: string; message: string; cardName?: string }[];
}
