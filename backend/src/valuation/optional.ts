import { referenceOrigin } from './origin.ts';
import { isReferenceDecimal } from '@spellbook/contracts/valuation.ts';
import type {
	PricePublication,
	PriceReference,
	PriceRequest,
	PriceSourceStatus
} from '@spellbook/contracts/valuation.ts';
import type { FrozenReferenceEvidence, ReferenceExecutor, FrozenSourceSelection } from './read.ts';

type OptionalState = {
	source: 'Cardmarket' | 'MTGJSON';
	enabled: boolean;
	refresh_status: { kind?: string; attemptedAt?: string };
	publication_id: string | null;
	publication_source: string;
	time_precision: string;
	source_instant: Date;
	source_date: string;
	descriptor: Record<string, unknown>;
	payload_digest: string;
	extractor_version: number;
	mapping_version: number;
	ingested_at: Date;
};
type OptionalRow = {
	printing_id: string | null;
	identity: Record<string, unknown> | null;
	supported: boolean | null;
	amount: string | null;
	measure: string;
	raw_value: string | null;
	provider_id: string | null;
	english_printing_id: string | null;
	english_variant_key: string | null;
	mapping_reason: Extract<PriceReference, { kind: 'Unknown' }>['reason'] | null;
	english_identity: Record<string, unknown> | null;
	english_amount: string | null;
	english_supported: boolean | null;
	english_raw_value: string | null;
	english_provider_id: string | null;
};
export type ReferenceCandidate = {
	reference: PriceReference;
	evidence?: FrozenReferenceEvidence;
};
export function referenceFreshness(publication: PricePublication, now: Date) {
	let source: number;
	if (publication.timePrecision === 'Day') {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(publication.sourceDate))
			throw Error('Invalid stored source date');
		source = Date.parse(publication.sourceDate + 'T00:00:00Z');
		if (
			!Number.isFinite(source) ||
			new Date(source).toISOString().slice(0, 10) !== publication.sourceDate ||
			publication.sourceDate > now.toISOString().slice(0, 10)
		)
			throw Error('Invalid stored source date');
	} else source = Date.parse(publication.sourceTime);
	if (!Number.isFinite(source)) throw Error('Invalid stored source instant');
	const age = Math.max(0, now.getTime() - source);
	return age > 168 * 3600000
		? undefined
		: age <= 24 * 3600000
			? ('Fresh' as const)
			: ('Stale' as const);
}
function amount(value: unknown) {
	if (value === null) return null;
	if (!isReferenceDecimal(value)) throw Error('Invalid stored exact amount');
	const [whole, raw = ''] = value.split('.'),
		fraction = raw.replace(/0+$/, '');
	return (whole.replace(/^0+(?=\d)/, '') || '0') + (fraction ? '.' + fraction : '');
}
export async function readOptionalReferences(
	client: ReferenceExecutor,
	pairs: PriceRequest[],
	now: Date,
	baseline: PriceReference[]
) {
	const states = (
		await client.query<OptionalState>(
			`SELECT s.*,p.id AS publication_id,p.source AS publication_source,p.time_precision,p.source_instant,p.source_date::text,p.descriptor,p.payload_digest,p.extractor_version,p.mapping_version,p.ingested_at FROM optional_price_state s LEFT JOIN optional_price_publications p ON p.id=s.active_publication ORDER BY s.source`
		)
	).rows;
	const publications: PricePublication[] = [],
		statuses: PriceSourceStatus[] = [];
	const candidates: ReferenceCandidate[][] = pairs.map(() => []);
	const selections: FrozenSourceSelection[][] = pairs.map(() => []);
	for (const state of states) {
		if (state.source !== 'Cardmarket' && state.source !== 'MTGJSON')
			throw Error('Invalid stored source');
		const health = state.refresh_status;
		statuses.push({
			source: state.source,
			enabled: state.enabled,
			kind: !state.enabled
				? 'Disabled'
				: health?.kind === 'Failed'
					? 'Failed'
					: health?.kind === 'Succeeded'
						? 'Succeeded'
						: 'NeverAttempted',
			...(typeof health?.attemptedAt === 'string' ? { attemptedAt: health.attemptedAt } : {}),
			...(state.publication_id ? { lastSuccessfulPublicationId: state.publication_id } : {})
		});
		if (!state.enabled || !state.publication_id) {
			for (const selection of selections)
				selection.push({
					source: state.source,
					enabled: state.enabled,
					publication: null,
					descriptor: state.descriptor ?? null,
					selection: null
				});
		}
		if (!state.enabled) continue;
		if (!state.publication_id) {
			pairs.forEach((pair, index) =>
				candidates[index].push({
					reference: {
						...pair,
						links: baseline[index].links,
						kind: 'Unknown',
						reason: 'SourceUnavailable'
					}
				})
			);
			continue;
		}
		if (
			state.publication_source !== state.source ||
			state.time_precision !== (state.source === 'Cardmarket' ? 'Instant' : 'Day')
		)
			throw Error('Invalid stored publication');
		const publication: PricePublication = {
			id: state.publication_id,
			source: state.source,
			bulkType: state.source === 'Cardmarket' ? 'public-price-guide' : 'AllPricesToday',
			payloadDigest: state.payload_digest,
			extractorVersion: state.extractor_version,
			mappingVersion: state.mapping_version,
			ingestedAt: state.ingested_at.toISOString(),
			...(state.time_precision === 'Instant'
				? {
						timePrecision: 'Instant',
						sourceTime: state.source_instant.toISOString()
					}
				: { timePrecision: 'Day', sourceDate: state.source_date })
		};
		publications.push(publication);
		const rows = (
			await client.query<OptionalRow>(
				`SELECT p.printing_id,p.identity,o.supported,o.amount::text,o.measure,o.raw_value,o.provider_id,o.english_printing_id,o.mapping_reason,e.variant_key AS english_variant_key,e.identity AS english_identity,eo.amount::text AS english_amount,eo.supported AS english_supported,eo.raw_value AS english_raw_value,eo.provider_id AS english_provider_id FROM unnest($2::uuid[],$3::text[]) WITH ORDINALITY r(id,finish,ordinality) LEFT JOIN optional_price_printings p ON p.publication_id=$1 AND p.printing_id=r.id LEFT JOIN optional_price_observations o ON o.publication_id=$1 AND o.printing_id=p.printing_id AND o.finish=r.finish LEFT JOIN optional_price_printings e ON e.publication_id=$1 AND e.printing_id=o.english_printing_id LEFT JOIN optional_price_observations eo ON eo.publication_id=$1 AND eo.printing_id=e.printing_id AND eo.finish=r.finish ORDER BY r.ordinality`,
				[publication.id, pairs.map((p) => p.printingId), pairs.map((p) => p.finish)]
			)
		).rows;
		for (const [index, pair] of pairs.entries()) {
			const row = rows[index];
			selections[index].push({
				source: state.source,
				enabled: true,
				publication,
				descriptor: state.descriptor,
				selection: row
			});
			const links = baseline[index].links;
			const unknown = (reason: Extract<PriceReference, { kind: 'Unknown' }>['reason']) =>
				candidates[index].push({
					reference: { ...pair, links, kind: 'Unknown', reason }
				});
			const exact = amount(row.amount),
				english = amount(row.english_amount);
			if (!row.printing_id) {
				unknown('PrintingMissing');
				continue;
			}
			if (!row.supported) {
				unknown('UnsupportedFinish');
				continue;
			}
			const freshness = referenceFreshness(publication, now);
			if (!freshness) {
				unknown('ReferenceExpired');
				continue;
			}
			const fallback = exact === null && row.english_printing_id && row.english_supported;
			const selected = fallback ? english : exact;
			if (selected === null) {
				unknown(
					row.identity?.lang !== 'en' ? (row.mapping_reason ?? 'AmountMissing') : 'AmountMissing'
				);
				continue;
			}
			const providerId = fallback ? row.english_provider_id : row.provider_id;
			const matchedPrintingId = fallback ? row.english_printing_id : pair.printingId;
			const requestedIdentity = row.identity,
				matchedIdentity = fallback ? row.english_identity : row.identity;
			if (typeof matchedPrintingId !== 'string' || !requestedIdentity || !matchedIdentity)
				throw Error('Invalid stored printing identity');
			const origin = referenceOrigin(state.source, pair.finish, providerId);
			if (row.measure !== origin.measure) throw Error('Invalid stored source measure');
			const reference: Extract<PriceReference, { kind: 'Known' }> = {
				...pair,
				links,
				kind: 'Known',
				amount: selected,
				currency: 'EUR',
				...origin,
				freshness,
				publicationId: publication.id,
				observationId: [publication.id, matchedPrintingId, pair.finish, origin.measure].join(':'),
				matchedPrintingId,
				matchedFinish: pair.finish,
				provenance: fallback ? 'EnglishFallback' : 'Exact',
				...(publication.timePrecision === 'Instant'
					? { timePrecision: 'Instant', sourceTime: publication.sourceTime }
					: {
							timePrecision: 'Day',
							sourceDate: publication.sourceDate,
							asOf: now.toISOString(),
							freshnessPolicy: 'day-upper-bound-utc-start-v1'
						})
			};
			candidates[index].push({
				reference,
				evidence: {
					reference,
					publication,
					descriptor: state.descriptor,
					requestedIdentity,
					matchedIdentity,
					mappingVersion: publication.mappingVersion,
					rawValue: fallback ? row.english_raw_value : row.raw_value
				}
			});
		}
	}
	return { publications, statuses, candidates, selections };
}
