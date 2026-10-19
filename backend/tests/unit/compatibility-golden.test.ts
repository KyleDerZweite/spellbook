import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import golden from '../../../contracts/compatibility/golden.json' with { type: 'json' };
import { validPassword, verifyPassword } from '../../src/auth/password.ts';
import { hashSessionToken } from '../../src/auth/session.ts';
import { mutationFingerprint, RequestConflictError } from '../../src/decks/request-fingerprint.ts';
import { databaseInteger } from '../../src/db/numbers.ts';
import { createDatabase } from '../../src/db/client.ts';
import { createInventoryMutations, createInventoryWriter } from '../../src/inventory/mutations.ts';
import {
	CategoryConflict,
	CategoryMergeConflict,
	DescriptionConflictError,
	InventoryQuantityChangedError,
	LibraryConflict,
	NotesConflictError
} from '../../src/transport.ts';
import { errorResponse } from '../../src/http/errors.ts';
import { selectedToken } from '../../src/http/auth.ts';
import {
	readFormData,
	readJsonObject,
	readNumber,
	readQueryInteger
} from '../../src/http/request.ts';
import { createHttpFixture, user } from './http-fixture.ts';

const origin = 'https://spellbook.test';
const lifetime = await createHttpFixture();
const { db, pool } = createDatabase('postgres://unused:unused@localhost:1/unused');
afterAll(async () => {
	await lifetime.close();
	await pool.end();
});
const auth = { requireActor: vi.fn(async () => user) };
const writer = createInventoryWriter(db, lifetime.application.catalog, auth);
const uuid = '11111111-1111-4111-8111-111111111111';
// This is only the existing Drizzle select seam, not transaction/SQL evidence.
function recorded(rows: unknown[]) {
	vi.spyOn(db, 'select').mockReturnValue({
		from: () => ({ where: () => ({ limit: async () => rows }) })
	} as unknown as ReturnType<typeof db.select>);
}

function request(body: string | Uint8Array<ArrayBuffer>, contentType: string) {
	return new Request(origin, {
		method: 'POST',
		headers: { 'content-type': contentType },
		body
	});
}

