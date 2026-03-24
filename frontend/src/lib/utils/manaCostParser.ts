/**
 * Parse a mana cost string (e.g., "{2}{U}{B}") into mana-font symbol data.
 */
export interface ManaSymbol {
	/** Original inner symbol text, e.g. "2", "U", "W/U" */
	raw: string;
	/** Mana font CSS class, e.g. "ms-2", "ms-u", "ms-wu" */
	cssClass: string;
}

/**
 * Convert a mana symbol to its mana-font CSS class.
 * Handles colors, generic mana, tap, hybrid, phyrexian, and snow.
 */
export function getManaFontClass(symbol: string): string {
	const lower = symbol.toLowerCase();

	// Hybrid / phyrexian: remove slash, lowercase (e.g. "W/U" -> "ms-wu", "W/P" -> "ms-wp")
	if (symbol.includes('/')) {
		return `ms-${lower.replace('/', '')}`;
	}

	// Generic mana (numbers 0-20)
	if (/^\d+$/.test(symbol) && parseInt(symbol) <= 20) {
		return `ms-${symbol}`;
	}

	// Named tap symbol
	if (lower === 't') return 'ms-tap';

	// All other symbols: straightforward lowercase mapping
	// Covers: w, u, b, r, g, c, x, q (untap), s (snow), e (energy), etc.
	return `ms-${lower}`;
}

/**
 * Parse a mana cost string into an array of ManaSymbol objects.
 * Returns an empty array for empty/null input.
 */
export function parseManaSymbols(manaCostStr: string): ManaSymbol[] {
	if (!manaCostStr) return [];
	const symbols: ManaSymbol[] = [];
	const regex = /\{([^}]+)\}/g;
	let match: RegExpExecArray | null;

	while ((match = regex.exec(manaCostStr)) !== null) {
		const raw = match[1];
		symbols.push({ raw, cssClass: getManaFontClass(raw) });
	}

	return symbols;
}
