import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { scanFixture } from '../fixtures/scan.ts';
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('atomic authorized Scan review', () => {
	let f: Awaited<ReturnType<typeof scanFixture>>;
	beforeAll(async () => {
		f = await scanFixture();
	});
	afterAll(async () => {
		await f.close();
	});
	it.each(['open', 'pending_review'])(
		'allows manual review in %s and uses Catalog identity',
		async (state) => {
			const a = await f.account(),
				s = await f.artifact(a.user, state);
			const ack = await f.scan.commitReview(a.user, f.intent(s));
			expect(ack).toMatchObject({
				kind: 'Committed',
				acknowledgement: { changes: [{ quantity: 2, delta: 2 }] }
			});
			const result = await f.scan.readSession(a.user, { sessionId: s.sessionId });
			expect(result.reviewItems[0]).toMatchObject({
				name: f.card.name,
				canonicalCardId: f.card.canonicalCardId,
				matchReason: 'manual_review'
			});
		}
	);
	it.each(['cancelled', 'committed'])('rejects fresh review in %s', async (state) => {
		const a = await f.account(),
			s = await f.artifact(a.user, state);
		await expect(f.scan.commitReview(a.user, f.intent(s))).rejects.toMatchObject({
			kind: 'ScanClosed'
		});
		expect(await f.copyCount(a.user)).toBe(0);
	});
	it('rejects foreign/mismatched artifacts and duplicate review identities atomically', async () => {
		const a = await f.account(),
			b = await f.account(),
			own = await f.artifact(a.user),
			other = await f.artifact(b.user),
			another = await f.artifact(a.user);
		for (const bad of [other, another])
			await expect(
				f.scan.commitReview(a.user, {
					...f.intent(own),
					items: [f.intent(own).items[0], { ...f.intent(bad).items[0] }]
				})
			).rejects.toMatchObject({ kind: 'ScanNotFound' });
		const input = f.intent(own);
		await expect(
			f.scan.commitReview(a.user, { ...input, items: [input.items[0], input.items[0]] })
		).rejects.toThrow('Duplicate');
		expect(await f.copyCount(a.user)).toBe(0);
		expect((await f.scan.readSession(a.user, { sessionId: own.sessionId })).reviewItems).toEqual(
			[]
		);
	});
	it('rejects a review ID already owned by another account', async () => {
		const a = await f.account(),
			b = await f.account(),
			own = await f.artifact(a.user),
			other = await f.artifact(b.user),
			id = crypto.randomUUID();
		const first = f.intent(other);
		first.items[0] = { ...first.items[0], id } as (typeof first.items)[0];
		await f.scan.commitReview(b.user, first);
		await expect(
			f.scan.commitReview(a.user, { ...f.intent(own), items: [{ ...f.intent(own).items[0], id }] })
		).rejects.toThrow('another artifact');
		expect(
			(await f.scan.readSession(b.user, { sessionId: other.sessionId })).reviewItems[0].id
		).toBe(id);
	});
	it.each(['scan_sessions', 'inventory_mutation_requests'])(
		'rolls back staged review and Inventory effects on final %s failure',
		async (table) => {
			const a = await f.account(),
				s = await f.artifact(a.user),
				name = `scan_fail_${crypto.randomUUID().replaceAll('-', '')}`;
			const operation = table === 'scan_sessions' ? 'UPDATE' : 'INSERT';
			await f.pool.query(
				`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.account_id = '${a.user.accountId}' THEN RAISE EXCEPTION 'fixture rollback'; END IF; RETURN NEW; END $$`
			);
			await f.pool.query(
				`CREATE TRIGGER ${name} BEFORE ${operation} ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}()`
			);
			try {
				await expect(f.scan.commitReview(a.user, f.intent(s))).rejects.toThrow();
				const saved = await f.scan.readSession(a.user, { sessionId: s.sessionId });
				expect(saved.session.status).toBe('pending_review');
				expect(saved.reviewItems).toEqual([]);
				expect(await f.copyCount(a.user)).toBe(0);
			} finally {
				await f.pool.query(`DROP TRIGGER ${name} ON ${table}`);
				await f.pool.query(`DROP FUNCTION ${name}()`);
			}
		}
	);
	it('replays five concurrent attempts and original receipt after later removal, without Catalog resolution', async () => {
		const a = await f.account(),
			s = await f.artifact(a.user),
			input = f.intent(s);
		const results = await Promise.all(
			Array.from({ length: 5 }, () => f.scan.commitReview(a.user, input))
		);
		for (const replay of results) expect(replay).toEqual(results[0]);
		expect(await f.copyCount(a.user)).toBe(2);
		const first = results[0];
		if (first.kind !== 'Committed') throw Error('Missing original receipt');
		await f.inventory.remove(a.user, {
			requestId: crypto.randomUUID(),
			entryId: first.acknowledgement.changes[0].entryId,
			expectedQuantity: 2
		});
		expect(await f.scan.commitReview(a.user, input)).toEqual(first);
		await expect(
			f.scan.commitReview(a.user, { ...input, items: [{ ...input.items[0], quantity: 3 }] })
		).rejects.toThrow('different mutation');
		const another = await f.artifact(a.user);
		await expect(
			f.scan.commitReview(a.user, { ...f.intent(another), requestId: input.requestId })
		).rejects.toThrow('different mutation');
	});
	it('serializes quantity, Notes and group changes with Scan under the parent lock', async () => {
		const a = await f.account();
		const added = await f.inventory.add(a.user, {
			requestId: crypto.randomUUID(),
			catalogCardId: f.card.catalogCardId,
			quantity: 2,
			finish: 'nonfoil',
			condition: 'NM'
		});
		const entryId = added.changes[0].entryId;
		const group = await f.inventory.createGroup(a.user, {
			requestId: crypto.randomUUID(),
			name: 'Scan race'
		});
		const s = await f.artifact(a.user);
		await Promise.all([
			f.scan.commitReview(a.user, f.intent(s)),
			f.inventory.patchEntry(a.user, {
				requestId: crypto.randomUUID(),
				entryId,
				delta: 1,
				notes: 'independent Notes',
				notesRevision: '0'
			}),
			f.inventory.replaceMemberships(a.user, {
				requestId: crypto.randomUUID(),
				entryId,
				groupIds: [group.groups[0].groupId]
			})
		]);
		const current = await f.inventory.getEntry(a.user, entryId);
		expect(current?.entry).toMatchObject({
			quantity: 5,
			notes: 'independent Notes',
			notesRevision: '1'
		});
		expect(current?.memberships).toEqual([group.groups[0].groupId]);
	});
});
