import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import type { CardDocument } from '@spellbook/contracts/catalog.ts';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || databaseUrl !== process.env.DATABASE_URL) {
	throw new Error(
		'HTTP tests require DATABASE_URL and TEST_DATABASE_URL to reference the same disposable database.'
	);
}
const origin = `http://127.0.0.1:${process.env.TEST_HTTP_PORT || '5191'}`;
const username = `http_${randomUUID().slice(0, 8)}`;
const password = 'real-http-test-password';
const pool = new pg.Pool({ connectionString: databaseUrl });
const generation = randomUUID();
const accounts: string[] = [];
let child: ChildProcess | undefined;
let previous: { active_generation: string | null; previous_generation: string | null } | undefined;

async function request(path: string, body?: unknown, headers: Record<string, string> = {}) {
	return fetch(`${origin}${path}`, {
		method: body === undefined ? 'GET' : 'POST',
		headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
		body: body === undefined ? undefined : JSON.stringify(body),
		redirect: 'manual'
	});
}

async function catalogFixture() {
	const cards: CardDocument[] = JSON.parse(
		await readFile(new URL('../scripts/demo/cards.json', import.meta.url), 'utf8')
	);
	const d = cards.find((card) => card.name === 'Sol Ring');
	assert.ok(d);
	previous = (
		await pool.query('SELECT active_generation, previous_generation FROM catalog_state WHERE id=1')
	).rows[0];
	await pool.query(
		"INSERT INTO catalog_generations(id,source_type,source_updated_at,document_count,published_at) VALUES($1,'http-test',now(),1,now())",
		[generation]
	);
	await pool.query(
		'INSERT INTO catalog_printings(generation_id,id,oracle_id,name,normalized_name,printed_name,lang,set_code,collector_number,rarity,cmc,colors,card_types,legalities,search_name,search_text,document) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)',
		[
			generation,
			d.id,
			d.oracle_id,
			d.name,
			d.name.toLowerCase(),
			'',
			d.lang,
			d.set_code,
			d.collector_number,
			d.rarity,
			d.cmc,
			d.colors,
			d.card_types,
			JSON.stringify(d.legalities),
			d.name.toLowerCase(),
			d.name + ' ' + d.oracle_text,
			JSON.stringify({ ...d, privateFixtureField: 'must-not-escape' })
		]
	);
	await pool.query(
		'INSERT INTO catalog_state(id,active_generation) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET active_generation=excluded.active_generation',
		[generation]
	);
	return d;
}

