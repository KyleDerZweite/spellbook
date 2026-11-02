import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from 'svelte/server';
import { deckImportText, readDeckImportForm } from '../../src/lib/server/mtg/deck-import.ts';
import { RemoteUnavailableError } from '#lib/server/remote/errors.ts';
import { ValidationError } from '@spellbook/contracts/validation.ts';
import { parseArenaDecklist } from '@spellbook/contracts/decklist.ts';
import PrintPage from '../../src/routes/mtg/decks/[deckId]/print/+page.svelte';

const mocks = vi.hoisted(() => ({
	preview: vi.fn(),
	commit: vi.fn(),
	getDeck: vi.fn(),
	export: vi.fn()
}));
vi.mock('#lib/server/composition.ts', () => ({
	application: {
		decks: {
			previewMtgImport: mocks.preview,
			importTextDeck: mocks.commit,
			getDeck: mocks.getDeck
		}
	}
}));
vi.mock('#lib/server/mtg/deck-builder.ts', () => ({ exportDecklist: mocks.export }));
import { actions, load } from '../../src/routes/mtg/decks/import/+page.server.ts';
import { GET } from '../../src/routes/mtg/decks/[deckId]/export/+server.ts';
import { load as printLoad } from '../../src/routes/mtg/decks/[deckId]/print/+page.server.ts';

function event(fields: Record<string, string> = {}, user: object | null = { accountId: 'owner' }) {
	return {
		locals: { user },
		setHeaders: vi.fn(),
		request: new Request('http://localhost/mtg/decks/import', {
			method: 'POST',
			body: new URLSearchParams(fields)
		})
	} as unknown as Parameters<typeof actions.default>[0];
}

beforeEach(() => vi.resetAllMocks());

describe('bounded file import', () => {
	it('reads native multipart UTF-8 uploads, including a BOM', async () => {
		const form = new FormData();
		form.set('file', new File(['\ufeffAbout\nName Test\n\nDeck\n1 Opt'], 'deck.txt'));
		const request = new Request('http://localhost', { method: 'POST', body: form });
		expect(await deckImportText(await readDeckImportForm(request))).toContain('Name Test');
	});
	it('rejects oversized forms before decoding multipart', async () => {
		const request = new Request('http://localhost', {
			method: 'POST',
			body: 'x'.repeat(1_048_577)
		});
		await expect(readDeckImportForm(request)).rejects.toThrow('exceeds 1 MiB');
	});
	it.each(['size', 'encoding', 'characters', 'both'])('rejects %s violations', async (failure) => {
		const form = new FormData();
		if (failure === 'size') form.set('file', new File(['x'.repeat(400_001)], 'deck.txt'));
		if (failure === 'encoding') form.set('file', new File([new Uint8Array([255])], 'deck.txt'));
		if (failure === 'characters') form.set('text', 'x'.repeat(100_001));
		if (failure === 'both') {
			form.set('text', '1 Opt');
			form.set('file', new File(['1 Opt'], 'deck.txt'));
		}
		await expect(deckImportText(form)).rejects.toBeInstanceOf(ValidationError);
	});
	it('supports the official Arena About and Name header before all roles', () => {
		const result = parseArenaDecklist(
			'About\nName Test\n\nCommander\n1 Card\nDeck\n2 Opt\nSideboard\n1 Card\nCompanion\n1 Card'
		);
		expect(result.malformed).toEqual([]);
		expect(result.lines.map((line) => line.role)).toEqual([
			'commander',
			'main',
			'sideboard',
			'companion'
		]);
	});
});

