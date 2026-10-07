import type { Pool, PoolClient } from 'pg';
import type { createLocalAuth } from '../auth/local.ts';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import type {
	InventoryPriceResponse,
	PriceFinish,
	PricePublication,
	PriceReference,
	PriceRequest,
	PriceResponse,
	PriceUnknownReason,
	ProductLink,
	ValuationApplication
} from '@spellbook/contracts/valuation.ts';
import { ValidationError } from '../mtg/validation.ts';
import { databaseInteger } from '../db/numbers.ts';
export class PriceReadUnavailable extends Error {
	readonly kind = 'PriceReadUnavailable';
	constructor() {
		super('Reference prices are temporarily unavailable.');
	}
}
export class InventoryPriceNotFound extends Error {
	readonly kind = 'InventoryPriceNotFound';
	constructor() {
		super('Inventory entry not found.');
	}
}
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function uuid(value: unknown): string {
	if (typeof value !== 'string' || !uuidPattern.test(value))
		throw new ValidationError('Invalid printing or entry UUID');
	return value.toLowerCase();
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
	if (
		!value ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		Object.keys(value).some((k) => !keys.includes(k))
	)
		throw new ValidationError('Unsupported price request fields');
	return value as Record<string, unknown>;
}
function requests(input: unknown): PriceRequest[] {
	if (!Array.isArray(input) || input.length < 1 || input.length > 100)
		throw new ValidationError('Supply 1 to 100 price requests');
	const normalized = input.map((value) => {
		const v = object(value, ['printingId', 'finish']);
		if (v.finish !== 'nonfoil' && v.finish !== 'foil') throw new ValidationError('Invalid finish');
		return { printingId: uuid(v.printingId), finish: v.finish } as PriceRequest;
	});
	if (new Set(normalized.map((v) => v.printingId + v.finish)).size !== normalized.length)
		throw new ValidationError('Duplicate price request');
	return normalized;
}
function entryIds(input: unknown): string[] {
	const value = object(input, ['entryIds']);
	if (!Array.isArray(value.entryIds) || value.entryIds.length < 1 || value.entryIds.length > 100)
		throw new ValidationError('Supply 1 to 100 entry IDs');
	const ids = value.entryIds.map(uuid);
	if (new Set(ids).size !== ids.length) throw new ValidationError('Duplicate entry ID');
	return ids;
}
function decimal(value: string) {
	if (!/^[0-9]+(?:\.[0-9]+)?$/.test(value)) throw new PriceReadUnavailable();
	const [whole, raw = ''] = value.split('.');
	const fraction = raw.replace(/0+$/, '');
	return (whole.replace(/^0+(?=\d)/, '') || '0') + (fraction ? '.' + fraction : '');
}
export type FrozenReferenceEvidence = {
	reference: Extract<PriceReference, { kind: 'Known' }>;
	publication: PricePublication;
	descriptor: Record<string, unknown>;
	requestedIdentity: Record<string, unknown>;
	matchedIdentity: Record<string, unknown>;
	mappingVersion: number;
	rawValue: string | null;
};
type Row = {
	printing_id: string | null;
	identity: Record<string, unknown> | null;
	links: Omit<ProductLink, 'printingId' | 'provenance'>[] | null;
	supported: boolean | null;
	amount: string | null;
	measure: 'prices.eur' | 'prices.eur_foil';
	raw_value: string | null;
	english_printing_id: string | null;
	english_identity: Record<string, unknown> | null;
	english_links: Omit<ProductLink, 'printingId' | 'provenance'>[] | null;
	english_amount: string | null;
	english_supported: boolean | null;
	english_raw_value: string | null;
	mapping_reason: PriceUnknownReason | null;
};
function choose(
	request: PriceRequest,
	row: Row | undefined,
	publication: PricePublication | undefined,
	now: Date
): PriceReference {
	const links: ProductLink[] = (row?.links ?? []).map((link) => ({
		provider: link.provider,
		url: link.url,
		printingId: request.printingId,
		provenance: 'Exact'
	}));
	if (row?.english_printing_id)
		for (const link of row.english_links ?? [])
			if (!links.some((l) => l.provider === link.provider))
				links.push({
					provider: link.provider,
					url: link.url,
					printingId: row.english_printing_id,
					provenance: 'EnglishFallback'
				});
	const unknown = (reason: PriceUnknownReason): PriceReference => ({
		...request,
		links,
		kind: 'Unknown',
		reason
	});
	if (!publication) return unknown('SourceUnavailable');
	if (!row?.printing_id) return unknown('PrintingMissing');
	if (!row.supported) return unknown('UnsupportedFinish');
	const age = Math.max(0, now.getTime() - Date.parse(publication.sourceTime));
	if (age > 7 * 86400000) return unknown('ReferenceExpired');
	let amount = row.amount,
		matchedPrintingId = request.printingId,
		provenance: 'Exact' | 'EnglishFallback' = 'Exact';
	if (amount === null && row.english_printing_id && row.english_supported) {
		amount = row.english_amount;
		matchedPrintingId = row.english_printing_id;
		provenance = 'EnglishFallback';
	}
	if (amount === null)
		return unknown(
			row.identity?.lang === 'en' ? 'AmountMissing' : (row.mapping_reason ?? 'AmountMissing')
		);
	return {
		...request,
		links,
		kind: 'Known',
		amount: decimal(amount),
		currency: 'EUR',
		source: 'Scryfall',
		measure: row.measure,
		sourceTime: publication.sourceTime,
		timePrecision: 'Instant',
		freshness: age <= 86400000 ? 'Fresh' : 'Stale',
		publicationId: publication.id,
		observationId: [publication.id, matchedPrintingId, request.finish, row.measure].join(':'),
		matchedPrintingId,
		matchedFinish: request.finish,
		provenance
	};
}
export function createValuation(
	pool: Pool,
	auth: Pick<ReturnType<typeof createLocalAuth>, 'requireActor'>,
	clock: () => Date = () => new Date()
): ValuationApplication & {
	freezePrintingReferences(
		input: unknown
	): Promise<{ response: PriceResponse; evidence: FrozenReferenceEvidence[] }>;
} {
	async function snapshot<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
		let client: PoolClient | undefined;
		try {
			client = await pool.connect();
			await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
			const result = await operation(client);
			await client.query('COMMIT');
			return result;
		} catch (cause) {
			if (client) await client.query('ROLLBACK').catch(() => {});
			if (cause instanceof ValidationError || cause instanceof InventoryPriceNotFound) throw cause;
			throw new PriceReadUnavailable();
		} finally {
			client?.release();
		}
	}
	async function read(
		client: PoolClient,
		pairs: PriceRequest[],
		frozen?: FrozenReferenceEvidence[]
	): Promise<PriceResponse> {
		const now = clock();
		const state = await client.query(
			`SELECT s.refresh_status,p.*,p.id AS publication_id FROM price_state s LEFT JOIN price_publications p ON p.id=s.active_publication WHERE s.id=1`
		);
		const raw = state.rows[0];
		const publication: PricePublication | undefined = raw?.publication_id
			? {
					id: raw.publication_id,
					source: 'Scryfall',
					bulkType: raw.source_type,
					sourceTime: raw.source_updated_at.toISOString(),
					timePrecision: 'Instant',
					payloadDigest: raw.payload_digest,
					extractorVersion: raw.extractor_version,
					mappingVersion: raw.mapping_version,
					ingestedAt: raw.ingested_at.toISOString()
				}
			: undefined;
		const rows = publication
			? (
					await client.query<Row>(
						`SELECT p.id AS printing_id,p.identity,p.links,o.supported,o.amount::text,o.measure,o.raw_value,o.english_printing_id,o.mapping_reason,e.identity AS english_identity,e.links AS english_links,eo.amount::text AS english_amount,eo.supported AS english_supported,eo.raw_value AS english_raw_value FROM unnest($2::uuid[],$3::text[]) WITH ORDINALITY r(id,finish,ordinality) LEFT JOIN price_printings p ON p.publication_id=$1 AND p.id=r.id LEFT JOIN price_observations o ON o.publication_id=$1 AND o.printing_id=p.id AND o.finish=r.finish LEFT JOIN price_printings e ON e.publication_id=$1 AND e.id=o.english_printing_id LEFT JOIN price_observations eo ON eo.publication_id=$1 AND eo.printing_id=e.id AND eo.finish=r.finish ORDER BY r.ordinality`,
						[publication.id, pairs.map((p) => p.printingId), pairs.map((p) => p.finish)]
					)
				).rows
			: [];
		const results = pairs.map((request, index) => choose(request, rows[index], publication, now));
		if (frozen && publication)
			results.forEach((reference, index) => {
				if (reference.kind !== 'Known') return;
				const row = rows[index];
				frozen.push({
					reference,
					publication,
					descriptor: raw.descriptor,
					requestedIdentity: row.identity!,
					matchedIdentity: reference.provenance === 'Exact' ? row.identity! : row.english_identity!,
					mappingVersion: publication.mappingVersion,
					rawValue: reference.provenance === 'Exact' ? row.raw_value : row.english_raw_value
				});
			});
		const status = raw?.refresh_status;
		return {
			evaluatedAt: now.toISOString(),
			publications: publication ? [publication] : [],
			refreshStatus: {
				kind: ['Succeeded', 'Failed'].includes(status?.kind) ? status.kind : 'NeverAttempted',
				...(typeof status?.attemptedAt === 'string' ? { attemptedAt: status.attemptedAt } : {})
			},
			results
		};
	}
	async function printingReferences(input: unknown) {
		const pairs = requests(input);
		return snapshot((client) => read(client, pairs));
	}
	async function inventoryReferences(
		actor: AuthUser,
		input: unknown
	): Promise<InventoryPriceResponse> {
		let accountId: string;
		try {
			({ accountId } = await auth.requireActor(actor));
		} catch (cause) {
			if (cause && typeof cause === 'object' && 'kind' in cause && cause.kind === 'Unauthenticated')
				throw cause;
			throw new PriceReadUnavailable();
		}
		const ids = entryIds(input);
		return snapshot(async (client) => {
			const { rows } = await client.query<{
				id: string;
				catalog_card_id: string;
				finish: PriceFinish;
				quantity: number;
			}>(
				`SELECT id,catalog_card_id,finish,quantity FROM inventory_cards WHERE id=ANY($1::uuid[]) AND account_id=$2 AND game='mtg'`,
				[ids, accountId]
			);
			if (rows.length !== ids.length) throw new InventoryPriceNotFound();
			const ordered = ids.map((id) => rows.find((row) => row.id === id)!);
			const pairs = ordered.map((row) => ({
				printingId: uuid(row.catalog_card_id),
				finish: row.finish
			}));
			const response = await read(client, pairs);
			const coverage = {
				coveredQuantity: 0,
				staleQuantity: 0,
				unknownQuantity: 0
			};
			const results = ordered.map((row, index) => {
				const reference = response.results[index],
					quantity = databaseInteger(row.quantity);
				if (quantity < 0) throw new PriceReadUnavailable();
				if (reference.kind === 'Known') {
					coverage.coveredQuantity = databaseInteger(
						BigInt(coverage.coveredQuantity) + BigInt(quantity)
					);
					if (reference.freshness === 'Stale')
						coverage.staleQuantity = databaseInteger(
							BigInt(coverage.staleQuantity) + BigInt(quantity)
						);
				} else
					coverage.unknownQuantity = databaseInteger(
						BigInt(coverage.unknownQuantity) + BigInt(quantity)
					);
				return { entryId: row.id, quantity, reference };
			});
			return { ...response, results, coverage };
		});
	}
	async function freezePrintingReferences(input: unknown) {
		const pairs = requests(input);
		return snapshot(async (client) => {
			const evidence: FrozenReferenceEvidence[] = [];
			const response = await read(client, pairs, evidence);
			return { response, evidence };
		});
	}
	return { printingReferences, inventoryReferences, freezePrintingReferences };
}