describe('neutral compatibility golden vectors, Node direct evidence', () => {
	for (const vector of golden.credentials) {
		it(vector.id, async () => {
			expect(await verifyPassword(vector.password, vector.hash)).toBe(true);
			expect(await verifyPassword(vector.password + 'wrong', vector.hash)).toBe(false);
			expect(await verifyPassword(vector.password, vector.hash.toUpperCase())).toBe(false);
		});
	}
	it('credential-missing-and-malformed', async () => {
		expect(await verifyPassword('synthetic password', null)).toBe(false);
		expect(await verifyPassword('synthetic password', 'scrypt$bad$bad')).toBe(false);
	});
	for (const vector of golden.text) {
		it(vector.id, () => expect(validPassword(vector.value)).toBe(vector.valid));
	}
	for (const vector of golden.tokens) {
		it(vector.id, () => expect(hashSessionToken(vector.token)).toBe(vector.sha256));
	}
	for (const vector of golden.fingerprints) {
		it(vector.id, () => {
			expect(Buffer.from(vector.serialized).toString('hex')).toBe(vector.utf8Hex);
			expect(createHash('sha256').update(Buffer.from(vector.utf8Hex, 'hex')).digest('hex')).toBe(
				vector.sha256
			);
			expect(mutationFingerprint(JSON.parse(vector.inputJson))).toBe(vector.sha256);
		});
	}
	it('fingerprint-js-only-undefined', () => {
		expect(mutationFingerprint({ a: undefined, b: 1 })).toBe(mutationFingerprint({ b: 1 }));
		expect(mutationFingerprint([undefined])).toBe(mutationFingerprint([null]));
		expect(() => mutationFingerprint(undefined)).toThrow(
			'Mutation payload must be JSON serializable'
		);
	});
	for (const vector of golden.receipts) {
		it(vector.id, async () => {
			recorded(vector.missing ? [] : [vector]);
			const replay = writer.prepare(
				user,
				{ requestId: uuid, source: 'web', operations: [] },
				vector.incomingHash ?? ''
			);
			if (vector.conflict) await expect(replay).rejects.toBeInstanceOf(RequestConflictError);
			else {
				const result = await replay;
				if (vector.missing) expect(result.kind).toBe('Prepared');
				else
					expect(result).toEqual({
						kind: 'Recorded',
						acknowledgement: vector.expected
					});
			}
		});
	}
	it('receipt-normalized-patch-and-import', async () => {
		const mutations = createInventoryMutations(db, lifetime.application.catalog, auth);
		const ack = golden.receipts[0].acknowledgement!;
		for (const kind of ['absent', 'import-normalized']) {
			const hash = golden.fingerprints.find((v) => v.id === `fingerprint-${kind}`)!.sha256;
			recorded([{ requestHash: hash, acknowledgement: ack }]);
			const result =
				kind === 'absent'
					? await mutations.patchEntry(user, {
							requestId: uuid,
							entryId: uuid,
							quantity: 2
						})
					: await mutations.commitImport(user, {
							requestId: uuid,
							text: ' 2 Forest\r\n1 Island\r '
						});
			expect(result).toEqual(ack);
		}
	});
	for (const vector of golden.conflicts) {
		it(vector.id, async () => {
			const body = vector.body;
			let cause: Error;
			switch (vector.id) {
				case 'conflict-notes':
					cause = new NotesConflictError({
						entryId: uuid,
						notes: 'é 🔮',
						notesRevision: '9007199254740993'
					});
					break;
				case 'conflict-description':
					cause = new DescriptionConflictError({
						description: 'saved',
						descriptionRevision: '8'
					});
					break;
				case 'conflict-quantity-absent':
					cause = new InventoryQuantityChangedError(null);
					break;
				case 'conflict-quantity-present':
					cause = new InventoryQuantityChangedError(3);
					break;
				case 'conflict-request':
					cause = new RequestConflictError();
					break;
				case 'conflict-category':
					cause = new CategoryConflict(
						body.latest as ConstructorParameters<typeof CategoryConflict>[0]
					);
					break;
				case 'conflict-merge':
					cause = new CategoryMergeConflict(
						body.preview as ConstructorParameters<typeof CategoryMergeConflict>[0]
					);
					break;
				case 'conflict-library':
					cause = new LibraryConflict();
					break;
				default:
					cause = new Error('sanitized internal detail');
			}
			const response = errorResponse(cause);
			expect(response.status).toBe(vector.status);
			expect(response.headers.get('content-type')).toBe('application/json');
			expect(await response.json()).toEqual(body);
		});
	}
	for (const vector of golden.forms) {
		it(vector.id, async () => {
			const result = readFormData(request(vector.body, vector.contentType));
			if (vector.status)
				await expect(result).rejects.toMatchObject({
					status: vector.status,
					message: vector.message
				});
			else {
				const data = await result;
				expect([...data.entries()]).toEqual(vector.entries);
				expect(data.get('username')).toBe(vector.entries![0][1]);
				expect(data.has('absent')).toBe(false);
			}
		});
	}
	for (const vector of golden.jsonBodies) {
		it(vector.id, async () => {
			const bytes = vector.hex ? Uint8Array.from(Buffer.from(vector.hex, 'hex')) : vector.body!;
			const result = readJsonObject(request(bytes, vector.contentType));
			if (vector.status)
				await expect(result).rejects.toMatchObject({
					status: vector.status,
					message: vector.message
				});
			else if (vector.nonfinite) {
				const body = await result;
				expect(() => readNumber(body.quantity, 'quantity')).toThrow();
			} else {
				const body = await result;
				if (vector.negativeZero) expect(Object.is(body.quantity, -0)).toBe(true);
				expect(JSON.parse(JSON.stringify(body))).toEqual(vector.expected);
			}
		});
	}
	for (const vector of golden.headers) {
		it(vector.id, () => {
			expect(
				selectedToken(
					new Request(origin, {
						headers: new Headers(
							Object.entries(vector.headers).filter(
								(entry): entry is [string, string] => typeof entry[1] === 'string'
							)
						)
					})
				) ?? null
			).toBe(vector.selected);
		});
	}
	for (const vector of golden.numbers) {
		it(vector.id, () => {
			if (vector.invalid) expect(() => databaseInteger(vector.value)).toThrow();
			else expect(databaseInteger(vector.value)).toBe(vector.expected);
		});
	}
	for (const vector of golden.queries) {
		it(vector.id, () => {
			const read = () => readQueryInteger(vector.value, 'limit', 20);
			if (vector.status) expect(read).toThrow();
			else expect(read()).toBe(vector.expected);
		});
	}
	it('body-limit-exact-and-overflow', async () => {
		await expect(readJsonObject(request('{}', 'application/json'), 2)).resolves.toEqual({});
		await expect(readJsonObject(request('{} ', 'application/json'), 2)).rejects.toMatchObject({
			status: 413
		});
		await expect(
			readFormData(request('x=', 'application/x-www-form-urlencoded'), 2)
		).resolves.toBeInstanceOf(FormData);
		await expect(
			readFormData(request('x=a', 'application/x-www-form-urlencoded'), 2)
		).rejects.toMatchObject({ status: 413 });
	});
});
