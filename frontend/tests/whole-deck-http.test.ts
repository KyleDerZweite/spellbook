import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, rm, symlink } from 'node:fs/promises';
import pg from 'pg';
import { publishCategoryCatalogFixture } from './fixtures/category-catalog.ts';
import { fixtureAuthRequest } from './fixtures/http-auth.ts';
import { httpTestOrigin, startHttpApplication, stopHttpApplication } from './http-runtime.ts';
import type {
	CategoryPreview,
	LibraryAcknowledgement,
	SaveDefinitionInput
} from '@spellbook/contracts/category-library.ts';
import type { DeckWholeCategories } from '@spellbook/contracts/whole-categories.ts';
import type { DeckLibraryPage, DeckLibraryCategories } from '@spellbook/contracts/deck-library.ts';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (
	!databaseUrl ||
	databaseUrl !== process.env.DATABASE_URL ||
	new URL(databaseUrl).pathname !== `/${process.env.TEST_SCAN_DATABASE_NAME}`
)
	throw Error('Whole Deck HTTP requires matching owned disposable database URLs');
const origin = httpTestOrigin(),
	cwd = new URL('../', import.meta.url),
	base = '/api/mobile/v1/mtg';
const replicaOrigin = `http://127.0.0.1:${Number(new URL(origin).port) + 1}`;
const artifacts = new URL('../../.local/whole-deck-http/', import.meta.url);
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function waitFor(check: () => Promise<boolean>, message: string, ms = 7000) {
	const deadline = Date.now() + ms;
	while (Date.now() < deadline) {
		if (await check()) return;
		await delay(20);
	}
	assert.fail(message);
}
test('built whole Categories and bounded Deck Library preserve private saved contracts', async (t) => {
	const pool = new pg.Pool({ connectionString: databaseUrl }),
		accounts: string[] = [];
	const children: Awaited<ReturnType<typeof startHttpApplication>>[] = [];
	let restore: (() => Promise<void>) | undefined, eventController: AbortController | undefined;
	try {
		restore = await publishCategoryCatalogFixture(pool);
		await mkdir(artifacts, { recursive: true });
		await rm(new URL('node_modules', artifacts), { force: true });
		await symlink(
			new URL('node_modules/', cwd).pathname,
			new URL('node_modules', artifacts),
			'dir'
		);
		await rm(new URL('primary/', artifacts), { recursive: true, force: true });
		await cp(new URL('build/', cwd), new URL('primary/', artifacts), { recursive: true });
		children.push(
			await startHttpApplication(origin, cwd, new URL('primary/index.js', artifacts).pathname)
		);
		if (process.env.TEST_WHOLE_TWO_PROCESS === 'true') {
			const build = spawnSync('fnm', ['exec', '--using', '26.10.0', 'pnpm', 'build'], {
				cwd,
				env: { ...process.env, APP_ORIGIN: replicaOrigin, DEV_APP_ORIGIN: replicaOrigin },
				stdio: ['ignore', 'pipe', 'pipe']
			});
			assert.equal(build.status, 0, 'Replica origin-matched build must pass');
			await rm(new URL('replica/', artifacts), { recursive: true, force: true });
			await cp(new URL('build/', cwd), new URL('replica/', artifacts), { recursive: true });
			children.push(
				await startHttpApplication(
					replicaOrigin,
					cwd,
					new URL('replica/index.js', artifacts).pathname
				)
			);
		}
		async function register() {
			const username = 'whole_http_' + randomUUID().slice(0, 8);
			const response = await fixtureAuthRequest(
				origin,
				'/api/auth/register',
				{ username, password: 'whole-category-http-password' },
				{}
			);
			assert.equal(response.status, 201);
			const session = await response.json();
			accounts.push(session.user.accountId);
			return { ...session, username };
		}
		const a = await register(),
			b = await register();
		const request = (
			path: string,
			method = 'GET',
			body?: unknown,
			token = a.token,
			cookie = false,
			target = origin
		) =>
			fetch(target + path, {
				method,
				redirect: 'manual',
				headers: {
					...(cookie
						? { cookie: `spellbook_session=${token}`, origin: target }
						: { authorization: `Bearer ${token}` }),
					...(body === undefined ? {} : { 'content-type': 'application/json' })
				},
				body: body === undefined ? undefined : JSON.stringify(body)
			});
		async function json<T>(response: Response): Promise<T> {
			assert.equal(response.status, 200, await response.clone().text());
			return response.json();
		}
		const whole = (deck: string) =>
			request(`${base}/decks/${deck}/whole-categories`).then((r) => json<DeckWholeCategories>(r));
		const directory = (params = '') =>
			request(`${base}/deck-library${params}`).then((r) => json<DeckLibraryPage>(r));
		let libraryRevision = '0';
		async function save(name: string, originId: string | null = null, creature = false) {
			const input: SaveDefinitionInput = {
				requestId: randomUUID(),
				originId,
				expectedLibraryRevision: libraryRevision,
				scope: 'deck',
				name,
				meaning: creature ? 'Main has a Creature' : 'Main has no Creature',
				priority: 0,
				displayOrder: 0,
				roles: ['main'],
				rule: creature
					? { op: 'minimumCopies', predicate: { op: 'type', value: 'Creature' }, minimum: 1 }
					: {
							op: 'not',
							child: {
								op: 'minimumCopies',
								predicate: { op: 'type', value: 'Creature' },
								minimum: 1
							}
						},
				confirmRetainedRule: false
			};
			const result = await json<LibraryAcknowledgement>(
				await request(`${base}/category-definitions`, 'POST', input)
			);
			libraryRevision = result.libraryRevision;
			return result;
		}
		const old = await save('Historical empty Deck'),
			overlaps: LibraryAcknowledgement[] = [];
		for (let i = 0; i < 4; i++) overlaps.push(await save(`Empty overlap ${i}`));
		async function makeDeck(name: string) {
			const list = await json<{ id: string; name: string }[]>(
				await request(`${base}/decks`, 'POST', { name, format: 'Modern', description: '' })
			);
			return list.find((d) => d.name === name)!.id;
		}
		const selected = await makeDeck('Selected original'),
			other = await makeDeck('Other original');
		async function settled(deck: string) {
			await waitFor(
				async () =>
					(await pool.query('SELECT 1 FROM deck_whole_category_jobs WHERE deck_id=$1', [deck]))
						.rowCount === 0,
				'Durable evaluation must settle'
			);
		}
		await settled(selected);
		await settled(other);
		await t.test(
			'initial jobs evaluate overlapping outcomes and bound compact metadata',
			async () => {
				const state = await whole(selected);
				assert.equal(state.categories.length, 5);
				assert.ok(state.categories.every((c) => c.decision?.truth === 'True'));
				const page = await directory();
				assert.equal(page.globalTotal, 2);
				assert.equal(page.matchingTotal, 2);
				for (const item of page.items) {
					assert.equal(item.categories.length, 3);
					assert.equal(item.remainingCategoryCount, 2);
					assert.ok(!('rule' in item) && !('evidence' in item) && !('cards' in item));
				}
				assert.equal(
					(await directory(`?dirCategory=${old.versionId}&dirCategory=${overlaps[0].versionId}`))
						.matchingTotal,
					2
				);
				assert.equal((await request(`${base}/deck-library?limit=201`)).status, 400);
			}
		);
		await t.test(
			'cookie and bearer reads isolate accounts and GET never initializes a legacy Deck',
			async () => {
				assert.deepEqual(
					await json(
						await request(
							`${base}/decks/${selected}/whole-categories`,
							'GET',
							undefined,
							a.token,
							true
						)
					),
					await whole(selected)
				);
				for (const path of [
					`${base}/decks/${selected}`,
					`${base}/decks/${selected}/whole-categories`
				])
					assert.equal((await request(path, 'GET', undefined, b.token)).status, 404);
				assert.equal(
					(
						await json<DeckLibraryPage>(
							await request(`${base}/deck-library`, 'GET', undefined, b.token)
						)
					).globalTotal,
					0
				);
				const legacy = randomUUID();
				await pool.query(
					"INSERT INTO decks(id,account_id,game,name,format) VALUES($1,$2,'mtg','Legacy untouched','Modern')",
					[legacy, a.user.accountId]
				);
				const counts = () =>
					pool.query(
						'SELECT (SELECT count(*) FROM deck_category_bundles WHERE deck_id=$1) AS bundles,(SELECT count(*) FROM deck_whole_categories WHERE deck_id=$1) AS categories,(SELECT count(*) FROM deck_whole_category_jobs WHERE deck_id=$1) AS jobs',
						[legacy]
					);
				const before = await counts();
				assert.equal((await whole(legacy)).initialized, false);
				for (const path of [
					`${base}/decks/${legacy}`,
					`${base}/deck-library`,
					`${base}/deck-library/categories`,
					`${base}/deck-library/locate?deckId=${legacy}`
				])
					await json(await request(path));
				assert.deepEqual((await counts()).rows, before.rows);
			}
		);
		await t.test('whole mutation bodies reject unknown fields and more than 64 KiB', async () => {
			const state = await whole(selected),
				path = `${base}/decks/${selected}/whole-categories/${old.versionId}`;
			const input = {
				requestId: randomUUID(),
				expectedDecisionRevision: state.decisionRevision,
				manual: 'Include'
			};
			assert.equal((await request(path, 'PATCH', { ...input, unknown: true })).status, 400);
			assert.equal(
				(await request(path, 'DELETE', { ...input, manual: undefined, unknown: true })).status,
				400
			);
			assert.equal(
				(await request(path, 'PATCH', { ...input, name: 'x'.repeat(65536), manual: undefined }))
					.status,
				413
			);
			assert.deepEqual(await whole(selected), state);
		});
		await t.test(
			'Manual historical meaning survives Review and original receipts reject changed replay',
			async () => {
				const input = {
						requestId: randomUUID(),
						expectedDecisionRevision: (await whole(selected)).decisionRevision,
						manual: 'Include'
					},
					path = `${base}/decks/${selected}/whole-categories/${old.versionId}`;
				const ack = await json(await request(path, 'PATCH', input, a.token, true));
				assert.deepEqual(await json(await request(path, 'PATCH', input)), ack);
				assert.equal((await request(path, 'PATCH', { ...input, manual: 'Exclude' })).status, 409);
				const updated = await save('Current creature Deck', old.originId, true);
				const preview = await json<CategoryPreview>(
					await request(`${base}/decks/${selected}/category-previews`, 'POST', {
						requestId: randomUUID(),
						scope: 'deck',
						mode: 'Review',
						restoreOriginIds: []
					})
				);
				assert.equal(preview.status, 'Ready');
				assert.deepEqual(
					await json(await request(`${base}/category-previews/${preview.id}`)),
					preview
				);
				const commitInput = { requestId: randomUUID() },
					commitPath = `${base}/category-previews/${preview.id}/commit`,
					commit = await json(await request(commitPath, 'POST', commitInput));
				assert.deepEqual(await json(await request(commitPath, 'POST', commitInput)), commit);
				const after = await whole(selected),
					historic = after.categories.find((c) => c.versionId === old.versionId)!;
				assert.equal(historic.definition.name, 'Historical empty Deck');
				assert.equal(historic.decision?.manual, 'Include');
				assert.equal(historic.automaticActive, false);
				assert.equal(
					after.categories.find((c) => c.versionId === updated.versionId)?.decision?.truth,
					'False'
				);
				assert.equal((await directory(`?dirCategory=${old.versionId}`)).matchingTotal, 2);
				assert.equal((await directory(`?dirCategory=${updated.versionId}`)).matchingTotal, 0);
				const choices = await json<DeckLibraryCategories>(
					await request(
						`${base}/deck-library/categories?selectedVersionId=${old.versionId}&selectedVersionId=${updated.versionId}`
					)
				);
				assert.equal(choices.selected.find((c) => c.versionId === old.versionId)?.historical, true);
				assert.equal(
					choices.selected.find((c) => c.versionId === old.versionId)?.meaning,
					'Main has no Creature'
				);
			}
		);
		await t.test(
			'bounded deep metadata and revision-fenced location retain selected Deck outside filters',
			async () => {
				await pool.query(
					"INSERT INTO decks(id,account_id,game,name,format) SELECT gen_random_uuid(),$1,'mtg','Scale '||lpad(i::text,4,'0'),'Modern' FROM generate_series(1,1001) i",
					[a.user.accountId]
				);
				const page = await directory('?dirQ=Scale&dirSort=name:asc&offset=900&limit=200');
				assert.equal(page.globalTotal, 1004);
				assert.equal(page.matchingTotal, 1001);
				assert.equal(page.items.length, 101);
				const text = await (await request(`${base}/deck-library?dirQ=Scale&limit=200`)).text();
				assert.ok(Buffer.byteLength(text) < 100000);
				assert.doesNotMatch(text, /definitionSnapshot|attemptedTruth|predicate|"cards"/);
				const location = await json<{ offset: number | null }>(
					await request(
						`${base}/deck-library/locate?dirQ=Scale&dirSort=name:asc&deckId=${page.items[0].id}&revision=${page.revision}`
					)
				);
				assert.equal(location.offset, 900);
				assert.equal(
					(
						await json<{ offset: number | null }>(
							await request(`${base}/deck-library/locate?dirQ=Scale&deckId=${selected}`)
						)
					).offset,
					null
				);
				const detail = await json<{ decks: { id: string }[] }>(
					await request(`${base}/decks/${selected}?selectedOnly=true`)
				);
				assert.equal(detail.decks.length, 1);
				assert.equal(detail.decks[0].id, selected);
				const legacySnapshot = await json<{ decks: { id: string }[] }>(
					await request(`${base}/decks/${selected}`)
				);
				assert.equal(legacySnapshot.decks.length, 1004);

				await json(
					await request(`${base}/decks/${selected}`, 'PATCH', { name: 'Selected renamed' })
				);
				for (const path of [
					`${base}/deck-library`,
					`${base}/deck-library/categories`,
					`${base}/deck-library/locate?deckId=${selected}`
				]) {
					const response = await request(
						`${path}${path.includes('?') ? '&' : '?'}revision=${page.revision}`
					);
					assert.equal(response.status, 409);
					assert.equal((await response.json()).kind, 'RevisionChanged');
				}
			}
		);
		await t.test(
			'a decision change rejects stale scoped previews and local removal suppresses membership',
			async () => {
				const preview = await json<CategoryPreview>(
						await request(`${base}/decks/${selected}/category-previews`, 'POST', {
							requestId: randomUUID(),
							scope: 'deck',
							mode: 'Reset',
							restoreOriginIds: []
						})
					),
					path = `${base}/decks/${selected}/whole-categories/${old.versionId}`;
				await json(
					await request(path, 'PATCH', {
						requestId: randomUUID(),
						expectedDecisionRevision: (await whole(selected)).decisionRevision,
						name: 'Local historical label'
					})
				);
				assert.equal(
					(
						await request(`${base}/category-previews/${preview.id}/commit`, 'POST', {
							requestId: randomUUID()
						})
					).status,
					409
				);
				await json(
					await request(path, 'DELETE', {
						requestId: randomUUID(),
						expectedDecisionRevision: (await whole(selected)).decisionRevision
					})
				);
				assert.equal((await directory(`?dirCategory=${old.versionId}`)).matchingTotal, 1);
			}
		);
		await t.test(
			'two production processes consume durable composition jobs and stream decks invalidation',
			{ skip: process.env.TEST_WHOLE_TWO_PROCESS !== 'true' },
			async () => {
				const streamingDeck = await makeDeck('Streaming automatic');
				await settled(streamingDeck);
				eventController = new AbortController();
				const stream = await fetch(origin + '/api/account/events', {
					headers: { authorization: `Bearer ${a.token}` },
					signal: eventController.signal
				});
				assert.equal(stream.status, 200);
				const reader = stream.body!.getReader(),
					decoder = new TextDecoder();
				let frames = '';
				async function nextInvalidation() {
					for (;;) {
						let boundary;
						while ((boundary = frames.indexOf('\n\n')) !== -1) {
							const frame = frames.slice(0, boundary);
							frames = frames.slice(boundary + 2);
							if (/event: invalidate\ndata: .*"decks"/.test(frame)) return;
						}
						const part = await reader.read();
						if (part.done) assert.fail('SSE ended before invalidation');
						frames += decoder.decode(part.value, { stream: true });
					}
				}
				const compositionInvalidation = nextInvalidation();
				const creature = (
					await pool.query(
						"SELECT p.document FROM catalog_printings p JOIN catalog_state s ON s.active_generation=p.generation_id JOIN catalog_oracle_facts f ON f.generation_id=p.generation_id AND f.printing_id=p.id WHERE 'Creature'=ANY(f.types) ORDER BY p.id LIMIT 1"
					)
				).rows[0].document;
				await json(
					await request(
						`${base}/decks/${streamingDeck}/cards`,
						'POST',
						{
							catalogCardId: creature.id,
							canonicalCardId: creature.oracle_id,
							name: creature.name,
							setCode: creature.set_code,
							imageUri: creature.image_uri,
							quantity: 1,
							role: 'main',
							requestId: randomUUID()
						},
						a.token,
						false,
						replicaOrigin
					)
				);
				await settled(streamingDeck);
				await Promise.race([
					compositionInvalidation,
					delay(3000).then(() => assert.fail('Replica committed change must reach primary SSE'))
				]);
				await Promise.race([
					nextInvalidation(),
					delay(3000).then(() =>
						assert.fail('Evaluator publication must independently invalidate primary SSE')
					)
				]);
				assert.equal(
					(await whole(streamingDeck)).categories.find(
						(c) => c.definition.name === 'Current creature Deck'
					)?.decision?.truth,
					'True'
				);
				eventController.abort();
			}
		);
		await t.test(
			'native empty adoption explains False membership and retains failed label receipts',
			async () => {
				const actor = await register();
				const decks = await json<{ id: string }[]>(
					await request(
						`${base}/decks`,
						'POST',
						{ name: 'Native empty adoption', format: 'Modern', description: '' },
						actor.token
					)
				);
				const deckId = decks[0].id;
				const definition = await json<LibraryAcknowledgement>(
					await request(
						`${base}/category-definitions`,
						'POST',
						{
							requestId: randomUUID(),
							originId: null,
							expectedLibraryRevision: '0',
							scope: 'deck',
							name: 'Native creatures',
							meaning: 'At least one Main Creature',
							priority: 0,
							displayOrder: 0,
							roles: ['main'],
							rule: {
								op: 'minimumCopies',
								minimum: 1,
								predicate: { op: 'type', value: 'Creature' }
							},
							confirmRetainedRule: false
						},
						actor.token
					)
				);
				const native = (action = '', body?: Record<string, string>) =>
					fetch(`${origin}/mtg/decks?${action ? '/' + action + '&' : ''}deck=${deckId}`, {
						method: body ? 'POST' : 'GET',
						redirect: 'manual',
						headers: { cookie: `spellbook_session=${actor.token}`, origin, accept: 'text/html' },
						body: body ? new URLSearchParams(body) : undefined
					});
				const initial = await native();
				assert.equal(initial.status, 200);
				const initialHTML = await initial.text();
				assert.match(initialHTML, /No whole-deck definitions are adopted/);
				const previewButton = initialHTML
					.replace(/<!--[\s\S]*?-->/g, '')
					.match(/<button[^>]*>\s*Preview whole-deck changes\s*<\/button>/)?.[0];
				assert.ok(previewButton);
				assert.doesNotMatch(previewButton, /disabled/);
				const previewResponse = await native('previewCategories', {
					deckId,
					scope: 'deck',
					mode: 'Review',
					requestId: randomUUID()
				});
				assert.equal(previewResponse.status, 200);
				const previewHTML = await previewResponse.text();
				assert.match(previewHTML, /Automatic False; no membership/);
				assert.doesNotMatch(previewHTML, /Automatic Unknown; no membership/);
				assert.match(previewHTML, /At least one Main Creature/);
				assert.match(previewHTML, /At least 1 copies matching Card type Creature Roles: main/);
				const previewId = previewHTML.match(/name="previewId" value="([^"]+)"/)?.[1];
				assert.ok(previewId);
				const committed = await native('commitCategories', {
					deckId,
					previewId,
					requestId: randomUUID(),
					confirmPreview: 'yes'
				});
				assert.equal(committed.status, 200);
				const before = await json<DeckWholeCategories>(
					await request(`${base}/decks/${deckId}/whole-categories`, 'GET', undefined, actor.token)
				);
				await json(
					await request(
						`${base}/decks/${deckId}/whole-categories/${definition.versionId}`,
						'PATCH',
						{
							requestId: randomUUID(),
							manual: 'Include',
							expectedDecisionRevision: before.decisionRevision
						},
						actor.token
					)
				);
				const requestId = randomUUID();
				const failed = await native('renameWholeCategory', {
					deckId,
					versionId: definition.versionId,
					requestId,
					expectedDecisionRevision: before.decisionRevision,
					name: 'Native retained failed label',
					draftKind: 'rename'
				});
				assert.equal(failed.status, 409);
				const recovery = await failed.text();
				assert.match(recovery, /value="Native retained failed label"/);
				assert.ok(recovery.includes(`name="requestId" value="${requestId}"`));
				assert.ok(
					recovery.includes(`name="expectedDecisionRevision" value="${before.decisionRevision}"`)
				);
			}
		);
		await t.test(
			'revocation while a whole-category write waits on Profile prevents its receipt and publication',
			async () => {
				const login = await fixtureAuthRequest(
					origin,
					'/api/auth/login',
					{ username: a.username, password: 'whole-category-http-password' },
					{}
				);
				assert.equal(login.status, 200);
				const disposable = await login.json();
				const state = await whole(other),
					requestId = randomUUID(),
					held = await pool.connect();
				await held.query('BEGIN');
				await held.query('SELECT account_id FROM user_profiles WHERE account_id=$1 FOR UPDATE', [
					a.user.accountId
				]);
				const mutation = request(
					`${base}/decks/${other}/whole-categories/${old.versionId}`,
					'PATCH',
					{ requestId, expectedDecisionRevision: state.decisionRevision, manual: 'Exclude' },
					disposable.token
				);
				try {
					await waitFor(
						async () =>
							(
								await pool.query(
									"SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND strpos(query,'user_profiles')>0"
								)
							).rowCount! > 0,
						'Whole-category write must wait on Profile',
						1500
					);
					assert.equal(
						(await request('/api/auth/logout', 'POST', {}, disposable.token)).status,
						204
					);
					await held.query('COMMIT');
					assert.equal((await mutation).status, 401);
					assert.equal(
						(
							await pool.query(
								'SELECT 1 FROM category_mutation_requests WHERE request_id=$1 AND account_id=$2',
								[requestId, a.user.accountId]
							)
						).rowCount,
						0
					);
					assert.deepEqual(await whole(other), state);
				} finally {
					await held.query('ROLLBACK');
					held.release();
					await mutation;
				}
			}
		);
		t.diagnostic(
			'Native verifier checks recorded public Catalog digests/counts. Cleanup restores prior publication. Provider freshness, browser and deployment are separate evidence.'
		);
	} finally {
		eventController?.abort();
		try {
			for (const child of children) await stopHttpApplication(child);
			if (children.length) {
				await rm(new URL('build/', cwd), { recursive: true, force: true });
				await cp(new URL('primary/', artifacts), new URL('build/', cwd), { recursive: true });
			}
			if (accounts.length)
				await pool.query('DELETE FROM user_profiles WHERE account_id=ANY($1::text[])', [accounts]);
		} finally {
			try {
				await restore?.();
			} finally {
				await pool.end();
			}
		}
	}
});
