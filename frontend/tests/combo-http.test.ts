import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { fixtureAuthRequest } from './fixtures/http-auth.ts';
import { httpTestOrigin, startHttpApplication, stopHttpApplication } from './http-runtime.ts';
import { publishComboCatalogFixture, publishComboFixture } from './fixtures/combo.ts';
import type { CategoryPreview } from '@spellbook/contracts/category-library.ts';
import type { DeckEntryCategories } from '@spellbook/contracts/categories.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (
	!databaseUrl ||
	databaseUrl !== process.env.DATABASE_URL ||
	new URL(databaseUrl).pathname !== `/${process.env.TEST_SCAN_DATABASE_NAME}`
)
	throw Error('Combo HTTP requires the owned disposable database');
const origin = httpTestOrigin();

test('built Combo rules preserve native forms, copied proof, source fences and actor isolation', async (t) => {
	const pool = new pg.Pool({ connectionString: databaseUrl });
	const accounts: string[] = [];
	let child: Awaited<ReturnType<typeof startHttpApplication>> | undefined;
	let restoreCatalog: (() => Promise<void>) | undefined;
	let source: Awaited<ReturnType<typeof publishComboFixture>> | undefined;
	let replacement: Awaited<ReturnType<typeof publishComboFixture>> | undefined;
	try {
		restoreCatalog = await publishComboCatalogFixture(pool);
		source = await publishComboFixture(pool);
		const priorEnabled = process.env.COMMANDER_SPELLBOOK_ENABLED;
		try {
			process.env.COMMANDER_SPELLBOOK_ENABLED = 'true';
			child = await startHttpApplication(origin, new URL('../', import.meta.url));
		} finally {
			if (priorEnabled === undefined) delete process.env.COMMANDER_SPELLBOOK_ENABLED;
			else process.env.COMMANDER_SPELLBOOK_ENABLED = priorEnabled;
		}
		const registration = await fixtureAuthRequest(
			origin,
			'/api/auth/register',
			{
				username: 'combo_http_' + randomUUID().slice(0, 8),
				password: 'combo-http-fixture-password'
			},
			{}
		);
		assert.equal(registration.status, 201);
		const session = await registration.json();
		accounts.push(session.user.accountId);
		const bearer = { authorization: `Bearer ${session.token}` };
		const cookie = `spellbook_session=${session.token}`;
		const request = (
			path: string,
			method = 'GET',
			body?: unknown,
			headers: Record<string, string> = bearer
		) =>
			fetch(origin + path, {
				method,
				headers: {
					...headers,
					...(body === undefined ? {} : { 'content-type': 'application/json' })
				},
				body: body === undefined ? undefined : JSON.stringify(body),
				redirect: 'manual'
			});
		const postForm = (path: string, body: Record<string, string>) =>
			fetch(origin + path, {
				method: 'POST',
				headers: {
					cookie,
					origin,
					accept: 'text/html',
					'content-type': 'application/x-www-form-urlencoded'
				},
				body: new URLSearchParams(body),
				redirect: 'manual'
			});
		await t.test(
			'bounded selected outcome choices require authorization and retain source identity',
			async () => {
				assert.equal(
					(await request('/api/mobile/v1/mtg/category-rule-choices', 'GET', undefined, {})).status,
					401
				);
				const choices = await (
					await request(
						'/api/mobile/v1/mtg/category-rule-choices?outcomeQuery=Infinite&outcomeId=2244'
					)
				).json();
				assert.equal(choices.combo.source.publicationId, source!.publicationId);
				assert.ok(choices.combo.outcomes.length <= 50);
				assert.ok(choices.combo.selectedOutcomes.some((r: { id: string }) => r.id === '2244'));
				const excessive = new URLSearchParams();
				for (let i = 0; i < 101; i++) excessive.append('outcomeId', '2244');
				assert.equal(
					(await request('/api/mobile/v1/mtg/category-rule-choices?' + excessive)).status,
					400
				);
			}
		);
		const native = {
			requestId: randomUUID(),
			originId: '',
			expectedLibraryRevision: '0',
			scope: 'entry',
			name: 'Documented counters',
			meaning: 'Documented ingredients for counters',
			priority: '0',
			displayOrder: '0',
			roles: 'main',
			rule: JSON.stringify({
				op: 'comboParticipant',
				outcomeId: '2244',
				policyVersion: 'ingredients-v1'
			}),
			'rule.root.op': 'comboParticipant',
			'rule.root.outcomeId': '2244'
		};
		assert.equal((await postForm('/mtg/categories?/save', native)).status, 303);
		const library = await (await request('/api/mobile/v1/mtg/category-definitions')).json();
		assert.equal(library.definitions[0].current.rule.outcomeId, '2244');
		const created = await request('/api/mobile/v1/mtg/decks', 'POST', {
			name: 'Combo HTTP Deck',
			format: 'Commander',
			description: ''
		});
		assert.equal(created.status, 200);
		const deckId = (await created.json()).find(
			(d: { name: string }) => d.name === 'Combo HTTP Deck'
		).id;
		const cards = (
			await pool.query(
				'SELECT document FROM catalog_printings WHERE generation_id=(SELECT active_generation FROM catalog_state WHERE id=1) ORDER BY name'
			)
		).rows;
		for (const { document: card } of cards) {
			const response = await request(`/api/mobile/v1/mtg/decks/${deckId}/cards`, 'POST', {
				canonicalCardId: card.oracle_id,
				catalogCardId: card.id,
				name: card.name,
				setCode: card.set_code,
				imageUri: card.image_uri,
				quantity: 1,
				role: 'main',
				requestId: randomUUID()
			});
			assert.equal(response.status, 200);
		}
		const preview = async () => {
			const response = await request(
				`/api/mobile/v1/mtg/decks/${deckId}/category-previews`,
				'POST',
				{
					requestId: randomUUID(),
					scope: 'entry',
					mode: 'Review',
					restoreOriginIds: []
				}
			);
			assert.equal(response.status, 200);
			return (await response.json()) as CategoryPreview;
		};
		const reviewed = await preview();
		const committedRequest = randomUUID();
		const committed = await request(
			`/api/mobile/v1/mtg/category-previews/${reviewed.id}/commit`,
			'POST',
			{ requestId: committedRequest }
		);
		assert.equal(committed.status, 200);
		const receipt = await committed.json();
		const state = (await (
			await request(`/api/mobile/v1/mtg/decks/${deckId}/categories`)
		).json()) as DeckEntryCategories;
		assert.equal(state.decisions.length, 2);
		for (const decision of state.decisions) {
			assert.equal(decision.state, 'Automatic');
			assert.equal(decision.evidence?.combo?.source.publicationId, source.publicationId);
			assert.equal(decision.evidence?.combo?.evaluations[0].proof?.variant.id, '2850-4186');
		}
		const html = await (
			await request(`/mtg/decks?deck=${deckId}&group=category`, 'GET', undefined, { cookie })
		).text();
		assert.match(html, /Commander Spellbook/);
		assert.match(html, /Unchecked prerequisites/);
		assert.match(html, /2850-4186/);
		assert.match(html, /\{2\}\{G\}/);
		const stale = await preview();
		replacement = await publishComboFixture(pool);
		assert.equal(
			(
				await request(`/api/mobile/v1/mtg/category-previews/${stale.id}/commit`, 'POST', {
					requestId: randomUUID()
				})
			).status,
			409
		);
		assert.deepEqual(
			await (
				await request(`/api/mobile/v1/mtg/category-previews/${reviewed.id}/commit`, 'POST', {
					requestId: committedRequest
				})
			).json(),
			receipt
		);
		const foreignRegistration = await fixtureAuthRequest(
			origin,
			'/api/auth/register',
			{
				username: 'combo_other_' + randomUUID().slice(0, 8),
				password: 'combo-http-fixture-password'
			},
			{}
		);
		const foreign = await foreignRegistration.json();
		accounts.push(foreign.user.accountId);
		assert.equal(
			(
				await request(`/api/mobile/v1/mtg/decks/${deckId}/categories`, 'GET', undefined, {
					authorization: `Bearer ${foreign.token}`
				})
			).status,
			404
		);
	} finally {
		if (child) await stopHttpApplication(child);
		for (const accountId of accounts)
			await pool.query('DELETE FROM user_profiles WHERE account_id=$1', [accountId]);
		if (replacement) await replacement.restore();
		if (source) await source.restore();
		if (restoreCatalog) await restoreCatalog();
		await pool.end();
	}
});
