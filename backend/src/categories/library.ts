import { readComboSource } from './combo.ts';
import { advanceDeckLibraryRevision } from '../decks/directory-revision.ts';
import { publishCategoryChange } from './notification.ts';
import { categoryTransaction, categoryCheckpoint } from './work.ts';
import { sql } from 'drizzle-orm';
import { databaseInteger } from '../db/numbers.ts';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import type {
	CategoryLibrary,
	CategoryLibraryApplication,
	DefinitionVersion,
	LibraryAcknowledgement,
	SaveDefinitionInput
} from '@spellbook/contracts/category-library.ts';
import type { Database, Transaction } from '../db/client.ts';
import type { createLocalAuth } from '../auth/local.ts';
import { ValidationError, DECK_ROLES } from '../mtg/validation.ts';
import { mutationFingerprint, RequestConflictError } from '../decks/request-fingerprint.ts';
import { CategoryNotFound } from './errors.ts';
import { validateRule } from './library-rules.ts';
import { starterDefinitions } from './rules.ts';
export class LibraryConflict extends Error {
	readonly kind = 'RequestConflict';
	constructor() {
		super('Category Library changed. Read the latest Library and retry.');
	}
}
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function categoryUuid(input: unknown) {
	if (typeof input !== 'string' || !uuidPattern.test(input))
		throw new ValidationError('Invalid category UUID');
	return input.toLowerCase();
}
export function categoryName(input: unknown) {
	if (typeof input !== 'string') throw new ValidationError('Category name is required');
	const name = input.trim().normalize('NFC');
	if (!name.length || name.length > 128)
		throw new ValidationError('Category name must contain 1 to 128 characters');
	return name;
}
export function assertUniqueLocalCategoryNames(definitions: { name: string }[]) {
	const names = new Set<string>();
	for (const definition of definitions) {
		const name = categoryName(definition.name).toLocaleLowerCase('en');
		if (names.has(name))
			throw new ValidationError(
				'Distinct Category origins share a local name. Rename the reusable definition before adoption.'
			);
		names.add(name);
	}
}
export function categoryRevision(input: unknown) {
	if (typeof input !== 'string' || !/^(0|[1-9]\d*)$/.test(input))
		throw new ValidationError('Category revision is required');
	return input;
}
export function strictCategoryFields(input: unknown, allowed: string[]): Record<string, unknown> {
	if (
		!input ||
		typeof input !== 'object' ||
		Array.isArray(input) ||
		Object.keys(input).some((k) => !allowed.includes(k))
	)
		throw new ValidationError('Invalid category request fields');
	return input as Record<string, unknown>;
}
export async function readLibrary(
	tx: Transaction,
	accountId: string,
	activeOnly = false
): Promise<CategoryLibrary> {
	const size = await tx.execute(
		sql`SELECT COALESCE(sum(octet_length(v.definition::text)),0)::text AS bytes FROM category_definition_origins o JOIN category_definition_versions v ON v.origin_id=o.id AND v.version=o.current_version WHERE o.account_id=${accountId} ${activeOnly ? sql`AND NOT o.archived` : sql``}`
	);
	categoryCheckpoint(tx, Number(size.rows[0].bytes));
	const state = await tx.execute(
		sql`SELECT revision::text FROM category_library_state WHERE account_id=${accountId}`
	);
	const rows = await tx.execute(
		sql`SELECT o.id,o.archived,v.definition FROM category_definition_origins o JOIN category_definition_versions v ON v.origin_id=o.id AND v.version=o.current_version WHERE o.account_id=${accountId} ${activeOnly ? sql`AND NOT o.archived` : sql``} ORDER BY o.scope,o.id`
	);
	return {
		revision: String(state.rows[0]?.revision ?? '0'),
		definitions: rows.rows.map((r) => ({
			originId: String(r.id),
			archived: r.archived === true,
			current: r.definition as DefinitionVersion
		}))
	};
}
async function readCurrentDefinition(tx: Transaction, accountId: string, originId: string | null) {
	const state = await tx.execute(
		sql`SELECT revision::text FROM category_library_state WHERE account_id=${accountId}`
	);
	const rows = originId
		? await tx.execute(
				sql`SELECT o.id::text,o.archived,v.definition FROM category_definition_origins o JOIN category_definition_versions v ON v.origin_id=o.id AND v.version=o.current_version WHERE o.id=${originId}::uuid AND o.account_id=${accountId}`
			)
		: { rows: [] };
	const row = rows.rows[0];
	return {
		revision: String(state.rows[0]?.revision ?? '0'),
		existing: row
			? {
					originId: String(row.id),
					archived: row.archived === true,
					current: row.definition as DefinitionVersion
				}
			: undefined
	};
}
async function nameInUse(
	tx: Transaction,
	accountId: string,
	scope: string,
	name: string,
	originId: string | null
) {
	const rows = await tx.execute(
		sql`SELECT id FROM category_definition_origins WHERE account_id=${accountId} AND scope=${scope} AND normalized_name=${name.toLocaleLowerCase('en')} AND NOT archived AND id IS DISTINCT FROM ${originId}::uuid LIMIT 1`
	);
	return rows.rows.length > 0;
}
export async function categoryReceipt(
	tx: Transaction,
	accountId: string,
	requestId: string,
	hash: string
) {
	const receipt = await tx.execute(
		sql`SELECT request_hash,acknowledgement FROM category_mutation_requests WHERE account_id=${accountId} AND request_id=${requestId}::uuid`
	);
	if (!receipt.rows.length) return null;
	if (receipt.rows[0].request_hash !== hash) throw new RequestConflictError();
	return receipt.rows[0].acknowledgement;
}
export async function storeCategoryReceipt(
	tx: Transaction,
	accountId: string,
	requestId: string,
	hash: string,
	ack: unknown
) {
	await tx.execute(
		sql`INSERT INTO category_mutation_requests(account_id,request_id,request_hash,acknowledgement) VALUES(${accountId},${requestId}::uuid,${hash},${JSON.stringify(ack)}::jsonb)`
	);
}
export function createCategoryLibrary(
	db: Database,
	auth: Pick<ReturnType<typeof createLocalAuth>, 'requireActor' | 'requireActorForWrite'>
): CategoryLibraryApplication {
	async function write(
		actor: AuthUser,
		requestId: string,
		hash: string,
		run: (tx: Transaction, accountId: string) => Promise<LibraryAcknowledgement>
	) {
		return categoryTransaction(db, async (tx) => {
			const { accountId } = await auth.requireActor(actor, tx);
			await tx.execute(
				sql`SELECT account_id FROM user_profiles WHERE account_id=${accountId} FOR UPDATE`
			);
			await auth.requireActorForWrite(actor, tx);
			const replay = await categoryReceipt(tx, accountId, requestId, hash);
			if (replay) return replay as LibraryAcknowledgement;
			const ack = await run(tx, accountId);
			await storeCategoryReceipt(tx, accountId, requestId, hash, ack);
			if (ack.changed) {
				const origin = (
					await tx.execute(
						sql`SELECT scope FROM category_definition_origins WHERE id=${ack.originId}::uuid`
					)
				).rows[0];
				if (origin?.scope === 'deck') await advanceDeckLibraryRevision(tx, accountId);
				await publishCategoryChange(tx, accountId);
			}
			return ack;
		});
	}
	async function advance(tx: Transaction, accountId: string) {
		const rows = await tx.execute(
			sql`INSERT INTO category_library_state(account_id,revision) VALUES(${accountId},1) ON CONFLICT(account_id) DO UPDATE SET revision=category_library_state.revision+1 RETURNING revision::text`
		);
		return String(rows.rows[0].revision);
	}
	return {
		getRuleChoices: async (actor, value) => {
			const raw = strictCategoryFields(value, [
				'tagQuery',
				'cardQuery',
				'tagIds',
				'oracleIds',
				'outcomeQuery',
				'outcomeIds'
			]);
			const tagQuery = raw.tagQuery ?? '',
				cardQuery = raw.cardQuery ?? '',
				outcomeQuery = raw.outcomeQuery ?? '';
			if (
				typeof outcomeQuery !== 'string' ||
				outcomeQuery.length > 200 ||
				typeof tagQuery !== 'string' ||
				typeof cardQuery !== 'string' ||
				tagQuery.length > 200 ||
				cardQuery.length > 200
			)
				throw new ValidationError('Rule search is limited to 200 characters');
			const ids = (value: unknown) => {
				if (value === undefined) return [] as string[];
				if (!Array.isArray(value) || value.length > 100)
					throw new ValidationError('Rule selections exceed 100');
				return value.map(categoryUuid);
			};
			const tags = ids(raw.tagIds),
				cards = ids(raw.oracleIds);
			const outcomeIds = raw.outcomeIds ?? [];
			if (
				!Array.isArray(outcomeIds) ||
				outcomeIds.length > 100 ||
				outcomeIds.some((id) => typeof id !== 'string' || !/^[1-9]\d{0,19}$/.test(id))
			)
				throw new ValidationError('Invalid documented combo selections');
			return categoryTransaction(
				db,
				async (tx) => {
					await auth.requireActor(actor, tx);
					const tagRows = await tx.execute(
						sql`SELECT t.id::text,t.label AS name FROM oracle_tags t JOIN oracle_tag_state s ON s.active_publication=t.publication_id WHERE s.id=1 AND (t.id=ANY(${'{' + tags.join(',') + '}'}::uuid[]) OR (${tagQuery.trim() !== ''} AND strpos(lower(t.label),lower(${tagQuery.trim()}))>0)) ORDER BY CASE WHEN t.id=ANY(${'{' + tags.join(',') + '}'}::uuid[]) THEN 0 ELSE 1 END,t.label,t.id LIMIT 100`
					);
					const cardRows = await tx.execute(
						sql`SELECT DISTINCT p.oracle_id::text AS oracle_id,p.name,CASE WHEN p.oracle_id=ANY(${'{' + cards.join(',') + '}'}::uuid[]) THEN 0 ELSE 1 END AS priority FROM catalog_printings p JOIN catalog_state s ON s.active_generation=p.generation_id JOIN catalog_generations g ON g.id=s.active_generation JOIN catalog_oracle_facts f ON f.generation_id=p.generation_id AND f.printing_id=p.id AND f.raw_oracle_id=p.oracle_id WHERE s.id=1 AND p.lang='en' AND f.transform_version>=2 AND f.transform_version=g.schema_version AND (p.oracle_id=ANY(${'{' + cards.join(',') + '}'}::uuid[]) OR (${cardQuery.trim() !== ''} AND strpos(lower(p.name),lower(${cardQuery.trim()}))>0)) ORDER BY priority,p.name,oracle_id LIMIT 100`
					);
					const source = await readComboSource(tx);
					const outcomes =
						source.availability === 'Available'
							? (
									await tx.execute(
										sql`SELECT id,name FROM combo_outcomes WHERE publication_id=${source.publicationId}::uuid AND ${outcomeQuery.trim() !== ''} AND strpos(lower(name),lower(${outcomeQuery.trim()}))>0 ORDER BY name,id LIMIT 50`
									)
								).rows
							: [];
					const selectedOutcomes =
						source.availability === 'Available' && outcomeIds.length
							? (
									await tx.execute(
										sql`SELECT id,name FROM combo_outcomes WHERE publication_id=${source.publicationId}::uuid AND id=ANY(${'{' + outcomeIds.join(',') + '}'}::text[]) ORDER BY name,id`
									)
								).rows
							: [];
					return {
						combo: {
							source,
							selectedOutcomes: selectedOutcomes.map((r) => ({
								id: String(r.id),
								name: String(r.name)
							})),
							outcomes: outcomes.map((r) => ({
								id: String(r.id),
								name: String(r.name)
							}))
						},
						tags: tagRows.rows.map((r) => ({
							id: String(r.id),
							name: String(r.name)
						})),
						cards: cardRows.rows.map((r) => ({
							oracleId: String(r.oracle_id),
							name: String(r.name)
						}))
					};
				},
				{ isolationLevel: 'repeatable read', accessMode: 'read only' }
			);
		},
		getDefinition: async (actor, input) => {
			const originId = categoryUuid(input);
			return categoryTransaction(
				db,
				async (tx) => {
					const { accountId } = await auth.requireActor(actor, tx);
					const result = await tx.execute(
						sql`SELECT o.id::text,o.archived,v.definition,s.revision::text FROM category_definition_origins o JOIN category_definition_versions v ON v.origin_id=o.id AND v.version=o.current_version LEFT JOIN category_library_state s ON s.account_id=o.account_id WHERE o.id=${originId}::uuid AND o.account_id=${accountId}`
					);
					if (!result.rows.length) throw new CategoryNotFound();
					const row = result.rows[0];
					return {
						originId: String(row.id),
						archived: row.archived === true,
						current: row.definition as DefinitionVersion,
						libraryRevision: String(row.revision ?? '0')
					};
				},
				{ isolationLevel: 'repeatable read', accessMode: 'read only' }
			);
		},
		getLibrary: async (actor, input = {}) => {
			const fields = strictCategoryFields(input, ['scope', 'offset', 'limit']);
			const scope = fields.scope,
				offset = fields.offset ?? 0,
				limit = fields.limit ?? 50;
			if (scope !== undefined && scope !== 'entry' && scope !== 'deck')
				throw new ValidationError('Invalid Library scope');
			if (
				typeof offset !== 'number' ||
				!Number.isSafeInteger(offset) ||
				offset < 0 ||
				typeof limit !== 'number' ||
				!Number.isInteger(limit) ||
				limit < 1 ||
				limit > 100
			)
				throw new ValidationError('Invalid Library page');
			return categoryTransaction(
				db,
				async (tx) => {
					const { accountId } = await auth.requireActor(actor, tx);
					const state = await tx.execute(
						sql`SELECT revision::text FROM category_library_state WHERE account_id=${accountId}`
					);
					const count = await tx.execute(
						sql`SELECT count(*)::text AS total FROM category_definition_origins WHERE account_id=${accountId} ${scope ? sql`AND scope=${scope}` : sql``}`
					);
					const rows = await tx.execute(
						sql`SELECT o.id,o.archived,v.definition FROM category_definition_origins o JOIN category_definition_versions v ON v.origin_id=o.id AND v.version=o.current_version WHERE o.account_id=${accountId} ${scope ? sql`AND o.scope=${scope}` : sql``} ORDER BY o.scope,o.id OFFSET ${offset} LIMIT ${limit}`
					);
					return {
						revision: String(state.rows[0]?.revision ?? '0'),
						total: databaseInteger(count.rows[0].total),
						offset,
						limit,
						definitions: rows.rows.map((r) => ({
							originId: String(r.id),
							archived: r.archived === true,
							current: r.definition as DefinitionVersion
						}))
					};
				},
				{ isolationLevel: 'repeatable read', accessMode: 'read only' }
			);
		},
		saveDefinition: async (actor, value) => {
			const raw = strictCategoryFields(value, [
				'requestId',
				'originId',
				'expectedLibraryRevision',
				'scope',
				'name',
				'meaning',
				'priority',
				'displayOrder',
				'roles',
				'rule',
				'confirmRetainedRule'
			]);
			const requestId = categoryUuid(raw.requestId),
				originId = raw.originId === null ? null : categoryUuid(raw.originId),
				expected = categoryRevision(raw.expectedLibraryRevision);
			if (raw.scope !== 'entry' && raw.scope !== 'deck')
				throw new ValidationError('Category scope is required');
			const name = categoryName(raw.name);
			if (typeof raw.meaning !== 'string' || raw.meaning.length > 4000)
				throw new ValidationError('Meaning is limited to 4000 characters');
			for (const field of ['priority', 'displayOrder'])
				if (
					typeof raw[field] !== 'number' ||
					!Number.isInteger(raw[field]) ||
					Number(raw[field]) < -2147483648 ||
					Number(raw[field]) > 2147483647
				)
					throw new ValidationError('Category order must be a signed 32-bit integer');
			if (
				!Array.isArray(raw.roles) ||
				!raw.roles.length ||
				raw.roles.some((r) => !DECK_ROLES.includes(r)) ||
				new Set(raw.roles).size !== raw.roles.length
			)
				throw new ValidationError('Select distinct valid category roles');
			if (typeof raw.confirmRetainedRule !== 'boolean')
				throw new ValidationError('Rule confirmation is required');
			const rule = validateRule(raw.rule, raw.scope);
			const normalized = {
				...raw,
				requestId,
				originId,
				name,
				expectedLibraryRevision: expected,
				rule,
				roles: [...raw.roles].sort()
			} as SaveDefinitionInput;
			const hash = mutationFingerprint({
				kind: 'category.library.save',
				...normalized
			});
			return write(actor, requestId, hash, async (tx, accountId) => {
				const { revision, existing } = await readCurrentDefinition(tx, accountId, originId);
				if (originId && !existing) throw new CategoryNotFound();
				if (revision !== expected) throw new LibraryConflict();
				if (existing && existing.current.scope !== normalized.scope)
					throw new ValidationError('Definition scope is immutable');
				if (
					normalized.scope === 'entry' &&
					starterDefinitions.some(
						(d) => d.name.toLocaleLowerCase('en') === name.toLocaleLowerCase('en')
					)
				)
					throw new ValidationError(
						'This name belongs to an independent starter. Choose a distinct reusable name.'
					);
				if (
					existing &&
					existing.current.meaning !== normalized.meaning &&
					mutationFingerprint(existing.current.rule) === mutationFingerprint(rule) &&
					!normalized.confirmRetainedRule
				)
					throw new ValidationError(
						'Confirm that the current rule still expresses the changed meaning'
					);
				if (
					!existing?.archived &&
					(await nameInUse(tx, accountId, normalized.scope, name, originId))
				)
					throw new ValidationError('Category name is already used in this scope');
				const captured = {
					scope: normalized.scope,
					name,
					meaning: normalized.meaning,
					priority: normalized.priority,
					displayOrder: normalized.displayOrder,
					roles: normalized.roles,
					rule
				};
				const unchanged =
					existing &&
					Object.entries(captured).every(
						([key, val]) =>
							mutationFingerprint(existing.current[key as keyof DefinitionVersion]) ===
							mutationFingerprint(val)
					);
				if (unchanged)
					return {
						requestId,
						libraryRevision: revision,
						originId: existing.originId,
						versionId: existing.current.id,
						changed: false
					};
				const id = originId ?? crypto.randomUUID();
				const definition: DefinitionVersion = {
					...captured,
					id: crypto.randomUUID(),
					originId: id,
					version: (existing?.current.version ?? 0) + 1,
					createdAt: new Date().toISOString()
				};
				if (!existing)
					await tx.execute(
						sql`INSERT INTO category_definition_origins(id,account_id,scope,current_version,normalized_name) VALUES(${id}::uuid,${accountId},${normalized.scope},${definition.version},${name.toLocaleLowerCase('en')})`
					);
				else
					await tx.execute(
						sql`UPDATE category_definition_origins SET current_version=${definition.version},normalized_name=${name.toLocaleLowerCase('en')} WHERE id=${id}::uuid`
					);
				await tx.execute(
					sql`INSERT INTO category_definition_versions(id,origin_id,version,definition) VALUES(${definition.id}::uuid,${id}::uuid,${definition.version},${JSON.stringify(definition)}::jsonb)`
				);
				return {
					requestId,
					libraryRevision: await advance(tx, accountId),
					originId: id,
					versionId: definition.id,
					changed: true
				};
			});
		},
		archiveDefinition: async (actor, value) => {
			const raw = strictCategoryFields(value, [
				'requestId',
				'originId',
				'expectedLibraryRevision',
				'archived'
			]);
			const requestId = categoryUuid(raw.requestId),
				originId = categoryUuid(raw.originId),
				expected = categoryRevision(raw.expectedLibraryRevision);
			if (typeof raw.archived !== 'boolean')
				throw new ValidationError('Archive choice is required');
			const archived = raw.archived,
				hash = mutationFingerprint({
					kind: 'category.library.archive',
					originId,
					expected,
					archived
				});
			return write(actor, requestId, hash, async (tx, accountId) => {
				const { revision, existing } = await readCurrentDefinition(tx, accountId, originId);
				if (!existing) throw new CategoryNotFound();
				if (revision !== expected) throw new LibraryConflict();
				if (
					!archived &&
					existing.current.scope === 'entry' &&
					starterDefinitions.some(
						(d) => d.name.toLocaleLowerCase('en') === existing.current.name.toLocaleLowerCase('en')
					)
				)
					throw new ValidationError(
						'This name belongs to an independent starter. Rename the archived reusable definition before restoring it.'
					);
				if (
					!archived &&
					(await nameInUse(tx, accountId, existing.current.scope, existing.current.name, originId))
				)
					throw new ValidationError('Category name is already used in this scope');
				const changed = existing.archived !== archived;
				if (changed)
					await tx.execute(
						sql`UPDATE category_definition_origins SET archived=${archived} WHERE id=${originId}::uuid`
					);
				return {
					requestId,
					originId,
					versionId: existing.current.id,
					changed,
					libraryRevision: changed ? await advance(tx, accountId) : revision
				};
			});
		}
	};
}
