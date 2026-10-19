import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type pg from 'pg';
import type { CardDocument } from '@spellbook/contracts/catalog.ts';
import type { WebCommand, WebCommandInputs, WebCommandOutputs } from '@spellbook/contracts/web.ts';
import type { HttpTestApplication } from '../http-runtime.ts';
import { fixtureAuthRequest } from './http-auth.ts';

/** Uses the same real database/catalog and owned processes as the full HTTP suite. */
export async function verifyIndependentHttp(
	t: TestContext,
	application: HttpTestApplication,
	pool: pg.Pool,
	card: CardDocument,
	accounts: string[]
): Promise<void> {
	const { origin, apiOrigin } = application;
	const password = 'independent-http-test-password';
	const register = async () => {
		const username = `split_${randomUUID().slice(0, 8)}`;
		const response = await fixtureAuthRequest(
			origin,
			'/api/auth/register',
			{ username, password },
			{}
		);
		assert.equal(response.status, 201);
		const session = await response.json();
		accounts.push(session.user.accountId);
		return { ...session, username };
	};
	const a = await register(),
		b = await register();
	const bearer = { authorization: `Bearer ${a.token}` };
	const cookie = `spellbook_session=${a.token}`;
	const request = (
		target: string,
		path: string,
		method = 'GET',
		body?: unknown,
		headers: Record<string, string> = bearer
	) =>
		fetch(target + path, {
			method,
			redirect: 'manual',
			headers: {
				...headers,
				...(body === undefined ? {} : { 'content-type': 'application/json' })
			},
			body: body === undefined ? undefined : JSON.stringify(body)
		});
	const command = async <K extends keyof WebCommandInputs>(
		operation: K,
		input: WebCommandInputs[K]
	): Promise<WebCommandOutputs[K]> => {
		const response = await request(apiOrigin, '/api/web/v1/commands', 'POST', { operation, input });
		assert.equal(response.status, 200, `${operation} must succeed against the independent API`);
		assert.equal(response.headers.get('cache-control'), 'no-store');
		return response.json();
	};

	await t.test(
		'independent API and same-origin proxy retain public reads, credentials and safe errors',
		async () => {
			assert.notEqual(application.api.pid, application.web.pid);
			for (const target of [apiOrigin, origin]) {
				const printing = await request(
					target,
					`/api/catalog/printings/${card.id}`,
					'GET',
					undefined,
					{}
				);
				assert.equal(printing.status, 200);
				const document = await printing.json();
				assert.equal(document.id, card.id);
				assert.equal(document.privateFixtureField, undefined);
				const session = await request(target, '/api/auth/session', 'GET', undefined, {
					cookie,
					authorization: `Bearer ${b.token}`
				});
				assert.equal(session.status, 200);
				assert.equal((await session.json()).user.accountId, b.user.accountId);
				for (const authorization of ['', 'Basic abc', 'Bearer invalid']) {
					assert.equal(
						(
							await request(target, '/api/auth/session', 'GET', undefined, {
								cookie,
								authorization
							})
						).status,
						401
					);
				}
				assert.equal(
					(
						await request(
							target,
							'/api/account/profile',
							'PATCH',
							{ email: 'bad@example.test' },
							{
								cookie,
								origin: 'https://foreign.invalid'
							}
						)
					).status,
					403
				);
				assert.equal(
					(await request(target, `/api/catalog/printings/${randomUUID()}`, 'GET', undefined, {}))
						.status,
					404
				);
			}
			const paths = [
				'/api/catalog/search?q=Sol%20Ring',
				'/api/account/profile',
				'/api/account/dashboard'
			];
			for (const path of paths) {
				const direct = await request(apiOrigin, path),
					proxied = await request(origin, path);
				assert.equal(proxied.status, direct.status);
				assert.equal(proxied.headers.get('cache-control'), direct.headers.get('cache-control'));
				const directBody = await direct.json(),
					proxiedBody = await proxied.json();
				if (path === '/api/account/dashboard') {
					// Each real read computes its own evaluation instant. Saved values and history still match.
					for (const body of [directBody, proxiedBody]) {
						if (body.inventoryValue) {
							assert.ok(Number.isFinite(Date.parse(body.inventoryValue.evaluatedAt)));
							delete body.inventoryValue.evaluatedAt;
						}
						if (body.inventoryValueHistory) {
							assert.ok(Number.isFinite(Date.parse(body.inventoryValueHistory.asOf)));
							delete body.inventoryValueHistory.asOf;
						}
					}
				}
				assert.deepEqual(proxiedBody, directBody);
			}
		}
	);

	await t.test(
		'SSR and native/enhanced actions select the cookie account despite bearer headers',
		async () => {
			for (const authorization of [`Bearer ${b.token}`, 'Bearer invalid']) {
				const response = await request(origin, '/settings', 'GET', undefined, {
					cookie,
					authorization
				});
				assert.equal(response.status, 200);
				assert.match(await response.text(), new RegExp(a.username));
			}
			for (const enhanced of [false, true]) {
				const email = enhanced ? 'enhanced-split@example.test' : 'native-split@example.test';
				const response = await fetch(origin + '/settings', {
					method: 'POST',
					redirect: 'manual',
					headers: {
						cookie,
						authorization: `Bearer ${b.token}`,
						origin,
						accept: enhanced ? 'application/json' : 'text/html',
						...(enhanced ? { 'x-sveltekit-action': 'true' } : {}),
						'content-type': 'application/x-www-form-urlencoded'
					},
					body: new URLSearchParams({ intent: 'email', email })
				});
				assert.equal(response.status, 200);
				const own = await (await request(apiOrigin, '/api/account/profile')).json();
				const other = await (
					await request(apiOrigin, '/api/account/profile', 'GET', undefined, {
						authorization: `Bearer ${b.token}`
					})
				).json();
				assert.equal(own.user.email, email);
				assert.equal(other.user.email, '');
			}
			assert.equal(
				(
					await request(origin, '/settings', 'GET', undefined, {
						authorization: `Bearer ${a.token}`
					})
				).status,
				302
			);
		}
	);

	await t.test(
		'closed web commands retain original source, request IDs, receipts and conflict fields',
		async () => {
			const inventory: WebCommand = {
				operation: 'inventory.add',
				input: {
					requestId: randomUUID(),
					catalogCardId: card.id,
					finish: 'nonfoil',
					condition: 'NM',
					quantity: 2,
					notes: 'Original'
				}
			};
			const added = await command(inventory.operation, inventory.input);
			const entryId = added.changes[0].entryId;
			const notes = {
				entryId,
				requestId: randomUUID(),
				notes: 'Saved elsewhere',
				notesRevision: '0'
			};
			const savedNotes = await command('inventory.patchEntry', notes);
			for (const target of [apiOrigin, origin]) {
				const stale = await request(target, '/api/web/v1/commands', 'POST', {
					operation: 'inventory.patchEntry',
					input: {
						...notes,
						requestId: randomUUID(),
						notes: 'Retained draft'
					}
				});
				assert.equal(stale.status, 409);
				const failure = await stale.json();
				assert.equal(failure.kind, 'NotesConflict');
				assert.equal(failure.entryId, entryId);
				assert.equal(failure.notes, 'Saved elsewhere');
				assert.equal(failure.notesRevision, '1');
			}
			const delta = { entryId, requestId: randomUUID(), delta: 1 };
			const changed = await command('inventory.patchEntry', delta);
			assert.equal(changed.changes[0].quantity, 3);
			assert.equal(
				changed.changes[0].notesRevision,
				'1',
				'Absent optional Notes must remain absent'
			);
			const staleRemove = await request(apiOrigin, '/api/web/v1/commands', 'POST', {
				operation: 'inventory.remove',
				input: {
					entryId,
					requestId: randomUUID(),
					expectedQuantity: 2
				}
			});
			assert.equal(staleRemove.status, 409);
			const quantityFailure = await staleRemove.json();
			assert.equal(quantityFailure.kind, 'QuantityChanged');
			assert.equal(quantityFailure.latestQuantity, 3);
			const removal = { entryId, requestId: randomUUID(), expectedQuantity: 3 };
			const removed = await command('inventory.remove', removal);
			assert.deepEqual(await command(inventory.operation, inventory.input), added);
			assert.deepEqual(await command('inventory.patchEntry', notes), savedNotes);
			assert.deepEqual(await command('inventory.patchEntry', delta), changed);
			assert.deepEqual(await command('inventory.remove', removal), removed);
			const mobile = await request(origin, '/api/mobile/v1/mtg/inventory', 'POST', {
				requestId: inventory.input.requestId,
				source: 'mobile',
				items: [
					{
						catalogCardId: card.id,
						finish: 'nonfoil',
						condition: 'NM',
						quantity: 2,
						notes: 'Original'
					}
				]
			});
			assert.equal(mobile.status, 409, 'Source remains part of the original request fingerprint');

			const deck = await command('decks.createRecord', {
				game: 'mtg',
				name: 'Independent commands',
				description: 'Original',
				format: 'Modern'
			});
			const addCard = {
				deckId: deck.id,
				catalogCardId: card.id,
				quantity: 2,
				role: 'main',
				requestId: randomUUID()
			};
			const deckAdded = await command('decks.addCatalogCard', addCard);
			const deckEntryId = deckAdded.changes[0].entryId;
			const changePrinting = {
				entryId: deckEntryId,
				catalogCardId: card.id,
				quantity: 2,
				role: 'main',
				requestId: randomUUID()
			};
			const printingChanged = await command('decks.changePrinting', changePrinting);
			const updateCard = { entryId: deckEntryId, delta: 1, requestId: randomUUID() };
			const updated = await command('decks.updateCard', updateCard);
			assert.equal(updated.changes[0].quantity, 3);
			assert.equal(updated.changes[0].role, 'main');
			const removeCard = { entryId: deckEntryId, requestId: randomUUID() };
			const cardRemoved = await command('decks.removeCard', removeCard);
			const importCards = { deckId: deck.id, text: '1 Sol Ring', requestId: randomUUID() };
			const imported = await command('decks.importInto', importCards);
			assert.deepEqual(await command('decks.addCatalogCard', addCard), deckAdded);
			assert.deepEqual(await command('decks.changePrinting', changePrinting), printingChanged);
			assert.deepEqual(await command('decks.updateCard', updateCard), updated);
			assert.deepEqual(await command('decks.removeCard', removeCard), cardRemoved);
			assert.deepEqual(await command('decks.importInto', importCards), imported);
			for (const target of [apiOrigin, origin]) {
				const replay = await request(target, '/api/web/v1/commands', 'POST', inventory);
				assert.equal(replay.status, 200);
				assert.deepEqual(await replay.json(), added);
				assert.equal(
					(
						await request(target, '/api/web/v1/commands', 'POST', {
							...inventory,
							input: { ...inventory.input, quantity: 9 }
						})
					).status,
					409
				);
			}
			const inventorySources = (
				await pool.query(
					'SELECT DISTINCT source FROM inventory_mutation_requests WHERE account_id=$1',
					[a.user.accountId]
				)
			).rows;
			assert.deepEqual(inventorySources, [{ source: 'web' }]);
			const deckSources = (
				await pool.query(
					'SELECT request_id,source FROM deck_mutation_requests WHERE account_id=$1',
					[a.user.accountId]
				)
			).rows;
			assert.equal(deckSources.length, 5);
			for (const row of deckSources)
				assert.equal(row.source, row.request_id === importCards.requestId ? 'import' : 'web');

			const path = `/api/mobile/v1/mtg/decks/${deck.id}`;
			assert.equal(
				(
					await request(apiOrigin, path, 'PATCH', {
						description: 'New saved text',
						descriptionRevision: '0'
					})
				).status,
				200
			);
			for (const target of [apiOrigin, origin]) {
				const stale = await request(target, path, 'PATCH', {
					description: 'Retained draft',
					descriptionRevision: '0'
				});
				assert.equal(stale.status, 409);
				const failure = await stale.json();
				assert.equal(failure.kind, 'DescriptionConflict');
				assert.equal(failure.description, 'New saved text');
				assert.equal(failure.descriptionRevision, '1');
			}
		}
	);

	await t.test(
		'command parser rejects open operations, authority fields and oversized bodies before writes',
		async () => {
			const input: WebCommandInputs['inventory.add'] = {
				requestId: randomUUID(),
				catalogCardId: card.id,
				finish: 'nonfoil',
				condition: 'NM',
				quantity: 1
			};
			for (const body of [
				{ operation: 'profile.patch', input: {} },
				{ operation: 'inventory.add', input, actor: a.user },
				{ operation: 'inventory.add', input: { ...input, accountId: b.user.accountId } },
				{ operation: 'inventory.add', input: { ...input, source: 'mobile' } },
				{ operation: 'inventory.add', input: { ...input, notesRevision: null } },
				{ operation: 'inventory.add', input: { ...input, quantity: '1' } },
				{
					operation: 'decks.updateCard',
					input: { entryId: randomUUID(), requestId: randomUUID(), delta: 1, authority: a.user }
				}
			])
				assert.equal((await request(apiOrigin, '/api/web/v1/commands', 'POST', body)).status, 400);
			assert.equal(
				(
					await pool.query(
						'SELECT count(*)::int AS n FROM inventory_mutation_requests WHERE account_id=$1 AND request_id=$2',
						[a.user.accountId, input.requestId]
					)
				).rows[0].n,
				0
			);
			for (const target of [apiOrigin, origin]) {
				const oversized = await request(target, '/api/web/v1/commands', 'POST', {
					operation: 'inventory.add',
					input: { notes: 'x'.repeat(1024 * 1024) }
				});
				assert.equal(oversized.status, 413);
			}
		}
	);

	await t.test(
		'category lookup is owned and native password rotation replaces request credentials',
		async () => {
			const definition = await request(
				apiOrigin,
				'/api/mobile/v1/mtg/category-definitions',
				'POST',
				{
					requestId: randomUUID(),
					originId: null,
					expectedLibraryRevision: '0',
					scope: 'entry',
					name: 'Independent artifacts',
					meaning: 'Artifact cards',
					priority: 0,
					displayOrder: 0,
					roles: ['main'],
					rule: { op: 'type', value: 'Artifact' },
					confirmRetainedRule: false
				}
			);
			assert.equal(definition.status, 200);
			const { originId } = await definition.json();
			for (const target of [apiOrigin, origin]) {
				const path = `/api/mobile/v1/mtg/category-definitions/${originId}`;
				const own = await request(target, path);
				assert.equal(own.status, 200);
				assert.equal((await own.json()).current.name, 'Independent artifacts');
				assert.equal(
					(await request(target, path, 'GET', undefined, { authorization: `Bearer ${b.token}` }))
						.status,
					404
				);
			}
			for (const enhanced of [false, true]) {
				const actor = await register();
				const response = await fetch(origin + '/settings/password', {
					method: 'POST',
					redirect: 'manual',
					headers: {
						cookie: `spellbook_session=${actor.token}`,
						origin,
						accept: enhanced ? 'application/json' : 'text/html',
						...(enhanced ? { 'x-sveltekit-action': 'true' } : {}),
						'content-type': 'application/x-www-form-urlencoded'
					},
					body: new URLSearchParams({
						currentPassword: password,
						newPassword: password + '-rotated',
						confirmPassword: password + '-rotated'
					})
				});
				assert.equal(
					response.status,
					200,
					'Post-action load must authenticate with the replacement token'
				);
				const text = await response.text();
				assert.match(text, /Password changed/);
				assert.doesNotMatch(text, /Authentication required|Internal Error/);
				const replacementCookie = response.headers
					.getSetCookie()
					.find((value) => value.startsWith('spellbook_session='));
				assert.ok(replacementCookie);
				assert.match(replacementCookie, /HttpOnly/i);
				assert.notEqual(replacementCookie.split(';')[0], `spellbook_session=${actor.token}`);
				assert.equal(
					(
						await request(apiOrigin, '/api/auth/session', 'GET', undefined, {
							authorization: `Bearer ${actor.token}`
						})
					).status,
					401
				);
				assert.equal(
					(
						await request(origin, '/settings', 'GET', undefined, {
							cookie: replacementCookie.split(';')[0]
						})
					).status,
					200
				);
			}
		}
	);
}