describe('new Deck import actions', () => {
	it('renders the native POST preview without setting a response header twice', async () => {
		mocks.preview.mockResolvedValue({
			resolved: [],
			unresolved: [],
			ambiguous: [],
			warnings: [],
			metadata: null
		});
		const names = new Set<string>();
		const request = {
			...event({ text: 'Deck\n1 Opt', intent: 'preview' }),
			setHeaders: (headers: Record<string, string>) => {
				for (const name of Object.keys(headers)) {
					if (names.has(name)) throw new Error('header_already_set');
					names.add(name);
				}
			}
		};
		await actions.default(request);
		await load(request as Parameters<typeof load>[0]);
		expect(names.has('cache-control')).toBe(true);
	});
	it('requires authentication before parsing or committing', async () => {
		await expect(actions.default(event({}, null))).rejects.toMatchObject({ status: 303 });
		await expect(load(event({}, null) as Parameters<typeof load>[0])).rejects.toMatchObject({
			status: 303
		});
		expect(mocks.preview).not.toHaveBeenCalled();
		expect(mocks.commit).not.toHaveBeenCalled();
	});
	it('previews without writing and preserves text for explicit commit', async () => {
		mocks.preview.mockResolvedValue({
			resolved: [],
			unresolved: [],
			ambiguous: [],
			warnings: [],
			metadata: null
		});
		const result = await actions.default(
			event({ text: 'Deck\n1 Opt', name: 'Test', intent: 'preview', requestId: 'initial' })
		);
		expect(result).toMatchObject({ text: 'Deck\n1 Opt', name: 'Test', preview: { resolved: [] } });
		expect(mocks.commit).not.toHaveBeenCalled();
	});
	it('creates only on explicit commit and navigates to the acknowledged Deck', async () => {
		mocks.commit.mockResolvedValue({ deckId: 'created' });
		await expect(
			actions.default(
				event({ text: 'Deck\n1 Opt', name: 'Test', intent: 'commit', requestId: 'retained' })
			)
		).rejects.toMatchObject({ status: 303, location: '/mtg/decks?deck=created' });
		expect(mocks.commit).toHaveBeenCalledWith(
			expect.objectContaining({ accountId: 'owner' }),
			expect.objectContaining({ text: 'Deck\n1 Opt', requestId: 'retained', source: 'import' })
		);
	});
	it('retains the exact commit intent for a lost-response retry', async () => {
		mocks.commit.mockRejectedValue(new RemoteUnavailableError());
		const result = await actions.default(
			event({ text: 'Deck\n1 Opt', name: 'Test', intent: 'commit', requestId: 'lost-response' })
		);
		expect(result).toMatchObject({
			status: 503,
			data: { text: 'Deck\n1 Opt', name: 'Test', requestId: 'lost-response', retryCommit: true }
		});
	});
	it('retains malformed content and the request ID after a rejected commit', async () => {
		mocks.commit.mockRejectedValue(new ValidationError('Unsupported version'));
		const result = await actions.default(
			event({ text: '{"version":2}', intent: 'commit', requestId: 'retry' })
		);
		expect(result).toMatchObject({
			status: 400,
			data: { text: '{"version":2}', requestId: 'retry', message: 'Unsupported version' }
		});
	});
});

describe('authenticated downloads and print', () => {
	it.each(['arena', 'simple', 'csv', 'json'])(
		'downloads %s with a safe filename and private response',
		async (format) => {
			mocks.getDeck.mockResolvedValue({ decks: [{ id: 'owned', name: 'A/"Deck\r\n' }] });
			mocks.export.mockResolvedValue('export');
			const response = await GET({
				locals: { user: { accountId: 'owner' } },
				params: { deckId: 'owned' },
				url: new URL(`http://localhost/mtg/decks/owned/export?format=${format}`)
			} as Parameters<typeof GET>[0]);
			expect(response.headers.get('cache-control')).toBe('no-store');
			expect(response.headers.get('content-disposition')).toContain(
				`.${format === 'json' || format === 'csv' ? format : 'txt'}"`
			);
			expect(mocks.export).toHaveBeenCalledWith(expect.anything(), 'owned', format);
		}
	);
	it('requires auth and maps missing owned Decks in the print route', async () => {
		await expect(
			printLoad({ locals: { user: null } } as Parameters<typeof printLoad>[0])
		).rejects.toMatchObject({ status: 303 });
		mocks.getDeck.mockResolvedValue({ decks: [] });
		await expect(
			printLoad({
				locals: { user: { accountId: 'owner' } },
				params: { deckId: 'foreign' },
				setHeaders: vi.fn()
			} as unknown as Parameters<typeof printLoad>[0])
		).rejects.toMatchObject({ status: 404 });
	});
	it('renders actual roles and clearly separates derived Token references', () => {
		const { body } = render(PrintPage, {
			props: {
				params: { deckId: 'owned' },
				form: null,
				data: {
					deck: {
						id: 'owned',
						name: 'Long <Deck>',
						format: 'Commander',
						description: 'Notes\nSecond line'
					},
					cards: ['main', 'commander', 'sideboard', 'companion'].map((role, index) => ({
						name: `Long <Card> ${role}`,
						quantity: index + 1,
						role,
						setCode: 'tst',
						catalogCardId: `printing-${index}`
					})),
					relatedTokens: {
						status: 'partial',
						items: [{ name: 'Soldier', setCode: 'tst', collectorNumber: '1' }],
						unresolved: [{ name: 'Unknown', catalogCardId: 'unknown' }],
						unavailableEntryIds: []
					}
				} as never
			}
		});
		expect(body).toContain('Long &lt;Deck>');
		for (const role of ['main', 'commander', 'sideboard', 'companion'])
			expect(body).toContain(`Long &lt;Card> ${role}`);
		expect(body).toContain('Supplemental related Tokens');
		expect(body).toContain('not Deck entries or quantity requirements');
		expect(body).toContain('unavailable Printing unknown');
	});
});
