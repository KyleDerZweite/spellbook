import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { SESSION_COOKIE } from '@spellbook/backend/auth/session.ts';
import { fixtureAuthRequest } from './fixtures/http-auth.ts';
import { httpTestOrigin, startHttpApplication, stopHttpApplication } from './http-runtime.ts';
import type { Deck, DeckChoicePage } from '@spellbook/contracts/decks.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || databaseUrl !== process.env.DATABASE_URL)
	throw Error('Deck choice HTTP checks require matching disposable DB references');
const pool = new pg.Pool({ connectionString: databaseUrl });
const origin = httpTestOrigin();
const path = '/api/mobile/v1/mtg/decks/choices';
const accounts: string[] = [];
let child: ChildProcess | undefined;

test('built bounded Deck choice HTTP contract', async (t) => {
	try {
		assert.equal(
			(await pool.query('select current_database() as name')).rows[0].name,
			new URL(databaseUrl).pathname.slice(1)
		);
		child = await startHttpApplication(origin, new URL('../', import.meta.url));
		const register = async () => {
			const response = await fixtureAuthRequest(
				origin,
				'/api/auth/register',
				{
					username: 'choicehttp_' + randomUUID().slice(0, 8),
					password: 'choices-http-fixture-password'
				},
				{}
			);
			assert.equal(response.status, 201);
			const session = await response.json();
			accounts.push(session.user.accountId);
			return session;
		};
		const owner = await register(),
			foreign = await register();
		const bearer = { authorization: `Bearer ${owner.token}` },
			cookie = { cookie: `${SESSION_COOKIE}=${owner.token}` };
		const create = async (token: string, name: string) => {
			const response = await fetch(origin + '/api/mobile/v1/mtg/decks', {
				method: 'POST',
				headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
				body: JSON.stringify({
					name,
					format: 'Modern',
					description: 'private description, never a choice'
				})
			});
			assert.equal(response.status, 200);
			const decks: Deck[] = await response.json();
			const deck = decks.find((d) => d.name === name);
			assert.ok(deck);
			return deck;
		};
		const owned: Deck[] = [];
		for (let i = 0; i < 61; i++)
			owned.push(await create(owner.token, 'Deck' + String(i).padStart(2, '0')));
		const foreignDeck = await create(foreign.token, 'Foreign');
		const read = (query = '', headers: Record<string, string> = bearer) =>
			fetch(origin + path + query, { headers, redirect: 'manual' });
		await t.test(
			'default,50 and deep pages contain only summaries and a separately selected owned target',
			async () => {
				const response = await read(`?selectedDeckId=${owned[60].id}`);
				assert.equal(response.status, 200);
				assert.equal(response.headers.get('cache-control'), 'no-store');
				const first: DeckChoicePage = await response.json();
				assert.equal(first.items.length, 20);
				assert.equal(first.nextOffset, 20);
				assert.deepEqual(first.selected, { id: owned[60].id, name: 'Deck60', format: 'Modern' });
				const ids = first.items.map((d) => d.id);
				for (const offset of [20, 40, 60]) {
					const response = await read(`?offset=${offset}`);
					assert.equal(response.status, 200);
					const page: DeckChoicePage = await response.json();
					ids.push(...page.items.map((d) => d.id));
					assert.equal(page.nextOffset, offset === 60 ? null : offset + 20);
					assert.equal(page.selected, null);
				}
				assert.deepEqual(
					ids,
					owned.map((d) => d.id)
				);
				assert.equal((await (await read('?limit=50')).json()).items.length, 50);
				assert.deepEqual(await (await read('?offset=1000000')).json(), {
					items: [],
					nextOffset: null,
					selected: null
				});
				for (const d of [...first.items, first.selected])
					assert.deepEqual(Object.keys(d).sort(), ['format', 'id', 'name']);
			}
		);
		await t.test(
			'cookie and bearer agree, with no explicit-Authorization fallback or anonymous access',
			async () => {
				assert.deepEqual(await (await read('', cookie)).json(), await (await read()).json());
				assert.equal((await read('', {})).status, 401);
				assert.equal((await read('', { ...cookie, authorization: 'Bearer invalid' })).status, 401);
				assert.equal((await read('', { ...cookie, authorization: 'Basic invalid' })).status, 401);
			}
		);
		await t.test(
			'literal name queries do not expand percent, underscore or backslash',
			async () => {
				for (const name of ['100% Win', '100_any', 'Back\\Slash']) await create(owner.token, name);
				for (const [query, expected] of [
					['%', '100% Win'],
					['_', '100_any'],
					['\\', 'Back\\Slash'],
					['dEcK60', 'Deck60']
				]) {
					const response = await read('?query=' + encodeURIComponent(query));
					assert.equal(response.status, 200);
					assert.deepEqual(
						(await response.json()).items.map((d: { name: string }) => d.name),
						[expected]
					);
				}
			}
		);
		await t.test(
			'foreign, missing and deleted selected targets are null without implicit selection',
			async () => {
				for (const id of [foreignDeck.id, randomUUID()])
					assert.deepEqual(await (await read('?query=no-match&selectedDeckId=' + id)).json(), {
						items: [],
						nextOffset: null,
						selected: null
					});
				const removed = await fetch(origin + '/api/mobile/v1/mtg/decks/' + owned[60].id, {
					method: 'DELETE',
					headers: bearer
				});
				assert.equal(removed.status, 200);
				assert.equal((await (await read('?selectedDeckId=' + owned[60].id)).json()).selected, null);
				assert.equal((await (await read()).json()).selected, null);
			}
		);
		await t.test(
			'unknown and repeated keys, malformed pagination and invalid IDs return400',
			async () => {
				for (const query of [
					'?accountId=' + foreign.user.accountId,
					'?extra=1',
					'?query=a&query=b',
					'?limit=1&limit=1',
					'?offset=-1',
					'?offset=1.5',
					'?offset=1e2',
					'?offset=1000001',
					'?offset=',
					'?offset=Infinity',
					'?limit=0',
					'?limit=51',
					'?limit=1.5',
					'?limit=1e1',
					'?selectedDeckId=',
					'?selectedDeckId=invalid',
					'?query=' + 'x'.repeat(201),
					'?query=%00'
				])
					assert.equal((await read(query)).status, 400, query);
				assert.equal((await read('?offset=000&limit=01')).status, 200);
				assert.equal((await read('?query=' + 'x'.repeat(200))).status, 200);
			}
		);
	} finally {
		if (child) await stopHttpApplication(child);
		for (const account of accounts)
			await pool.query('delete from user_profiles where account_id=$1', [account]);
		await pool.end();
	}
});
