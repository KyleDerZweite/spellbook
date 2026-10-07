import { randomUUID } from 'node:crypto';
import {
	createDatabase,
	createCatalog,
	createLocalAuth,
	createInventory,
	createInventoryMutations
} from '@spellbook/backend';
import { createScan } from '@spellbook/backend/scan/application.ts';
import { ensureDeckCatalogFixture } from '../deck-catalog-fixture.ts';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
export async function scanFixture() {
	const url = process.env.TEST_DATABASE_URL;
	if (
		!url ||
		url !== process.env.DATABASE_URL ||
		new URL(url).pathname !==
			'/' +
				(process.env.TEST_SCAN_DATABASE_NAME ??
					(process.env.CI ? 'spellbook_test' : 'spellbook_scan_contracts_07_20261007'))
	)
		throw new Error('Scan tests require matching disposable database URLs');
	const database = createDatabase(url),
		auth = createLocalAuth(database.db, { demoMode: false }),
		catalog = createCatalog(database.pool);
	const storageDir = resolve(process.cwd(), '../.local/scan-tests', randomUUID());
	await mkdir(storageDir, { recursive: true });
	const scan = createScan(database.db, database.pool, catalog, auth, {
		storageDriver: 'local',
		localStorageDir: storageDir,
		workerUrl: process.env.SCAN_WORKER_URL
	});
	const inventory = {
		...createInventory(database.pool, auth),
		...createInventoryMutations(database.db, catalog, auth)
	};
	const card = await ensureDeckCatalogFixture(database.pool);
	const accounts: string[] = [];
	async function account() {
		const result = (await auth.authenticate(
			'register',
			`scan_${randomUUID().slice(0, 8)}`,
			'scan-fixture-private-password'
		))!;
		accounts.push(result.user.accountId);
		return result;
	}
	async function artifact(
		actor: AuthUser,
		state = 'pending_review',
		status = 'no_match',
		candidates: unknown[] = []
	) {
		const session = await scan.createSession(actor),
			id = randomUUID(),
			key = `scan-sessions/${session.id}/${id}.png`;
		await database.pool.query(
			"INSERT INTO scan_artifacts(id,session_id,account_id,original_object_key,normalized_object_key,quality_score,embedding_model_version,ocr_model_version,status,candidate_json) VALUES($1,$2,$3,$4,$4,0,'fixture-v1','fixture-v1',$5,$6)",
			[id, session.id, actor.accountId, key, status, JSON.stringify(candidates)]
		);
		await database.pool.query('UPDATE scan_sessions SET status=$1 WHERE id=$2', [
			state,
			session.id
		]);
		return { sessionId: session.id, id, key };
	}
	function intent(artifact: { sessionId: string; id: string }, quantity = 2) {
		return {
			requestId: randomUUID(),
			sessionId: artifact.sessionId,
			items: [
				{
					scanArtifactId: artifact.id,
					catalogCardId: card.catalogCardId,
					quantity,
					finish: 'nonfoil',
					condition: 'NM'
				}
			]
		};
	}
	async function copyCount(actor: AuthUser) {
		const page = await inventory.page(actor, {});
		if (page.kind !== 'Page') throw new Error('Unexpected Inventory drift');
		return page.totals.copyCount;
	}
	async function close() {
		scan.close();
		await database.pool.query(
			'DELETE FROM inventory_mutation_requests WHERE account_id=ANY($1::text[])',
			[accounts]
		);
		await database.pool.query('DELETE FROM user_profiles WHERE account_id=ANY($1::text[])', [
			accounts
		]);
		await database.pool.end();
		await rm(storageDir, { force: true, recursive: true });
	}
	return {
		...database,
		auth,
		catalog,
		scan,
		inventory,
		card,
		storageDir,
		account,
		artifact,
		intent,
		copyCount,
		close
	};
}
