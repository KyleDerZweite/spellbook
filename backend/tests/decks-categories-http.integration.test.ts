import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { it } from 'node:test';
import pg from 'pg';
import type { CardDocument } from '@spellbook/contracts/catalog.ts';
import type { InventoryAcknowledgement } from '@spellbook/contracts/inventory.ts';
import type { Deck, DeckAcknowledgement } from '@spellbook/contracts/decks.ts';
import type { WebCommand } from '@spellbook/contracts/web.ts';
import { createApplication } from '../src/application.ts';
import { createWebRoutes } from '../src/http/routes/web.ts';
import { createCategoryRoutes } from '../src/http/routes/categories.ts';
import { errorResponse } from '../src/http/errors.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;
const disposableName = process.env.TEST_HTTP_DOMAIN_DISPOSABLE_DB;
const fixturePath = process.env.TEST_HTTP_DOMAIN_CATALOG_PATH;

// This test publishes an owned Catalog fixture. Require explicit disposable-database confirmation.
it(
	'preserves original web receipts, conflict recovery, sources and floor 1 with real PostgreSQL',
	{
		skip: !databaseUrl || !disposableName || !fixturePath,
		timeout: 60000
	},
	async (t) => {
		assert.equal(decodeURIComponent(new URL(databaseUrl!).pathname.slice(1)), disposableName);
		assert.equal(process.env.DATABASE_URL, databaseUrl);
		const pool = new pg.Pool({ connectionString: databaseUrl });
		const lifetime = await createApplication({ databaseUrl, valueHistoryEnabled: 'false' });
		const { application } = lifetime;
		let accountId: string | undefined;
		let restoreCatalog: (() => Promise<void>) | undefined;
		t.after(async () => {
			try {
				if (accountId) {
					await pool.query('DELETE FROM inventory_mutation_requests WHERE account_id=$1', [
						accountId
					]);
					await pool.query('DELETE FROM user_profiles WHERE account_id=$1', [accountId]);
				}
				await restoreCatalog?.();
			} finally {
				await lifetime.close();
				await pool.end();
			}
		});
		const documents: CardDocument[] = JSON.parse(await readFile(fixturePath!, 'utf8'));
		const printings = documents
			.filter((card) => card.name === 'Sol Ring' && card.is_nonfoil_available)
			.slice(0, 2);
		assert.equal(printings.length, 2, 'Use the tracked real Sol Ring printings, not invented data');
		const [card, alternate] = printings;
		const generation = randomUUID();
		const client = await pool.connect();
		let previous: Record<string, unknown> | undefined;
		try {
			await client.query('BEGIN');
			await client.query('SELECT pg_advisory_xact_lock($1,$2)', [1936747619, 1]);
			previous = (
				await client.query(
					'SELECT active_generation,previous_generation,updated_at::text AS updated_at FROM catalog_state WHERE id=1 FOR UPDATE'
				)
			).rows[0];
			await client.query(
				"INSERT INTO catalog_generations(id,source_type,source_updated_at,document_count,published_at) VALUES($1,'test-owned-http-decks',now(),$2,now())",
				[generation, printings.length]
			);
			for (const printing of printings) {
				await client.query(
					'INSERT INTO catalog_printings(generation_id,id,oracle_id,name,normalized_name,printed_name,lang,set_code,collector_number,rarity,cmc,colors,card_types,legalities,search_name,search_text,document) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)',
					[
						generation,
						printing.id,
						printing.oracle_id,
						printing.name,
						printing.name.toLowerCase(),
						printing.printed_name ?? '',
						printing.lang,
						printing.set_code,
						printing.collector_number,
						printing.rarity,
						printing.cmc,
						printing.colors,
						printing.card_types,
						JSON.stringify(printing.legalities),
						printing.name.toLowerCase(),
						`${printing.name} ${printing.oracle_text}`,
						JSON.stringify(printing)
					]
				);
			}
			await client.query(
				'INSERT INTO catalog_state(id,active_generation) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET active_generation=excluded.active_generation',
				[generation]
			);
			await client.query('COMMIT');
		} catch (cause) {
			await client.query('ROLLBACK');
			throw cause;
		} finally {
			client.release();
		}
		restoreCatalog = async () => {
			const cleanup = await pool.connect();
			try {
				await cleanup.query('BEGIN');
				await cleanup.query('SELECT pg_advisory_xact_lock($1,$2)', [1936747619, 1]);
				assert.equal(
					(await cleanup.query('SELECT active_generation FROM catalog_state WHERE id=1 FOR UPDATE'))
						.rows[0]?.active_generation,
					generation,
					'Preserve any foreign Catalog publication'
				);
				if (previous)
					await cleanup.query(
						'UPDATE catalog_state SET active_generation=$1,previous_generation=$2,updated_at=$3 WHERE id=1',
						[previous.active_generation, previous.previous_generation, previous.updated_at]
					);
				else await cleanup.query('DELETE FROM catalog_state WHERE id=1');
				await cleanup.query('DELETE FROM catalog_generations WHERE id=$1', [generation]);
				await cleanup.query('COMMIT');
			} catch (cause) {
				await cleanup.query('ROLLBACK');
				throw cause;
			} finally {
				cleanup.release();
			}
		};
		const authenticated = await application.auth.authenticate(
			'register',
			`routes_${randomUUID().slice(0, 8)}`,
			'owned-route-receipt-test-password'
		);
		assert.ok(authenticated);
		accountId = authenticated.user.accountId;
		const actor = authenticated.user;
		const deps = { application, publicOrigin: 'https://spellbook.test' };
		const web = createWebRoutes(deps)[0];
		async function command(body: WebCommand) {
			const url = new URL(web.path, deps.publicOrigin);
			try {
				return await web.handle({
					request: new Request(url, {
						method: 'POST',
						headers: {
							'content-type': 'application/json',
							authorization: `Bearer ${authenticated!.session.token}`
						},
						body: JSON.stringify(body)
					}),
					url,
					params: {},
					clientAddress: '127.0.0.1'
				});
			} catch (cause) {
				return errorResponse(cause);
			}
		}
		async function replay(body: WebCommand, original: unknown) {
			const response = await command(body);
			assert.equal(response.status, 200, await response.clone().text());
			assert.deepEqual(await response.json(), original);
		}
		const inventoryAdd = {
			requestId: randomUUID(),
			catalogCardId: card.id,
			finish: 'nonfoil',
			condition: 'NM',
			quantity: 2,
			notes: 'Original notes'
		};
		const added = await application.inventory.add(actor, { ...inventoryAdd, source: 'web' });
		await replay({ operation: 'inventory.add', input: inventoryAdd }, added);
		const changed = await command({
			operation: 'inventory.add',
			input: { ...inventoryAdd, quantity: 3 }
		});
		assert.equal(changed.status, 409);
		assert.equal((await changed.json()).kind, 'RequestConflict');
		const entryId = added.changes[0].entryId;
		const patch = { requestId: randomUUID(), entryId, delta: -10 };
		const patched = await application.inventory.patchEntry(actor, { ...patch, source: 'web' });
		await replay({ operation: 'inventory.patchEntry', input: patch }, patched);
		assert.equal(
			(await application.inventory.getEntry(actor, entryId))?.entry.quantity,
			1,
			'Web decrement keeps the original floor 1'
		);
		await application.inventory.patchEntry(actor, {
			requestId: randomUUID(),
			entryId,
			notes: 'New notes',
			notesRevision: '0',
			source: 'web'
		});
		const conflict = await command({
			operation: 'inventory.patchEntry',
			input: { requestId: randomUUID(), entryId, notes: 'Stale draft', notesRevision: '0' }
		});
		assert.equal(conflict.status, 409);
		const conflictBody = await conflict.json();
		assert.equal(conflictBody.kind, 'NotesConflict');
		assert.equal(conflictBody.notes, 'New notes');
		assert.equal(conflictBody.notesRevision, '1');
		assert.equal(conflictBody.entryId, entryId);
		const removal = { requestId: randomUUID(), entryId, expectedQuantity: 1 };
		const removed = await application.inventory.remove(actor, { ...removal, source: 'web' });
		await replay({ operation: 'inventory.remove', input: removal }, removed);
		await replay({ operation: 'inventory.add', input: inventoryAdd }, added);
		assert.equal(
			await application.inventory.getEntry(actor, entryId),
			null,
			'Replaying the original Add must not recreate a removed entry'
		);

		const create = await command({
			operation: 'decks.createRecord',
			input: {
				game: 'mtg',
				name: 'Owned receipt Deck',
				description: 'Original',
				format: 'Commander'
			}
		});
		assert.equal(create.status, 200);
		const deck: Deck = await create.json();
		const addCard = {
			deckId: deck.id,
			catalogCardId: card.id,
			quantity: 2,
			role: 'main',
			requestId: randomUUID()
		};
		const deckAdded = await application.decks.addCatalogCardToDeck(actor, addCard);
		await replay({ operation: 'decks.addCatalogCard', input: addCard }, deckAdded);
		const deckEntryId = deckAdded.changes[0].entryId;
		const changePrinting = {
			entryId: deckEntryId,
			catalogCardId: alternate.id,
			quantity: 2,
			role: 'main',
			requestId: randomUUID()
		};
		const printingChanged = await application.decks.changeDeckPrinting(actor, changePrinting);
		await replay({ operation: 'decks.changePrinting', input: changePrinting }, printingChanged);
		const currentEntryId = printingChanged.changes.find(
			(change) => change.catalogCardId === alternate.id
		)!.entryId;
		const update = { entryId: currentEntryId, delta: -10, requestId: randomUUID() };
		const updated = await application.decks.updateDeckCard(
			actor,
			update.entryId,
			undefined,
			undefined,
			update.requestId,
			update.delta
		);
		await replay({ operation: 'decks.updateCard', input: update }, updated);
		assert.equal(
			(await application.decks.getDeck(actor, deck.id)).deckCards.find(
				(entry) => entry.id === currentEntryId
			)?.quantity,
			1
		);
		const importInto = {
			deckId: deck.id,
			text: `1 ${card.name} (${card.set_code.toUpperCase()}) ${card.collector_number}`,
			requestId: randomUUID()
		};
		const imported = await application.decks.importIntoDeck(actor, importInto);
		await replay({ operation: 'decks.importInto', input: importInto }, imported);
		const removeCard = { entryId: currentEntryId, requestId: randomUUID() };
		const cardRemoved = await application.decks.removeDeckCard(
			actor,
			removeCard.entryId,
			removeCard.requestId
		);
		await replay({ operation: 'decks.removeCard', input: removeCard }, cardRemoved);
		const categoryInput = { requestId: randomUUID(), deckId: deck.id };
		const initialized = await application.categories.initializeDeckCategories(actor, categoryInput);
		await application.decks.deleteDeck(actor, deck.id);
		for (const [body, original] of [
			[{ operation: 'decks.addCatalogCard', input: addCard }, deckAdded],
			[{ operation: 'decks.changePrinting', input: changePrinting }, printingChanged],
			[{ operation: 'decks.updateCard', input: update }, updated],
			[{ operation: 'decks.importInto', input: importInto }, imported],
			[{ operation: 'decks.removeCard', input: removeCard }, cardRemoved]
		] as Array<[WebCommand, DeckAcknowledgement]>)
			await replay(body, original);
		const initialize = createCategoryRoutes(deps).find((route) =>
			route.path.endsWith('/categories/initialize')
		)!;
		const url = new URL(initialize.path.replace(':deckId', deck.id), deps.publicOrigin);
		const response = await initialize.handle({
			request: new Request(url, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${authenticated.session.token}`
				},
				body: JSON.stringify({ requestId: categoryInput.requestId })
			}),
			url,
			params: { deckId: deck.id },
			clientAddress: '127.0.0.1'
		});
		assert.deepEqual(await response.json(), initialized);
		const requestConflict = await command({
			operation: 'decks.addCatalogCard',
			input: { ...addCard, quantity: 3 }
		});
		assert.equal(requestConflict.status, 409);
		assert.equal((await requestConflict.json()).kind, 'RequestConflict');

		const newAdd = await command({
			operation: 'inventory.add',
			input: { ...inventoryAdd, requestId: randomUUID(), notes: '' }
		});
		assert.equal(newAdd.status, 200);
		const newAcknowledgement: InventoryAcknowledgement = await newAdd.json();
		const quantityChanged = await command({
			operation: 'inventory.remove',
			input: {
				entryId: newAcknowledgement.changes[0].entryId,
				expectedQuantity: 3,
				requestId: randomUUID()
			}
		});
		assert.equal(quantityChanged.status, 409);
		assert.equal((await quantityChanged.json()).latestQuantity, 2);
		await application.auth.revokeSession(authenticated.session.token);
		const revoked = await command({ operation: 'inventory.add', input: inventoryAdd });
		assert.equal(revoked.status, 401, 'Revocation must be enforced before original receipt replay');
	}
);
