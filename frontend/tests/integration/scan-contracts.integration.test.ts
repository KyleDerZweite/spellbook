import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase, createLocalAuth, createCatalog } from '@spellbook/backend';
import { ensureDeckCatalogFixture } from '../deck-catalog-fixture.ts';
import { createScan } from '@spellbook/backend/scan/application.ts';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('owned Scan application contracts', () => {
	const database = createDatabase(process.env.TEST_DATABASE_URL!);
	const auth = createLocalAuth(database.db, { demoMode: false });
	const scan = createScan(database.db, database.pool, createCatalog(database.pool), auth, {
		storageDriver: 'local',
		localStorageDir: process.env.SCAN_LOCAL_STORAGE_DIR!,
		workerUrl: process.env.SCAN_WORKER_URL!
	});
	const accounts: string[] = [];
	afterAll(async () => {
		await database.pool.query('DELETE FROM user_profiles WHERE account_id=ANY($1::text[])', [
			accounts
		]);
		await database.pool.end();
	});
	it('lists only owned safe sessions and rejects fabricated or revoked authority', async () => {
		const account = (await auth.authenticate(
			'register',
			`scan_${crypto.randomUUID().slice(0, 8)}`,
			'scan-contract-test-password'
		))!;
		accounts.push(account.user.accountId);
		const session = await scan.createSession(account.user);
		expect(session).toMatchObject({ game: 'mtg', status: 'open' });
		expect(typeof session.createdAt).toBe('string');
		expect(session).not.toHaveProperty('accountId');
		expect(await scan.listSessions(account.user)).toEqual([session]);
		await expect(scan.listSessions({ ...account.user })).rejects.toMatchObject({
			kind: 'Unauthenticated'
		});
		await auth.revokeSession(account.session.token);
		await expect(scan.readSession(account.user, { sessionId: session.id })).rejects.toMatchObject({
			kind: 'Unauthenticated'
		});
	});
	it('uses the actual worker no-match result without exposing keys, then commits manual Catalog intent exactly once', async () => {
		const account = (await auth.authenticate(
			'register',
			`manual_${crypto.randomUUID().slice(0, 8)}`,
			'scan-contract-test-password'
		))!;
		accounts.push(account.user.accountId);
		const card = await ensureDeckCatalogFixture(database.pool);
		const session = await scan.createSession(account.user);
		const uploaded = await scan.uploadFrame(account.user, {
			sessionId: session.id,
			bytes: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
			contentType: 'image/png',
			fileName: 'card.png'
		});
		expect(uploaded.result).toMatchObject({ status: 'no_match', qualityScore: 0, candidates: [] });
		expect(uploaded.result).not.toHaveProperty('normalizedObjectKey');
		const result = await scan.readSession(account.user, { sessionId: session.id });
		expect(result.lastResult?.artifactId).toBe(uploaded.artifact.id);
		expect(result.artifacts[0]).not.toHaveProperty('originalObjectKey');
		const intent = {
			requestId: crypto.randomUUID(),
			sessionId: session.id,
			items: [
				{
					scanArtifactId: uploaded.artifact.id,
					catalogCardId: card.catalogCardId,
					quantity: 2,
					finish: 'nonfoil',
					condition: 'NM'
				}
			]
		};
		const saved = await scan.commitReview(account.user, intent);
		expect(saved).toMatchObject({
			kind: 'Committed',
			sessionId: session.id,
			acknowledgement: { changes: [{ quantity: 2, delta: 2 }] }
		});
		expect(await scan.commitReview(account.user, intent)).toEqual(saved);
		expect((await scan.readSession(account.user, { sessionId: session.id })).session.status).toBe(
			'committed'
		);
	});
});
