import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { scanFixture } from '../fixtures/scan.ts';
import { mutationFingerprint } from '@spellbook/backend/decks/request-fingerprint.ts';
import { assertInventoryOperation } from '@spellbook/backend/mtg/validation.ts';
import type { ScanReviewCommitItem } from '@spellbook/contracts/scan.ts';
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('immutable original Scan replay evidence', () => {
	let f: Awaited<ReturnType<typeof scanFixture>>;
	beforeAll(async () => {
		f = await scanFixture();
	});
	afterAll(async () => {
		await f.close();
	});
	it.each([
		{ version: 'scan-v1' as const, savedAck: false },
		{ version: 'scan-v2' as const, savedAck: false },
		{ version: 'scan-v1' as const, savedAck: true },
		{ version: 'scan-v2' as const, savedAck: true }
	])(
		'verifies $version retained submissions after Catalog pruning with saved acknowledgement $savedAck',
		async ({ version, savedAck }) => {
			const a = await f.account(),
				s = await f.artifact(a.user),
				input = f.intent(s);
			const old: ScanReviewCommitItem = {
				...input.items[0],
				sessionId: s.sessionId,
				canonicalCardId: f.card.canonicalCardId,
				name: 'Original submitted display',
				oracleId: f.card.canonicalCardId,
				setCode: 'OLD',
				collectorNumber: '17',
				imageUri: 'https://example.test/original.jpg',
				similarityScore: 11,
				ocrScore: 21,
				finalScore: 31,
				matchReason: 'original evidence'
			};
			const envelope =
				version === 'scan-v1'
					? {
							kind: 'scan_review',
							sessionId: s.sessionId,
							artifacts: [s.id],
							operations: [
								assertInventoryOperation({
									op: 'add',
									card: old,
									quantity: 2,
									finish: 'nonfoil',
									condition: 'NM'
								})
							]
						}
					: {
							kind: 'scan_review',
							scan: {
								sessionId: s.sessionId,
								items: [
									{
										sessionId: s.sessionId,
										scanArtifactId: s.id,
										catalogCardId: f.card.catalogCardId,
										similarityScore: 11,
										ocrScore: 21,
										finalScore: 31,
										matchReason: 'original evidence',
										finish: 'nonfoil',
										condition: 'NM',
										quantity: 2
									}
								]
							},
							source: 'scan_review',
							operations: [
								{
									op: 'add',
									catalogCardId: f.card.catalogCardId,
									finish: 'nonfoil',
									condition: 'NM',
									quantity: 2
								}
							]
						};
			const hash = mutationFingerprint(envelope);
			const originalAck = savedAck
				? {
						requestId: input.requestId,
						inventoryId: crypto.randomUUID(),
						revision: '17',
						changes: [],
						removedEntryIds: [],
						groups: [],
						removedGroupIds: [],
						memberships: []
					}
				: null;
			await f.pool.query(
				"INSERT INTO inventory_mutation_requests(account_id,request_id,request_hash,source,status,acknowledgement) VALUES($1,$2,$3,'scan_review','applied',$4)",
				[
					a.user.accountId,
					input.requestId,
					hash,
					originalAck === null ? null : JSON.stringify(originalAck)
				]
			);
			const previous = (
				await f.pool.query('SELECT active_generation FROM catalog_state WHERE id=1')
			).rows[0].active_generation;
			await f.pool.query('UPDATE catalog_state SET active_generation=NULL WHERE id=1');
			try {
				const replay = await f.scan.commitReview(a.user, {
					...input,
					legacyVerification: { version, items: [old] }
				});
				expect(replay).toEqual(
					originalAck
						? { kind: 'Committed', sessionId: s.sessionId, acknowledgement: originalAck }
						: {
								kind: 'LegacyNoRepeat',
								requestId: input.requestId,
								binding: 'VerifiedLegacyHash',
								acknowledgement: {
									requestId: input.requestId,
									inventoryId: null,
									revision: '0',
									changes: [],
									removedEntryIds: [],
									groups: [],
									removedGroupIds: [],
									memberships: [],
									legacy: true
								}
							}
				);
				await expect(f.scan.commitReview(a.user, input)).rejects.toMatchObject({
					kind: 'LegacyReplayEvidenceRequired'
				});
				const altered = {
					...old,
					...(version === 'scan-v1' ? { name: 'Changed display' } : { finalScore: 32 })
				};
				await expect(
					f.scan.commitReview(a.user, {
						...input,
						legacyVerification: { version, items: [altered] }
					})
				).rejects.toThrow('different mutation');
				await expect(
					f.scan.commitReview(a.user, {
						...input,
						items: [{ ...input.items[0], quantity: 3 }],
						legacyVerification: { version, items: [old] }
					})
				).rejects.toThrow('different mutation');
				expect((await f.scan.readSession(a.user, { sessionId: s.sessionId })).session.status).toBe(
					'pending_review'
				);
				const receipt = (
					await f.pool.query(
						'SELECT request_hash,acknowledgement FROM inventory_mutation_requests WHERE account_id=$1 AND request_id=$2',
						[a.user.accountId, input.requestId]
					)
				).rows[0];
				expect(receipt).toEqual({ request_hash: hash, acknowledgement: originalAck });
			} finally {
				await f.pool.query('UPDATE catalog_state SET active_generation=$1 WHERE id=1', [previous]);
			}
		}
	);
	it('exposes null-hash binding limits without reapplying or claiming another session was committed', async () => {
		const a = await f.account(),
			s = await f.artifact(a.user),
			other = await f.artifact(a.user),
			input = f.intent(s);
		await f.pool.query(
			"INSERT INTO inventory_mutation_requests(account_id,request_id,source,status) VALUES($1,$2,'scan_review','applied')",
			[a.user.accountId, input.requestId]
		);
		const replay = await f.scan.commitReview(a.user, {
			...f.intent(other, 9),
			requestId: input.requestId
		});
		expect(replay).toMatchObject({
			kind: 'LegacyNoRepeat',
			binding: 'UnverifiedLegacyHash',
			acknowledgement: { legacy: true, changes: [] }
		});
		expect(replay).not.toHaveProperty('sessionId');
		expect(await f.copyCount(a.user)).toBe(0);
		await f.auth.revokeSession(a.session.token);
		await expect(f.scan.commitReview(a.user, input)).rejects.toMatchObject({
			kind: 'Unauthenticated'
		});
	});
	it('rejects reuse of other Inventory receipt kinds even with null hashes', async () => {
		const a = await f.account(),
			s = await f.artifact(a.user),
			input = f.intent(s);
		await f.pool.query(
			"INSERT INTO inventory_mutation_requests(account_id,request_id,source,status) VALUES($1,$2,'web','applied')",
			[a.user.accountId, input.requestId]
		);
		await expect(f.scan.commitReview(a.user, input)).rejects.toThrow('different mutation');
		expect(await f.copyCount(a.user)).toBe(0);
	});
});