test('built HTTP application preserves public Catalog and local account journeys', async (t) => {
	try {
		const card = await catalogFixture();
		child = spawn(process.execPath, ['build/index.js'], {
			cwd: new URL('../', import.meta.url),
			env: { ...process.env, HOST: '127.0.0.1', PORT: new URL(origin).port },
			stdio: ['ignore', 'ignore', 'pipe']
		});
		let startupFailed = false;
		child.on('exit', () => {
			startupFailed = true;
		});
		child.stderr?.resume();
		let ready = false;
		for (let i = 0; i < 100; i++) {
			if (startupFailed) throw new Error('Built server exited before readiness.');
			try {
				ready = (await request('/auth/login')).status === 200;
			} catch {}
			if (ready) break;
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		assert.equal(ready, true, 'built server becomes available');
		await t.test('public Search and bounded printing reads use safe DTOs', async () => {
			const response = await request('/api/catalog/search', {
				query: 'Sol Ring',
				limit: 20,
				facets: true
			});
			assert.equal(response.status, 200);
			const search = await response.json();
			assert.equal(search.hits[0].name, 'Sol Ring');
			assert.equal(search.generationId, generation);
			assert.equal(search.hits[0].privateFixtureField, undefined);
			const printings = await (
				await request(`/api/catalog/cards/${card.oracle_id}/printings?limit=1`)
			).json();
			assert.equal(printings.hits[0].id, card.id);
			const page = await request('/mtg/search?q=Sol%20Ring');
			assert.equal(page.status, 200);
			assert.match(await page.text(), /Search/);
			assert.equal(
				(await request('/api/catalog/search', { query: 'Sol Ring', limit: 101 })).status,
				400
			);
		});
		await t.test(
			'API registration, bearer validation, wrong credentials and revocation',
			async () => {
				const registration = await request('/api/auth/register', { username, password });
				assert.equal(registration.status, 201);
				const registered = await registration.json();
				accounts.push(registered.user.accountId);
				assert.equal(registered.user.username, username);
				assert.equal(registered.user.passwordHash, undefined);
				assert.equal(typeof registered.expiresAt, 'string');
				assert.equal(new Date(registered.expiresAt).toISOString(), registered.expiresAt);
				assert.equal(
					(await request('/api/auth/login', { username, password: 'wrong-password' })).status,
					401
				);
				assert.equal((await request('/api/auth/register', { username, password })).status, 400);
				assert.equal(
					(
						await request(
							'/api/auth/login',
							{ username, password },
							{ origin: 'https://foreign.test' }
						)
					).status,
					403
				);
				const login = await request('/api/auth/login', {
					username: username.toUpperCase(),
					password
				});
				assert.equal(login.status, 200);
				const authenticated = await login.json();
				const authorization = `Bearer ${authenticated.token}`;
				assert.equal(
					(await request('/api/mobile/v1/mtg/search?q=Sol%20Ring', undefined, { authorization }))
						.status,
					200
				);
				assert.equal((await request('/api/auth/logout', {}, { authorization })).status, 204);
				assert.equal(
					(await request('/api/mobile/v1/mtg/search?q=Sol%20Ring', undefined, { authorization }))
						.status,
					401
				);
			}
		);
		await t.test(
			'native web forms set cookies, preserve destinations and enforce protected pages',
			async () => {
				const url = `${origin}/auth/login?returnTo=%2Fmtg%2Finventory`;
				const response = await fetch(url, {
					method: 'POST',
					headers: {
						origin,
						accept: 'text/html',
						'content-type': 'application/x-www-form-urlencoded'
					},
					body: new URLSearchParams({ username, password }),
					redirect: 'manual'
				});
				assert.equal(response.status, 303);
				assert.equal(response.headers.get('location'), '/mtg/inventory');
				const cookie = response.headers
					.getSetCookie()
					.find((value) => value.startsWith('spellbook_session='));
				assert.ok(cookie);
				assert.match(cookie, /HttpOnly/i);
				assert.match(cookie, /SameSite=Lax/i);
				assert.equal(
					(await request('/mtg/inventory', undefined, { cookie: cookie.split(';')[0] })).status,
					200
				);
				const anonymous = await request('/mtg/inventory');
				assert.equal(anonymous.status, 302);
				assert.match(anonymous.headers.get('location') ?? '', /^\/auth\/login\?returnTo=/);
				const wrong = await fetch(url, {
					method: 'POST',
					headers: {
						origin,
						accept: 'text/html',
						'content-type': 'application/x-www-form-urlencoded'
					},
					body: new URLSearchParams({ username, password: 'wrong-password' }),
					redirect: 'manual'
				});
				assert.equal(wrong.status, 400);
				assert.match(await wrong.text(), /Invalid username or password/);
			}
		);
	} finally {
		if (child && child.exitCode === null) {
			child.kill('SIGTERM');
			const running = child;
			await new Promise((resolve) => running.once('exit', resolve));
		}
		if (previous)
			await pool.query(
				'UPDATE catalog_state SET active_generation=$1,previous_generation=$2 WHERE id=1',
				[previous.active_generation, previous.previous_generation]
			);
		else await pool.query('DELETE FROM catalog_state WHERE active_generation=$1', [generation]);
		await pool.query('DELETE FROM catalog_generations WHERE id=$1', [generation]);
		if (accounts.length)
			await pool.query('DELETE FROM user_profiles WHERE account_id=ANY($1::text[])', [accounts]);
		await pool.end();
	}
});
