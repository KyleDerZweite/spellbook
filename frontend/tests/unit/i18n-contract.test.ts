import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import en from '../../src/lib/i18n/en.json';
import { validateDictionaries } from '../../src/lib/i18n/messages.ts';
import { localizeMessage } from '../../src/lib/i18n/presentation.ts';

describe('translation contract', () => {
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
