import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { createDemoPool, seedDemo, publishDemoCatalog } from '@spellbook/backend/operators/demo.ts';
import { setLocalPassword } from '@spellbook/backend/operators/local-password.ts';
import { verifyPassword } from '@spellbook/backend/auth/password.ts';
import { verifyBundle, bundleBatches } from './catalog-bundle.mjs';
import { precon } from './precon.mjs';
import { legacyInventory } from './replace-inventory.mjs';

const url = process.env.TEST_DATABASE_URL;
const frontend = new URL('../../', import.meta.url);
function cli(script, args = [], input = '', databaseUrl = url) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [script, ...args], {
			cwd: frontend,
			env: { ...process.env, DATABASE_URL: databaseUrl },
			stdio: ['pipe', 'pipe', 'pipe']
		});
		let stdout = '',
			stderr = '';
		child.stdout.on('data', (chunk) => (stdout += chunk));
		child.stderr.on('data', (chunk) => (stderr += chunk));
		child.once('error', reject);
		child.once('exit', (code) => resolve({ code, stdout, stderr }));
		child.stdin.end(input);
	});
}

test(
	'native operators preserve rollback, accounts, recovery and preview/apply semantics',
	{ skip: !url, timeout: 300_000 },
	async () => {
		const pool = createDemoPool(url);
		const client = await pool.connect();
		const owned = new Set();
		const ownedGenerations = new Set();
		try {
			assert.equal(
				(await client.query('SELECT count(*)::int AS n FROM user_profiles')).rows[0].n,
				0,
				'Requires an empty disposable database'
			);
			assert.equal(
				(await client.query('SELECT count(*)::int AS n FROM catalog_generations')).rows[0].n,
				0,
				'Requires an empty disposable Catalog'
			);
			const generation = randomUUID();
			ownedGenerations.add(generation);
			const document = precon.cards[0].card;
			const brokenBundle = {
				manifest: {
					generationId: generation,
					bundleVersion: '2026-10-07T00:00:00Z',
					catalogTransformVersion: 2,
					counts: { documents: 1 }
				},
				batches: (async function* () {
					yield [
						{
							document,
							search_name: document.normalized_name,
							search_text: '',
							raw_oracle_id: document.oracle_id,
							types: document.card_types
						}
					];
					throw new Error('Decoded digest verification failed');
				})()
			};
			await assert.rejects(seedDemo(url, { bundle: brokenBundle, precon }), /rolled back/);
			assert.equal(
				(await client.query('SELECT count(*)::int AS n FROM catalog_generations')).rows[0].n,
				0
			);
			assert.equal(
				(await client.query('SELECT count(*)::int AS n FROM user_profiles')).rows[0].n,
				0
			);

			const seeded = await cli('scripts/demo/seed.mjs');
			assert.equal(seeded.code, 0, seeded.stderr);
			assert.equal(seeded.stdout.trim(), 'Demo ready. Username: demo. Password: demo.');
			const account = (
				await client.query("SELECT account_id FROM user_profiles WHERE username='demo'")
			).rows[0].account_id;
			owned.add(account);
			const verified = await verifyBundle();
			ownedGenerations.add(verified.manifest.generationId);
			const inventory = (
				await client.query('SELECT id FROM inventories WHERE account_id=$1', [account])
			).rows[0].id;
			assert.deepEqual(
				(
					await client.query(
						'SELECT count(*)::int AS entries,sum(quantity)::int AS copies FROM inventory_cards WHERE inventory_id=$1',
						[inventory]
					)
				).rows[0],
				{ entries: 76, copies: 101 }
			);
			assert.equal(
				(
					await client.query('SELECT sum(quantity)::int AS n FROM deck_cards WHERE account_id=$1', [
						account
					])
				).rows[0].n,
				100
			);
			await client.query(
				"UPDATE inventory_cards SET notes='owned edit' WHERE inventory_id=$1 AND spellbook_position=0",
				[inventory]
			);
			const fingerprint = async () =>
				JSON.stringify(
					(
						await client.query(`SELECT
   (SELECT jsonb_agg(p ORDER BY p.account_id) FROM user_profiles p) profiles,
   (SELECT jsonb_agg(c ORDER BY c.id) FROM inventory_cards c) cards,
   (SELECT jsonb_agg(d ORDER BY d.id) FROM decks d) decks,
   (SELECT jsonb_agg(s ORDER BY s.id) FROM catalog_state s) catalog`)
					).rows
				);
			const saved = await fingerprint();
			const preserved = await cli('scripts/demo/seed.mjs');
			assert.equal(preserved.code, 0, preserved.stderr);
			assert.equal(preserved.stdout.trim(), 'Demo is already seeded. Existing edits preserved.');
			assert.equal(await fingerprint(), saved);
			await client.query('BEGIN');
			await assert.rejects(
				publishDemoCatalog(client, {
					manifest: verified.manifest,
					batches: (async function* () {
						throw new Error('Rerun payload rejected');
					})()
				}),
				/Rerun payload/
			);
			await client.query('ROLLBACK');
			assert.equal(await fingerprint(), saved);

			const privateAccount = randomUUID();
			owned.add(privateAccount);
			await client.query(
				"INSERT INTO user_profiles(account_id,username) VALUES($1,'private_owner')",
				[privateAccount]
			);
			await client.query(
				"INSERT INTO local_credentials(account_id,username,password_hash) VALUES($1,'private_owner','test-only')",
				[privateAccount]
			);
			const privateSaved = await fingerprint();
			const refused = await cli('scripts/demo/seed.mjs');
			assert.notEqual(refused.code, 0);
			assert.ok(refused.stderr.includes('transaction rolled back'));
			assert.equal(await fingerprint(), privateSaved);

			const sessionId = randomUUID();
			await client.query(
				"INSERT INTO auth_sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
				[sessionId, account]
			);
			// Percent-encoded database names resolve to this assigned database without a Demo suffix match.
			const recoveryUrl = new URL(url);
			recoveryUrl.pathname = recoveryUrl.pathname.slice(0, -1) + '%6e';
			const password = 'native-recovery-password';
			const recovered = await cli(
				'scripts/set-local-password.mjs',
				[account, ' Renamed_Demo '],
				password + '\r\n',
				recoveryUrl.href
			);
			assert.equal(recovered.code, 0, recovered.stderr);
			assert.equal(recovered.stdout.trim(), 'Local credentials saved. Existing sessions revoked.');
			assert.equal(
				(await client.query('SELECT username FROM user_profiles WHERE account_id=$1', [account]))
					.rows[0].username,
				'renamed_demo'
			);
			const credential = (
				await client.query(
					'SELECT username,password_hash FROM local_credentials WHERE account_id=$1',
					[account]
				)
			).rows[0];
			assert.equal(credential.username, 'renamed_demo');
			assert.ok(await verifyPassword(password, credential.password_hash));
			assert.equal(
				(
					await client.query('SELECT count(*)::int AS n FROM auth_sessions WHERE account_id=$1', [
						account
					])
				).rows[0].n,
				0
			);
			await client.query(
				"INSERT INTO auth_sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
				[randomUUID(), account]
			);
			const beforeConflict = JSON.stringify(
				(await client.query('SELECT * FROM local_credentials WHERE account_id=$1', [account])).rows
			);
			await assert.rejects(
				setLocalPassword(url, { accountId: account, username: 'private_owner', password }),
				/transaction rolled back/
			);
			assert.equal(
				JSON.stringify(
					(await client.query('SELECT * FROM local_credentials WHERE account_id=$1', [account]))
						.rows
				),
				beforeConflict
			);
			assert.equal(
				(
					await client.query('SELECT count(*)::int AS n FROM auth_sessions WHERE account_id=$1', [
						account
					])
				).rows[0].n,
				1
			);
			await assert.rejects(
				setLocalPassword(url, { accountId: randomUUID(), username: 'missing_account', password }),
				/Account does not exist/
			);
			for (const input of ['short\n', 'x'.repeat(131)]) {
				const invalid = await cli(
					'scripts/set-local-password.mjs',
					[account, 'renamed_demo'],
					input
				);
				assert.notEqual(invalid.code, 0);
				assert.equal(
					JSON.stringify(
						(await client.query('SELECT * FROM local_credentials WHERE account_id=$1', [account]))
							.rows
					),
					beforeConflict
				);
			}

			const reset = await cli('scripts/demo/seed.mjs', ['--reset-users']);
			assert.equal(reset.code, 0, reset.stderr);
			assert.equal(
				(await client.query('SELECT count(*)::int AS n FROM user_profiles')).rows[0].n,
				1
			);
			const fresh = (
				await client.query("SELECT account_id FROM user_profiles WHERE username='demo'")
			).rows[0].account_id;
			owned.add(fresh);
			const freshInventory = (
				await client.query('SELECT id FROM inventories WHERE account_id=$1', [fresh])
			).rows[0].id;
			await client.query('DELETE FROM decks WHERE account_id=$1', [fresh]);
			await client.query('DELETE FROM inventory_cards WHERE inventory_id=$1', [freshInventory]);
			await client.query('UPDATE inventories SET revision=0 WHERE id=$1', [freshInventory]);
			for (const e of await legacyInventory())
				await client.query(
					`INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,finish,condition,spellbook_position,notes)
   VALUES($1,$2,$3,'mtg',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
					[
						randomUUID(),
						freshInventory,
						fresh,
						e.catalog_card_id,
						e.canonical_card_id,
						e.name,
						e.set_code,
						e.image_uri,
						e.quantity,
						e.finish,
						e.condition,
						e.spellbook_position,
						e.notes
					]
				);
			const legacySaved = await fingerprint();
			const preview = await cli('scripts/demo/replace-inventory.mjs');
			assert.equal(preview.code, 0, preview.stderr);
			assert.equal(JSON.parse(preview.stdout).status, 'preview');
			assert.equal(await fingerprint(), legacySaved);
			const apply = await cli('scripts/demo/replace-inventory.mjs', ['--apply']);
			assert.equal(apply.code, 0, apply.stderr);
			assert.equal(JSON.parse(apply.stdout).status, 'applied');
			assert.deepEqual(
				(
					await client.query(
						'SELECT count(*)::int AS entries,sum(quantity)::int AS copies FROM inventory_cards WHERE inventory_id=$1',
						[freshInventory]
					)
				).rows[0],
				{ entries: 76, copies: 101 }
			);
			assert.equal(
				(await client.query('SELECT revision FROM inventories WHERE id=$1', [freshInventory]))
					.rows[0].revision,
				'1'
			);
		} finally {
			await client.query('ROLLBACK');
			for (const account of owned)
				await client.query('DELETE FROM user_profiles WHERE account_id=$1', [account]);
			for (const generation of ownedGenerations) {
				await client.query(
					'UPDATE catalog_state SET active_generation=NULL,previous_generation=NULL WHERE active_generation=$1 OR previous_generation=$1',
					[generation]
				);
				await client.query('DELETE FROM catalog_generations WHERE id=$1', [generation]);
			}
			client.release();
			await pool.end();
		}
	}
);

test(
	'native password CLI accepts exact bounds and revokes every owned session',
	{ skip: !url },
	async () => {
		const pool = createDemoPool(url);
		const account = randomUUID(),
			privateAccount = randomUUID();
		try {
			await pool.query(
				"INSERT INTO user_profiles(account_id,username) VALUES($1,'bounds_owner'),($2,'other_owner')",
				[account, privateAccount]
			);
			for (const owner of [account, account, account, privateAccount])
				await pool.query(
					"INSERT INTO auth_sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
					[randomUUID(), owner]
				);
			for (const length of [12, 128]) {
				const password = 'p'.repeat(length);
				const result = await cli(
					'scripts/set-local-password.mjs',
					[account, 'bounds_owner'],
					password + '\r\n'
				);
				assert.equal(result.code, 0, result.stderr);
				const credential = (
					await pool.query('SELECT password_hash FROM local_credentials WHERE account_id=$1', [
						account
					])
				).rows[0];
				assert.ok(await verifyPassword(password, credential.password_hash));
			}
			assert.equal(
				(
					await pool.query('SELECT count(*)::int AS n FROM auth_sessions WHERE account_id=$1', [
						account
					])
				).rows[0].n,
				0
			);
			assert.equal(
				(
					await pool.query('SELECT count(*)::int AS n FROM auth_sessions WHERE account_id=$1', [
						privateAccount
					])
				).rows[0].n,
				1
			);
		} finally {
			await pool.query('DELETE FROM user_profiles WHERE account_id=ANY($1::text[])', [
				[account, privateAccount]
			]);
			await pool.end();
		}
	}
);
