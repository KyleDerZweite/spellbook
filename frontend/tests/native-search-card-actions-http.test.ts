import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { SESSION_COOKIE } from '@spellbook/backend/auth/session.ts';
import { fixtureAuthRequest } from './fixtures/http-auth.ts';
import { httpTestOrigin, startHttpApplication, stopHttpApplication } from './http-runtime.ts';
import type { Deck } from '@spellbook/contracts/decks.ts';

const databaseUrl = process.env.DATABASE_URL;
if (
	!databaseUrl ||
	databaseUrl !== process.env.TEST_DATABASE_URL ||
	new URL(databaseUrl).pathname !== '/spellbook_native_search_cards_20261007'
)
	throw Error('Requires exact owned native Search disposable database');
const pool = new pg.Pool({ connectionString: databaseUrl }),
	origin = httpTestOrigin();
function decode(value: string) {
	return value
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#x27;/g, "'");
}
function attr(tag: string, name: string) {
	return decode(new RegExp('\\b' + name + '="([^"]*)"').exec(tag)?.[1] ?? '');
}
function forms(html: string) {
	return [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)].map((m) => ({
		action: attr(m[1], 'action'),
		method: attr(m[1], 'method'),
		html: m[2]
	}));
}
function inputs(form: { html: string }) {
	const p = new URLSearchParams();
	for (const m of form.html.matchAll(/<input\b[^>]*>/g)) {
		const name = attr(m[0], 'name');
		if (name) p.append(name, attr(m[0], 'value'));
	}
	return p;
}
function nativeForm(html: string, action: string) {
	const f = forms(html).find(
		(f) =>
			f.method === 'POST' &&
			new URL(f.action, origin).searchParams.has('/' + action) &&
			!f.html.includes('Retry original')
	);
	assert.ok(f, 'Native named action form exists');
	return f;
}
function selected(html: string) {
	const select = /<select\b[^>]*name="deckId"[^>]*>([\s\S]*?)<\/select>/.exec(html);
	assert.ok(select);
	const option = /<option\b([^>]*\bselected\b[^>]*)>/.exec(select[1]);
	assert.ok(option);
	return attr(option[1], 'value');
}
function assertNativePanelFirst(html: string) {
	const panel = /<section\b[^>]*aria-label="Selected card"/.exec(html);
	const results = /<div\b[^>]*class="[^"]*\bsearch-content\b/.exec(html);
	assert.ok(panel);
	assert.ok(results);
	assert.ok(panel.index < results.index, 'Native selection/receipt precedes the result grid');
}
const accounts: string[] = [];
test('production native Search HTML forms preserve explicit targets, receipt and original replay', async (t) => {
	assert.equal(
		(await pool.query('select current_database() as name')).rows[0].name,
		'spellbook_native_search_cards_20261007'
	);
	const child = await startHttpApplication(origin, new URL('../', import.meta.url));
	let fault = false;
	try {
		const register = async () => {
			const r = await fixtureAuthRequest(
				origin,
				'/api/auth/register',
				{
					username: 'native_' + randomUUID().slice(0, 8),
					password: 'native-search-fixture-password'
				},
				{}
			);
			assert.equal(r.status, 201);
			const session = await r.json();
			accounts.push(session.user.accountId);
			return session;
		};
		const owner = await register(),
			foreign = await register();
		const headers = { accept: 'text/html', cookie: SESSION_COOKIE + '=' + owner.token, origin };
		const create = async (token: string, name: string) => {
			const r = await fetch(origin + '/api/mobile/v1/mtg/decks', {
				method: 'POST',
				headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
				body: JSON.stringify({ name, format: 'Modern', description: '' })
			});
			assert.equal(r.status, 200);
			const decks: Deck[] = await r.json();
			const deck = decks.find((d) => d.name === name);
			assert.ok(deck);
			return deck;
		};
		const decks: Deck[] = [];
		for (let n = 0; n < 25; n++)
			decks.push(await create(owner.token, 'Deck' + String(n).padStart(2, '0')));
		const outside = await create(foreign.token, 'Foreign');
		const printing = (
			await pool.query('select document from catalog_printings order by id limit 1')
		).rows[0].document;
		const context = new URLSearchParams({ printing: printing.id, pageSize: '100', page: '1' });
		const get = async (params: URLSearchParams = context) => {
			const r = await fetch(origin + '/mtg/search?' + params, { headers, redirect: 'manual' });
			return { response: r, html: await r.text() };
		};
		const submit = (action: string, payload: URLSearchParams) =>
			fetch(new URL(action, origin), {
				method: 'POST',
				headers,
				body: payload,
				redirect: 'manual'
			});
		const restore = async () => {
			if (fault) {
				await pool.query('ALTER COLLATION native_search_fault RENAME TO inventory_root');
				fault = false;
			}
			await pool.query('DROP TRIGGER IF EXISTS native_search_read_fault ON deck_mutation_requests');
			await pool.query('DROP FUNCTION IF EXISTS native_search_read_fault()');
		};
		await t.test(
			'native empty target and explicit owned selection beyond the first20 survive choice navigation',
			async () => {
				const initial = await get();
				assert.equal(initial.response.status, 200);
				assertNativePanelFirst(initial.html);
				assert.equal(selected(initial.html), '');
				assert.ok(initial.html.includes('Sol Ring'));
				assert.ok(!initial.html.includes('Retry original Deck addition'));
				const params = new URLSearchParams(context);
				params.set('selectedDeckId', decks[24].id);
				params.set('deckQuery', 'Deck00');
				const page = await get(params);
				assert.equal(page.response.status, 200);
				assert.equal(selected(page.html), decks[24].id);
				const choice = forms(page.html).find(
					(f) => f.method === 'GET' && f.html.includes('Find Decks')
				);
				assert.ok(choice);
				const fields = inputs(choice);
				assert.equal(fields.get('selectedDeckId'), decks[24].id);
				assert.equal(fields.get('printing'), printing.id);
				fields.set('deckQuery', 'Deck');
				fields.set('deckOffset', '20');
				const next = await get(fields);
				assert.equal(next.response.status, 200);
				assert.equal(selected(next.html), decks[24].id);
				assert.ok(!next.html.includes('Retry original Deck addition'));
			}
		);
		await t.test(
			'native canonical clamp preserves repeated filters and validated choice/retry context',
			async () => {
				const params = new URLSearchParams(context);
				for (const [key, values] of Object.entries({
					color: ['W', 'U'],
					rarity: ['uncommon', 'rare'],
					type: ['Artifact', 'Creature'],
					legal: ['modern', 'commander']
				}))
					for (const value of values) params.append(key, value);
				params.set('page', '999');
				params.set('selectedDeckId', decks[24].id);
				params.set('deckQuery', '%_\\');
				params.set('deckOffset', '20');
				for (const [key, value] of Object.entries({
					requestId: randomUUID(),
					catalogCardId: printing.id,
					deckId: decks[24].id,
					role: 'main',
					quantity: '1'
				}))
					params.set('deckRetry' + key[0].toUpperCase() + key.slice(1), value);
				const page = await get(params);
				assert.equal(page.response.status, 303);
				const location = new URL(page.response.headers.get('location')!, origin);
				for (const key of ['color', 'rarity', 'type', 'legal'])
					assert.deepEqual(location.searchParams.getAll(key).sort(), params.getAll(key).sort());
				for (const key of [
					'printing',
					'selectedDeckId',
					'deckQuery',
					'deckOffset',
					'deckRetryRequestId',
					'deckRetryQuantity'
				])
					assert.equal(location.searchParams.get(key), params.get(key));
				assert.equal(location.searchParams.get('page'), '1');
				const html = (await get(location.searchParams)).html;
				const form = nativeForm(html, 'addToDeck');
				const action = new URL(form.action, origin);
				for (const key of ['color', 'rarity', 'type', 'legal'])
					assert.deepEqual(action.searchParams.getAll(key).sort(), params.getAll(key).sort());
			}
		);
		await t.test(
			'malformed and repeated GET controls render inline errors and never cause raw500',
			async () => {
				for (const suffix of [
					'deckQuery=a&deckQuery=b',
					'deckOffset=1e3',
					'selectedDeckId=bad',
					'deckRetryRequestId=partial',
					'printing=' + printing.id
				]) {
					const params = new URLSearchParams(context);
					for (const [key, value] of new URLSearchParams(suffix)) params.append(key, value);
					const page = await get(params);
					assert.equal(page.response.status, 200);
					assert.match(
						page.html,
						/Invalid (Deck choices|retained addition draft|printing selection)/
					);
				}
			}
		);
		await t.test(
			'malformed standalone context remains visible even on a stale native page',
			async () => {
				for (const suffix of ['deckRetryRequestId=partial', 'deckQuery=a&deckQuery=b']) {
					const page = await get(new URLSearchParams('page=999&pageSize=100&' + suffix));
					assert.equal(page.response.status, 200);
					assert.match(page.html, /Invalid (retained addition draft|Deck choices)/);
				}
			}
		);
		await t.test(
			'foreign and deleted selected Decks are empty and foreign POST is controlled',
			async () => {
				const params = new URLSearchParams(context);
				params.set('selectedDeckId', outside.id);
				let page = await get(params);
				assert.equal(selected(page.html), '');
				const form = nativeForm(page.html, 'addToDeck'),
					payload = inputs(form);
				payload.set('deckId', outside.id);
				payload.set('role', 'main');
				payload.set('quantity', '1');
				const r = await submit(form.action, payload);
				assert.equal(r.status, 404);
				assert.match(await r.text(), /no longer available/);
				const deleted = await create(owner.token, 'Deleted choice');
				await pool.query('delete from decks where id=$1', [deleted.id]);
				params.set('selectedDeckId', deleted.id);
				page = await get(params);
				assert.equal(selected(page.html), '');
			}
		);
		await t.test(
			'actual optional choice SQL fault is mapped by the production loader',
			async () => {
				await pool.query('ALTER COLLATION inventory_root RENAME TO native_search_fault');
				fault = true;
				try {
					const page = await get();
					assert.equal(page.response.status, 200);
					assert.match(page.html, /Deck choices are unavailable/);
					assert.match(page.html, /disabled[^>]*>Add to Deck/);
				} finally {
					await restore();
				}
			}
		);
		await t.test(
			'real commit receipt survives post-action choice read failure and stale-page clamp',
			async () => {
				const page = await get();
				const form = nativeForm(page.html, 'addToDeck'),
					payload = inputs(form);
				payload.set('deckId', decks[0].id);
				payload.set('role', 'sideboard');
				payload.set('quantity', '1');
				await pool.query(
					'CREATE FUNCTION native_search_read_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ALTER COLLATION inventory_root RENAME TO native_search_fault; RETURN NEW; END $$'
				);
				await pool.query(
					'CREATE TRIGGER native_search_read_fault AFTER INSERT ON deck_mutation_requests FOR EACH ROW EXECUTE FUNCTION native_search_read_fault()'
				);
				try {
					const action = new URL(form.action, origin);
					action.searchParams.set('page', '999');
					const r = await submit(action.pathname + action.search, payload);
					fault = !!(
						await pool.query("select 1 from pg_collation where collname='native_search_fault'")
					).rowCount;
					assert.equal(r.status, 200);
					const html = await r.text();
					assert.match(html, /Deck addition confirmed/);
					assertNativePanelFirst(html);
					assert.match(html, /Deck choices are unavailable/);
					assert.equal(r.headers.get('location'), null);
					assert.equal(
						(
							await pool.query(
								'select count(*)::int as n from deck_mutation_requests where account_id=$1 and request_id=$2',
								[owner.user.accountId, payload.get('requestId')]
							)
						).rows[0].n,
						1
					);
				} finally {
					await restore();
				}
			}
		);
		await t.test(
			'confirmed receipt and immutable retry remain visible when current Printing cannot load',
			async () => {
				const page = await get();
				const form = nativeForm(page.html, 'addToDeck'),
					payload = inputs(form);
				payload.set('deckId', decks[1].id);
				payload.set('role', 'main');
				payload.set('quantity', '1');
				const action = new URL(form.action, origin);
				action.searchParams.set('printing', randomUUID());
				const r = await submit(action.pathname + action.search, payload);
				assert.equal(r.status, 200);
				const html = await r.text();
				assert.match(html, /Deck addition confirmed/);
				assertNativePanelFirst(html);
				assert.match(html, /printing is unavailable/);
				const retained = new URLSearchParams({
					printing: randomUUID(),
					pageSize: '100',
					page: '1'
				});
				for (const [key, value] of payload)
					retained.set('deckRetry' + key[0].toUpperCase() + key.slice(1), value);
				const retryPage = await get(retained);
				assert.equal(retryPage.response.status, 200);
				const retry = forms(retryPage.html).find((f) =>
					f.html.includes('Retry original Deck addition')
				);
				assert.ok(retry);
				assert.equal(inputs(retry).get('requestId'), payload.get('requestId'));
				const replay = await submit(retry.action, inputs(retry));
				assert.equal(replay.status, 200);
				assert.match(await replay.text(), /Deck addition confirmed/);
				assert.equal(
					(
						await pool.query('select quantity from deck_cards where deck_id=$1 and role=$2', [
							decks[1].id,
							'main'
						])
					).rows[0].quantity,
					1
				);
			}
		);
		await t.test(
			'discarded real POST response followed by parsed native original retry has quantity1 and one receipt',
			async () => {
				const page = await get();
				const form = nativeForm(page.html, 'addToDeck'),
					payload = inputs(form);
				payload.set('deckId', decks[2].id);
				payload.set('role', 'main');
				payload.set('quantity', '1');
				const response = await submit(form.action, payload);
				assert.equal(response.status, 200);
				await response.body?.cancel();
				const retained = new URLSearchParams(context);
				for (const [key, value] of payload)
					retained.set('deckRetry' + key[0].toUpperCase() + key.slice(1), value);
				const retryPage = await get(retained);
				const retry = forms(retryPage.html).find((f) =>
					f.html.includes('Retry original Deck addition')
				);
				assert.ok(retry);
				const original = inputs(retry);
				assert.equal(original.get('requestId'), payload.get('requestId'));
				const r = await submit(retry.action, original);
				assert.equal(r.status, 200);
				assert.match(await r.text(), /Deck addition confirmed/);
				assert.equal(
					(await pool.query('select quantity from deck_cards where deck_id=$1', [decks[2].id]))
						.rows[0].quantity,
					1
				);
				assert.equal(
					(
						await pool.query(
							'select count(*)::int as n from deck_mutation_requests where account_id=$1 and request_id=$2',
							[owner.user.accountId, original.get('requestId')]
						)
					).rows[0].n,
					1
				);
			}
		);
		await t.test(
			'changed retained intent uses the fresh loader ID while original replay stays immutable',
			async () => {
				const page = await get();
				const form = nativeForm(page.html, 'addToDeck'),
					original = inputs(form);
				original.set('deckId', decks[3].id);
				original.set('role', 'main');
				original.set('quantity', '1');
				const first = await submit(form.action, original);
				assert.equal(first.status, 200);
				await first.body?.cancel();
				const retained = new URLSearchParams(context);
				for (const [key, value] of original)
					retained.set('deckRetry' + key[0].toUpperCase() + key.slice(1), value);
				const retryPage = await get(retained);
				const current = nativeForm(retryPage.html, 'addToDeck'),
					changed = inputs(current);
				assert.notEqual(changed.get('requestId'), original.get('requestId'));
				assert.equal(changed.get('deckRetryRequestId'), original.get('requestId'));
				changed.set('deckId', decks[3].id);
				changed.set('role', 'main');
				changed.set('quantity', '2');
				const result = await submit(current.action, changed);
				assert.equal(result.status, 200);
				assert.match(await result.text(), /Deck addition confirmed/);
				const retry = forms(retryPage.html).find((f) =>
					f.html.includes('Retry original Deck addition')
				);
				assert.ok(retry);
				const replay = await submit(retry.action, inputs(retry));
				assert.equal(replay.status, 200);
				await replay.body?.cancel();
				assert.equal(
					(await pool.query('select quantity from deck_cards where deck_id=$1', [decks[3].id]))
						.rows[0].quantity,
					3
				);
				assert.equal(
					(
						await pool.query(
							'select count(*)::int as n from deck_mutation_requests where account_id=$1 and request_id=ANY($2::text[])',
							[owner.user.accountId, [original.get('requestId'), changed.get('requestId')]]
						)
					).rows[0].n,
					2
				);
			}
		);
		await t.test(
			'anonymous native panel exposes no owned choices and sanitizes Sign-in ReturnTo',
			async () => {
				const params = new URLSearchParams(context);
				params.set('selectedDeckId', decks[0].id);
				params.set('deckQuery', 'private');
				const r = await fetch(origin + '/mtg/search?' + params, {
					headers: { accept: 'text/html' },
					redirect: 'manual'
				});
				assert.equal(r.status, 200);
				const html = await r.text();
				assert.ok(!html.includes('name="deckId"'));
				const link = [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>[\s\S]*?<\/a>/g)].find((m) =>
					m[0].includes('Sign in to add cards')
				);
				assert.ok(link);
				const href = new URL(decode(link[1]), origin),
					target = new URL(href.searchParams.get('returnTo')!, origin);
				assert.equal(target.searchParams.get('printing'), printing.id);
				assert.equal(target.searchParams.has('selectedDeckId'), false);
				assert.equal(target.searchParams.has('deckQuery'), false);
				const malformed = await fetch(origin + '/mtg/search?printing=bad&deckOffset=1e3', {
					headers: { accept: 'text/html' },
					redirect: 'manual'
				});
				assert.equal(malformed.status, 200);
				const errors = await malformed.text();
				assert.match(errors, /Invalid printing selection/);
				assert.match(errors, /Invalid Deck choices/);
			}
		);
		await t.test(
			'actual Inventory form replay and repeated POST fields use shared adapters',
			async () => {
				const page = await get();
				const form = nativeForm(page.html, 'addToInventory'),
					payload = inputs(form);
				payload.set('finish', printing.is_nonfoil_available ? 'nonfoil' : 'foil');
				payload.set('condition', 'NM');
				payload.set('quantity', '1');
				let r = await submit(form.action, payload);
				assert.equal(r.status, 200);
				assert.match(await r.text(), /Inventory addition confirmed/);
				r = await submit(form.action, payload);
				assert.equal(r.status, 200);
				assert.equal(
					(
						await pool.query('select quantity from inventory_cards where account_id=$1', [
							owner.user.accountId
						])
					).rows[0].quantity,
					1
				);
				payload.append('quantity', '2');
				r = await submit(form.action, payload);
				assert.equal(r.status, 400);
				assert.match(await r.text(), /whole positive Quantity/);
			}
		);
	} finally {
		try {
			if (fault) await pool.query('ALTER COLLATION native_search_fault RENAME TO inventory_root');
			await pool.query('DROP TRIGGER IF EXISTS native_search_read_fault ON deck_mutation_requests');
			await pool.query('DROP FUNCTION IF EXISTS native_search_read_fault()');
		} finally {
			await stopHttpApplication(child);
			for (const account of accounts)
				await pool.query('delete from user_profiles where account_id=$1', [account]);
			await pool.end();
		}
	}
});
