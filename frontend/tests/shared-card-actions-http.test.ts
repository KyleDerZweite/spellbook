import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { SESSION_COOKIE } from '@spellbook/backend/auth/session.ts';
import { fixtureAuthRequest } from './fixtures/http-auth.ts';
import { httpTestOrigin, startHttpApplication, stopHttpApplication } from './http-runtime.ts';
import type { Deck } from '@spellbook/contracts/decks.ts';
const url = process.env.DATABASE_URL;
if (
	!url ||
	url !== process.env.TEST_DATABASE_URL ||
	new URL(url).pathname !== '/spellbook_shared_cards_20261007'
)
	throw Error('Requires exact owned disposable Shared Card target');
const pool = new pg.Pool({ connectionString: url });
const origin = httpTestOrigin(),
	route = '/_shared-card-actions-proof';
test('built fixture route exercises shared native adapters over genuine Catalog and actual PostgreSQL, not production Search wiring', async (t) => {
	const child = await startHttpApplication(origin, new URL('../', import.meta.url));
	try {
		const register = async () => {
			const response = await fixtureAuthRequest(
				origin,
				'/api/auth/register',
				{ username: 'shared_' + randomUUID().slice(0, 8), password: 'shared-card-proof-password' },
				{}
			);
			assert.equal(response.status, 201);
			return response.json();
		};
		const owner = await register(),
			foreign = await register();
		const headers = { accept: 'text/html', cookie: `${SESSION_COOKIE}=${owner.token}`, origin };
		const create = async (token: string, name: string) => {
			const response = await fetch(origin + '/api/mobile/v1/mtg/decks', {
				method: 'POST',
				headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
				body: JSON.stringify({ name, format: 'Commander', description: '' })
			});
			assert.equal(response.status, 200);
			const decks: Deck[] = await response.json();
			const deck = decks.find((item) => item.name === name);
			assert.ok(deck);
			return deck;
		};
		const deck = await create(owner.token, 'Explicit owned target'),
			outside = await create(foreign.token, 'Foreign target');
		for (let index = 0; index < 21; index++)
			await create(owner.token, 'Paged Deck ' + String(index).padStart(2, '0'));
		const printing = (await pool.query('SELECT document FROM catalog_printings LIMIT 1')).rows[0]
			.document;
		const base = {
			deckId: deck.id,
			catalogCardId: printing.id,
			role: 'main',
			quantity: '2',
			requestId: randomUUID()
		};
		const post = (
			draft: Record<string, string>,
			extra: Record<string, string> = {},
			action = 'addToDeck',
			query = ''
		) =>
			fetch(origin + route + `?printing=${printing.id}&native=true&${query}&/${action}`, {
				method: 'POST',
				headers: { ...headers, ...extra },
				body: new URLSearchParams(draft),
				redirect: 'manual'
			});
		await t.test(
			'native GET contains explicit empty target and immutable public Printing, no automatic write',
			async () => {
				const before = (await pool.query('SELECT count(*) FROM deck_cards')).rows[0].count;
				const response = await fetch(origin + route + `?native=true&printing=${printing.id}`, {
					headers
				});
				assert.equal(response.status, 200);
				const body = await response.text();
				assert.match(body, /Choose an owned Deck/);
				assert.match(body, /Add to Deck/);
				assert.equal((await pool.query('SELECT count(*) FROM deck_cards')).rows[0].count, before);
			}
		);
		await t.test(
			'all visible roles save authoritative identities and replay exactly once',
			async () => {
				for (const role of ['main', 'sideboard', 'commander', 'companion']) {
					const draft = {
						...base,
						role,
						requestId: randomUUID(),
						name: 'forged',
						canonicalCardId: randomUUID()
					};
					for (let retry = 0; retry < 2; retry++) {
						const response = await post(draft);
						assert.equal(response.status, 200);
						assert.match(await response.text(), /Deck addition confirmed/);
					}
					const row = (
						await pool.query(
							'SELECT quantity,name,canonical_card_id FROM deck_cards WHERE deck_id=$1 AND role=$2',
							[deck.id, role]
						)
					).rows[0];
					assert.equal(row.quantity, 2);
					assert.equal(row.name, printing.name);
					assert.equal(row.canonical_card_id, printing.oracle_id);
				}
			}
		);
		await t.test(
			'foreign and stale409 retain submitted original target, role, quantity and request ID',
			async () => {
				const foreignDraft = { ...base, deckId: outside.id, role: 'sideboard', quantity: '7' };
				const response = await post(foreignDraft);
				assert.equal(response.status, 404);
				const body = await response.text();
				assert.ok(body.includes(foreignDraft.requestId));
				assert.match(body, /Retry original Deck addition/);
				const original = { ...base, requestId: randomUUID() };
				assert.equal((await post(original)).status, 200);
				const stale = await post({ ...original, quantity: '9' });
				assert.equal(stale.status, 409);
				const html = await stale.text();
				assert.ok(html.includes(original.requestId));
				assert.match(html, /value="9"/);
				assert.match(html, /Retry original Deck addition/);
			}
		);
		await t.test(
			'uncertain real commit offers original retry and matching replay does not increment again',
			async () => {
				const draft = { ...base, quantity: '5', requestId: randomUUID() };
				const before = (
					await pool.query("SELECT quantity FROM deck_cards WHERE deck_id=$1 AND role='main'", [
						deck.id
					])
				).rows[0].quantity;
				const lost = await post(draft, { 'x-shared-test-loss': 'true' });
				assert.equal(lost.status, 503);
				assert.match(await lost.text(), /Retry original Deck addition/);
				const originalSnapshot = {
					originalUncertain: 'true',
					deckRetryRequestId: draft.requestId,
					deckRetryDeckId: draft.deckId,
					deckRetryCatalogCardId: draft.catalogCardId,
					deckRetryRole: draft.role,
					deckRetryQuantity: draft.quantity
				};
				assert.equal(
					(await post({ ...draft, requestId: randomUUID(), ...originalSnapshot })).status,
					200
				);
				assert.equal(
					(
						await pool.query("SELECT quantity FROM deck_cards WHERE deck_id=$1 AND role='main'", [
							deck.id
						])
					).rows[0].quantity,
					before + 5
				);
			}
		);
		await t.test('confirmed receipt survives optional current-choice load failure', async () => {
			const response = await post(
				{ ...base, requestId: randomUUID() },
				{},
				'addToDeck',
				'readFault=true'
			);
			assert.equal(response.status, 200);
			const body = await response.text();
			assert.match(body, /Deck addition confirmed/);
			assert.match(body, /View Deck/);
			assert.match(body, /Fixture post-commit read fault/);
			assert.doesNotMatch(body, /Retry original Deck addition/);
		});
		await t.test(
			'Inventory native failed draft retains finish, condition, quantity and original request identity',
			async () => {
				const draft = {
					catalogCardId: printing.id,
					finish: 'foil',
					condition: 'LP',
					quantity: 'bad',
					requestId: randomUUID()
				};
				const response = await post(draft, {}, 'addToInventory');
				assert.equal(response.status, 400);
				const body = await response.text();
				assert.ok(body.includes(draft.requestId));
				assert.match(body, /Retry original Inventory addition/);
				assert.match(
					body,
					/Original submitted Inventory addition:[\s\S]*bad,[\s\S]*foil,[\s\S]*LP/
				);
			}
		);

		await t.test(
			'Printing read failure retains confirmed receipt and original uncertain retry independently of current Printing',
			async () => {
				const original = { ...base, requestId: randomUUID() };
				const confirmed = await post(original, {}, 'addToDeck', 'printingReadFault=true');
				assert.equal(confirmed.status, 200);
				const html = await confirmed.text();
				assert.match(html, /Deck addition confirmed/);
				assert.match(html, /View Deck/);
				assert.match(html, /Fixture post-commit Printing read fault/);
				const uncertain = await post(
					{ ...base, requestId: randomUUID() },
					{ 'x-shared-test-loss': 'true' },
					'addToDeck',
					'printingReadFault=true'
				);
				assert.equal(uncertain.status, 503);
				assert.match(await uncertain.text(), /Retry original Deck addition/);
			}
		);
		await t.test(
			'choice GET restores original payload for explicit retry without any mutation or query confirmation',
			async () => {
				const params = new URLSearchParams({
					printing: printing.id,
					native: 'true',
					deckRetryRequestId: randomUUID(),
					deckRetryCatalogCardId: printing.id,
					deckRetryDeckId: deck.id,
					deckRetryRole: 'sideboard',
					deckRetryQuantity: '7',
					success: 'true'
				});
				const before = (await pool.query('SELECT count(*) FROM deck_mutation_requests')).rows[0]
					.count;
				const response = await fetch(origin + route + '?' + params, { headers });
				assert.equal(response.status, 200);
				const html = await response.text();
				assert.match(html, /Retry original Deck addition/);
				assert.ok(html.includes(params.get('deckRetryRequestId')!));
				assert.doesNotMatch(html, /Deck addition confirmed/);
				assert.equal(
					(await pool.query('SELECT count(*) FROM deck_mutation_requests')).rows[0].count,
					before
				);
			}
		);
		await t.test('anonymous POST redirects without owned mutation', async () => {
			const response = await fetch(origin + route + '?/addToDeck', {
				method: 'POST',
				headers: { origin, accept: 'text/html' },
				body: new URLSearchParams(base),
				redirect: 'manual'
			});
			assert.equal(response.status, 303);
		});
		await writeFile(
			new URL('../../.local/design-review/browser-fixture.json', import.meta.url),
			JSON.stringify(
				{
					username: owner.user.username,
					password: 'shared-card-proof-password',
					printingId: printing.id,
					deckId: deck.id,
					token: owner.token
				},
				null,
				2
			),
			{ mode: 0o600 }
		);
	} finally {
		await stopHttpApplication(child);
		await pool.end();
	}
});
