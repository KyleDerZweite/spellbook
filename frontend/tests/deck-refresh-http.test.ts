import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { Deck, DeckSnapshot, LegalityWarning } from '@spellbook/contracts/decks.ts';
import type { CardDocument } from '@spellbook/contracts/catalog.ts';
import { SESSION_COOKIE } from './fixtures/session.ts';
import { fixtureAuthRequest } from './fixtures/http-auth.ts';
import { publishCategoryCatalogFixture } from './fixtures/category-catalog.ts';
import { httpTestOrigin, startHttpApplication, stopHttpApplication } from './http-runtime.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || databaseUrl !== process.env.DATABASE_URL)
	throw Error('Deck refresh HTTP checks require matching disposable DB references');
const origin = httpTestOrigin();
type FullDeck = DeckSnapshot & {
	warnings: LegalityWarning[];
	deckDocuments: Record<string, CardDocument>;
};

test('built selected Deck refresh projection preserves coherent PostgreSQL state and legacy parsing', async (t) => {
	const pool = new pg.Pool({ connectionString: databaseUrl });
	const accounts: string[] = [],
		publication = randomUUID();
	let child: Awaited<ReturnType<typeof startHttpApplication>> | undefined,
		restoreCatalog: (() => Promise<void>) | undefined;
	let previousPrice:
		| {
				active_publication: string | null;
				previous_publication: string | null;
				refresh_status: unknown;
		  }
		| undefined;
	let publishedPrice = false;
	try {
		// Runtime origin/port ownership is established before publishing any fixture.
		child = await startHttpApplication(origin, new URL('../', import.meta.url));
		restoreCatalog = await publishCategoryCatalogFixture(pool);
		async function register() {
			const response = await fixtureAuthRequest(
				origin,
				'/api/v1/auth/register',
				{
					username: 'refresh_http_' + randomUUID().slice(0, 8),
					password: 'deck-refresh-http-password'
				},
				{}
			);
			assert.equal(response.status, 201);
			const session = await response.json();
			accounts.push(session.user.accountId);
			return session;
		}
		const owner = await register(),
			foreign = await register();
		const headers = { authorization: `Bearer ${owner.token}` };
		async function create(token: string, name: string) {
			const response = await fetch(origin + '/api/v1/mtg/decks', {
				method: 'POST',
				headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
				body: JSON.stringify({ name, format: 'Modern', description: 'Refresh description' })
			});
			assert.equal(response.status, 200);
			const decks: Deck[] = await response.json();
			const deck = decks.find((deck) => deck.name === name);
			assert.ok(deck);
			return deck;
		}
		const selected = await create(owner.token, 'Selected refresh');
		await create(owner.token, 'Other owned Deck');
		const foreignDeck = await create(foreign.token, 'Foreign refresh');
		const printing: {
			id: string;
			oracle_id: string;
			name: string;
			set_code: string;
			generation_id: string;
		} = (
			await pool.query(
				'SELECT p.id,p.oracle_id,p.name,p.set_code,p.generation_id FROM catalog_printings p JOIN catalog_state s ON s.active_generation=p.generation_id ORDER BY p.id LIMIT 1'
			)
		).rows[0];
		assert.ok(printing);
		const inventory = randomUUID(),
			entry = randomUUID(),
			alternate = randomUUID();
		await pool.query("INSERT INTO inventories(id,account_id,game) VALUES($1,$2,'mtg')", [
			inventory,
			owner.user.accountId
		]);
		for (const [id, quantity] of [
			[printing.id, 2],
			[alternate, 1]
		] as const)
			await pool.query(
				`INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,finish,condition,notes,spellbook_position) VALUES($1,$2,$3,'mtg',$4,$5,$6,$7,'',$8,'nonfoil','NM','',0)`,
				[
					randomUUID(),
					inventory,
					owner.user.accountId,
					id,
					printing.oracle_id,
					printing.name,
					printing.set_code,
					quantity
				]
			);
		await pool.query(
			`INSERT INTO deck_cards(id,deck_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,role) VALUES($1,$2,$3,'mtg',$4,$5,$6,$7,'',6,'main')`,
			[
				entry,
				selected.id,
				owner.user.accountId,
				printing.id,
				printing.oracle_id,
				printing.name,
				printing.set_code
			]
		);
		previousPrice = (
			await pool.query(
				'SELECT active_publication,previous_publication,refresh_status FROM price_state WHERE id=1'
			)
		).rows[0];
		assert.ok(previousPrice);
		await pool.query(
			`INSERT INTO price_publications(id,catalog_generation_id,descriptor,source_type,source_updated_at,payload_digest,extractor_version,mapping_version) VALUES($1,$2,'{"source":"Scryfall"}','all_cards',now(),'deck-refresh-http',1,1)`,
			[publication, printing.generation_id]
		);
		await pool.query(
			`INSERT INTO price_printings(publication_id,id,oracle_id,set_id,set_code,collector_number,lang,finishes,variant_key,identity,links) VALUES($1,$2,$3,$4,$5,'1','en',ARRAY['nonfoil'],'matched','{"lang":"en"}','[]')`,
			[publication, printing.id, printing.oracle_id, randomUUID(), printing.set_code]
		);
		await pool.query(
			`INSERT INTO price_observations(publication_id,printing_id,finish,measure,amount,supported) VALUES($1,$2,'nonfoil','prices.eur',2.00,true)`,
			[publication, printing.id]
		);
		await pool.query(
			`UPDATE price_state SET active_publication=$1,previous_publication=NULL,refresh_status='{"kind":"Succeeded"}' WHERE id=1`,
			[publication]
		);
		publishedPrice = true;
		const path = `/api/v1/mtg/decks/${selected.id}`;
		const read = (query = '', supplied: Record<string, string> = headers, target = path) =>
			fetch(origin + target + query, { headers: supplied, redirect: 'manual' });
		async function body(query: string): Promise<FullDeck> {
			const response = await read(query);
			assert.equal(response.status, 200);
			assert.equal(response.headers.get('cache-control'), 'no-store');
			return response.json();
		}
		await t.test(
			'default and includeLegality=true preserve the complete old response',
			async () => {
				const legacy = await body(''),
					explicit = await body('?includeLegality=true');
				assert.equal(legacy.decks.length, 2);
				assert.deepEqual(Object.keys(explicit).sort(), Object.keys(legacy).sort());
				assert.deepEqual(explicit.warnings, legacy.warnings);
				assert.deepEqual(explicit.deckDocuments, legacy.deckDocuments);
				assert.ok(Array.isArray(legacy.warnings));
				assert.equal(legacy.deckDocuments[printing.id].id, printing.id);
			}
		);
		await t.test(
			'legacy selectedOnly stays permissive with absent/true includeLegality',
			async () => {
				for (const flag of ['', '&includeLegality=true']) {
					for (const value of ['false', 'TRUE', '1', '', 'unexpected'])
						assert.equal((await body(`?selectedOnly=${value}${flag}`)).decks.length, 2);
					assert.equal((await body(`?selectedOnly=true${flag}`)).decks.length, 1);
					assert.equal(
						(await body(`?selectedOnly=true&selectedOnly=false${flag}`)).decks.length,
						1
					);
					assert.equal(
						(await body(`?selectedOnly=false&selectedOnly=true${flag}`)).decks.length,
						2
					);
				}
			}
		);
		await t.test(
			'narrow response omits only legality and documents and keeps composition/ownership/availability/values coherent',
			async () => {
				const full = await body('?selectedOnly=true');
				const response = await read('?selectedOnly=true&includeLegality=false');
				assert.equal(response.status, 200);
				const narrow: DeckSnapshot = await response.json();
				assert.equal('warnings' in narrow, false);
				assert.equal('deckDocuments' in narrow, false);
				const { warnings: _warnings, deckDocuments: _documents, ...expected } = full;
				assert.deepEqual(Object.keys(narrow).sort(), Object.keys(expected).sort());
				assert.ok(narrow.valueEstimates);
				assert.ok(expected.valueEstimates);
				assert.ok(!Number.isNaN(Date.parse(narrow.valueEstimates.evaluatedAt)));
				assert.deepEqual(
					{ ...narrow, valueEstimates: { ...narrow.valueEstimates, evaluatedAt: '' } },
					{ ...expected, valueEstimates: { ...expected.valueEstimates, evaluatedAt: '' } }
				);
				assert.deepEqual(
					narrow.deckCards.map((card) => [card.id, card.quantity, card.role]),
					[[entry, 6, 'main']]
				);
				assert.deepEqual(narrow.availability[entry], { exact: 2, alternate: 1, missing: 3 });
				assert.equal(narrow.ownedByCanonical[printing.oracle_id], 3);
				assert.equal(narrow.ownedPrintings.length, 2);
				assert.equal(narrow.valueEstimates.required.totalQuantity, 6);
				assert.equal(narrow.valueEstimates.required.coveredValue, '12.00');
				assert.equal(narrow.valueEstimates.missing.totalQuantity, 3);
				assert.equal(narrow.valueEstimates.missing.coveredValue, '6.00');
				assert.equal(narrow.valuationError, null);
			}
		);
		await t.test(
			'invalid and duplicate new flags and unsafe narrow combinations return400',
			async () => {
				for (const query of [
					'?includeLegality=false',
					'?selectedOnly=false&includeLegality=false',
					'?selectedOnly=TRUE&includeLegality=false',
					'?selectedOnly=1&includeLegality=false',
					'?selectedOnly=&includeLegality=false',
					'?selectedOnly=true&includeLegality=',
					'?selectedOnly=true&includeLegality=FALSE',
					'?selectedOnly=true&includeLegality=1',
					'?includeLegality=true&includeLegality=true',
					'?selectedOnly=true&includeLegality=false&includeLegality=false',
					'?selectedOnly=true&selectedOnly=true&includeLegality=false',
					'?selectedOnly=true&selectedOnly=false&includeLegality=false'
				])
					assert.equal((await read(query)).status, 400, query);
			}
		);
		await t.test(
			'both projections retain authentication, UUID, account isolation and NotFound',
			async () => {
				for (const query of [
					'',
					'?includeLegality=true',
					'?selectedOnly=true&includeLegality=false'
				]) {
					assert.equal((await read(query, {})).status, 401);
					assert.equal(
						(
							await read(query, {
								cookie: `${SESSION_COOKIE}=${owner.token}`,
								authorization: 'Bearer invalid'
							})
						).status,
						401
					);
					assert.equal(
						(await read(query, { authorization: `Bearer ${foreign.token}` })).status,
						404
					);
					assert.equal(
						(await read(query, headers, `/api/v1/mtg/decks/${foreignDeck.id}`)).status,
						404
					);
					assert.equal((await read(query, headers, '/api/v1/mtg/decks/not-a-uuid')).status, 400);
					assert.equal(
						(await read(query, headers, `/api/v1/mtg/decks/${randomUUID()}`)).status,
						404
					);
					const cookie = await read(query, { cookie: `${SESSION_COOKIE}=${owner.token}` });
					assert.equal(cookie.status, 200);
				}
				await pool.query('DELETE FROM decks WHERE id=$1 AND account_id=$2', [
					selected.id,
					owner.user.accountId
				]);
				assert.equal((await read('?selectedOnly=true&includeLegality=false')).status, 404);
			}
		);
	} finally {
		try {
			if (child) await stopHttpApplication(child);
		} finally {
			try {
				for (const account of accounts)
					await pool.query('DELETE FROM user_profiles WHERE account_id=$1', [account]);
				if (publishedPrice && previousPrice) {
					const restored = await pool.query(
						'UPDATE price_state SET active_publication=$1,previous_publication=$2,refresh_status=$3 WHERE id=1 AND active_publication=$4',
						[
							previousPrice.active_publication,
							previousPrice.previous_publication,
							previousPrice.refresh_status,
							publication
						]
					);
					assert.equal(
						restored.rowCount,
						1,
						'Foreign price publication blocks fixture restoration'
					);
				}
				await pool.query('DELETE FROM price_publications WHERE id=$1', [publication]);
			} finally {
				try {
					await restoreCatalog?.();
				} finally {
					await pool.end();
				}
			}
		}
	}
});
