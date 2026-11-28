import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import en from '../../src/lib/i18n/en.json';
import { validateDictionaries } from '../../src/lib/i18n/messages.ts';
import { localizeLegalityWarning, localizeMessage } from '../../src/lib/i18n/presentation.ts';
import {
	CARD_TYPES,
	filterOptionLabel,
	LEGALITY_FORMATS,
	MANA_COLORS,
	RARITIES
} from '../../src/lib/search/filter-options.ts';

describe('translation contract', () => {
	it('translates the shared Demo write rejection in both directions', () => {
		const english = 'The shared Demo account is read-only.';
		const german = 'Das gemeinsame Demo-Konto erlaubt nur Lesezugriff.';
		expect(localizeMessage('de', english)).toBe(german);
		expect(localizeMessage('en', german)).toBe(english);
	});
	it('translates shared Catalog options and preserves format names', () => {
		expect(filterOptionLabel(MANA_COLORS[0], 'en')).toBe('White');
		expect(filterOptionLabel(MANA_COLORS[0], 'de')).toBe('Weiß');
		expect(filterOptionLabel(RARITIES[0], 'de')).toBe('Häufig');
		expect(filterOptionLabel(CARD_TYPES[0], 'de')).toBe('Kreatur');
		expect(filterOptionLabel(LEGALITY_FORMATS[0], 'de')).toBe('Standard');
	});
	it('keeps dictionary parameters and TypeScript declarations identical', () => {
		validateDictionaries();
		const source = ts.createSourceFile(
			'parameters.ts',
			readFileSync(new URL('../../src/lib/i18n/parameters.ts', import.meta.url), 'utf8'),
			ts.ScriptTarget.Latest,
			true
		);
		const declaration = source.statements.find(ts.isInterfaceDeclaration)!;
		const actual = Object.fromEntries(
			declaration.members.map((member) => {
				const property = member as ts.PropertySignature;
				const type = property.type as ts.TypeLiteralNode;
				return [
					(property.name as ts.StringLiteral).text,
					type.members.map((field) => (field.name as ts.Identifier).text).sort()
				];
			})
		);
		const expected = Object.fromEntries(
			Object.entries(en).flatMap(([key, message]) => {
				const names = [
					...new Set([...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))
				].sort();
				return names.length ? [[key, names]] : [];
			})
		);
		expect(actual).toEqual(expected);
	});
	it('translates known failures and preserves unknown detail', () => {
		expect(localizeMessage('de', 'Invalid username or password.')).toBe(
			'Benutzername oder Passwort ungültig.'
		);
		expect(localizeMessage('de', 'Unknown field: custom')).toBe('Unknown field: custom');
		expect(localizeMessage('en', 'Email saved.')).toBe('Email saved.');
	});
	it('localizes deck legality warnings in English and German with fallback', () => {
		expect(
			localizeLegalityWarning('de', {
				code: 'commander_color_identity',
				message: "Lightning Bolt is outside the commander's color identity.",
				cardName: 'Lightning Bolt'
			})
		).toBe('Lightning Bolt liegt außerhalb der Farbidentität des Commanders.');
		expect(
			localizeLegalityWarning('de', {
				code: 'commander_ineligible',
				message: 'Grizzly Bears cannot be a commander.',
				cardName: 'Grizzly Bears'
			})
		).toBe('Grizzly Bears kann kein Commander sein.');
		expect(
			localizeLegalityWarning('de', {
				code: 'commander_invalid_pairing',
				message: 'Tymna the Weaver and Pir, Imaginative Rascal cannot be paired as commanders.'
			})
		).toBe(
			'Tymna the Weaver und Pir, Imaginative Rascal können nicht gemeinsam als Commander kombiniert werden.'
		);
		expect(
			localizeLegalityWarning('de', {
				code: 'format_illegal',
				message: 'Lightning Bolt is not_legal in Standard.',
				cardName: 'Lightning Bolt'
			})
		).toBe('Lightning Bolt ist in Standard nicht legal.');
		expect(
			localizeLegalityWarning('de', {
				code: 'format_illegal',
				message: 'Black Lotus is banned in Commander.',
				cardName: 'Black Lotus'
			})
		).toBe('Black Lotus ist in Commander gebannt.');
		expect(
			localizeLegalityWarning('en', {
				code: 'format_illegal',
				message: 'Lightning Bolt is not_legal in Standard.',
				cardName: 'Lightning Bolt'
			})
		).toBe('Lightning Bolt is not legal in Standard.');
		expect(
			localizeLegalityWarning('de', {
				code: 'unknown_future_code',
				message: 'Custom advisory message.'
			})
		).toBe('Custom advisory message.');
	});
});

// Retained action payloads may already contain a translation from the submitting request.
it('relocalizes retained validation failures in both directions without losing parameters', () => {
	for (const message of [
		'Invalid username or password.',
		'Use at most 200 characters.',
		'Use at most 8 lines.',
		'Unknown placeholder {custom}. Choose a value from Insert KPI.',
		'Close each placeholder with braces, for example {total_owned_cards}.',
		'Use up to 8 mana symbols in braces, for example {2}{U}.'
	]) {
		const german = localizeMessage('de', message);
		expect(german).not.toBe(message);
		expect(localizeMessage('en', german)).toBe(message);
		expect(localizeMessage('de', localizeMessage('en', german))).toBe(german);
	}
});
