import { pool } from '#lib/server/db/client.ts';
import type { CardDocument, FacetResponse, SearchResult } from '#lib/search/types.ts';
import type { ParsedDecklistLine } from '#lib/server/mtg/decklist.ts';
import { ValidationError } from '#lib/server/mtg/validation.ts';
import { parseCatalogSearchRequest, type CatalogSearchInput } from './query.ts';

interface SearchRow {
	hits: CardDocument[];
	total: number;
	generation_id: string | null;
	facets: FacetResponse;
}

function uuid(value: string): string {
	if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value))
		throw new ValidationError('Invalid catalog card ID');
	return value;
}

function literalLike(value: string): string {
	return value.replace(/[\\%_]/g, '\\$&');
}

export async function searchCatalogRequest(input: CatalogSearchInput): Promise<SearchResult> {
	const started = performance.now();
	const values: unknown[] = [];
	const bind = (value: unknown) => {
		values.push(value);
		return `$${values.length}`;
	};
	const where: string[] = [];
	const query = input.query.toLowerCase();
	let relevance = '0';
	if (query) {
		const q = bind(query);
		const contains = bind(`%${literalLike(query)}%`);
		const prefix = bind(`${literalLike(query)}%`);
		const fuzzy = query.length >= 3 && /[a-z]/i.test(query) ? `p.search_name %> ${q}` : 'false';
		where.push(
			`(p.search_name LIKE ${contains} OR p.search_vector @@ plainto_tsquery('simple', ${q}) OR ${fuzzy})`
		);
		relevance = `CASE WHEN lower(p.name) = ${q} OR lower(p.printed_name) = ${q} THEN 5 WHEN lower(p.name) LIKE ${prefix} OR lower(p.printed_name) LIKE ${prefix} THEN 4 WHEN p.search_vector @@ plainto_tsquery('simple', ${q}) THEN 3 WHEN p.search_name LIKE ${contains} THEN 2 ELSE 1 END`;
	}
	const filters = input.filters;
	if (filters.colors?.length) {
		const colored = filters.colors.filter((color) => color !== 'C');
		const matches = colored.length
			? `(p.colors <@ ${bind(colored)}::text[] AND cardinality(p.colors) > 0)`
			: 'false';
		where.push(
			filters.colors.includes('C') ? `(cardinality(p.colors) = 0 OR ${matches})` : matches
		);
	}
	if (filters.colorIdentity?.length) {
		const palette = filters.colorIdentity.filter((color) => color !== 'C');
		where.push(`p.document->'color_identity' <@ ${bind(JSON.stringify(palette))}::jsonb`);
	}
	if (filters.rarities?.length) where.push(`p.rarity = ANY(${bind(filters.rarities)}::text[])`);
	if (filters.types?.length) where.push(`p.card_types && ${bind(filters.types)}::text[]`);
	if (filters.sets?.length) where.push(`p.set_code = ANY(${bind(filters.sets)}::text[])`);
	if (filters.legalities?.length)
		where.push(
			`(${filters.legalities.map((format) => `p.legalities @> ${bind(JSON.stringify({ [format]: 'legal' }))}::jsonb`).join(' OR ')})`
		);
	const order =
		input.sort === 'name:desc'
			? 'name DESC, oracle_id'
			: input.sort === 'name:asc' || !query
				? 'name ASC, oracle_id'
				: 'relevance DESC, name ASC, oracle_id';
	const limit = bind(input.limit);
	const offset = bind(input.offset);
	const facets = input.facets
		? `jsonb_build_object(
		'colors', (SELECT COALESCE(jsonb_object_agg(value, n), '{}'::jsonb) FROM (SELECT color AS value, count(DISTINCT oracle_id)::int AS n FROM matched CROSS JOIN LATERAL unnest(CASE WHEN cardinality(colors)=0 THEN ARRAY['C']::text[] ELSE colors END) AS color GROUP BY color) f),
		'rarity', (SELECT COALESCE(jsonb_object_agg(value, n), '{}'::jsonb) FROM (SELECT rarity AS value, count(DISTINCT oracle_id)::int AS n FROM matched GROUP BY rarity) f),
		'set_code', (SELECT COALESCE(jsonb_object_agg(value, n), '{}'::jsonb) FROM (SELECT set_code AS value, count(DISTINCT oracle_id)::int AS n FROM matched GROUP BY set_code) f)
	)`
		: `'{}'::jsonb`;
	const result = await pool.query<SearchRow>(
		`
		WITH active AS MATERIALIZED (SELECT active_generation AS id FROM catalog_state WHERE id=1),
		matched AS MATERIALIZED (SELECT p.generation_id,p.id,p.oracle_id,p.name,p.lang,p.document->>'released_at' AS released_at,p.colors,p.rarity,p.set_code,${relevance} AS relevance FROM catalog_printings p JOIN active a ON a.id=p.generation_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}),
		chosen AS (SELECT *, row_number() OVER(PARTITION BY oracle_id ORDER BY relevance DESC, (lang='en') DESC, released_at DESC, id) AS choice FROM matched),
		cards AS MATERIALIZED (SELECT * FROM chosen WHERE choice=1),
		page AS (SELECT generation_id,id,row_number() OVER(ORDER BY ${order}) AS position FROM cards ORDER BY ${order} LIMIT ${limit} OFFSET ${offset})
		SELECT COALESCE((SELECT jsonb_agg(p.document ORDER BY page.position) FROM page JOIN catalog_printings p ON p.generation_id=page.generation_id AND p.id=page.id), '[]'::jsonb) AS hits,
		(SELECT count(*)::int FROM cards) AS total, (SELECT id FROM active) AS generation_id,
		${facets} AS facets`,
		values
	);
	const row = result.rows[0];
	return {
		hits: row.hits,
		query: input.query,
		processingTimeMs: Math.round(performance.now() - started),
		estimatedTotalHits: row.total,
		generationId: row.generation_id,
		...(input.facets ? { facets: row.facets } : {})
	};
}

export async function searchCatalog(query: string, limit = 20, offset = 0): Promise<SearchResult> {
	return searchCatalogRequest(parseCatalogSearchRequest({ query, limit, offset }));
}

export async function getPrintings(
	oracleId: string,
	limit = 100,
	offset = 0
): Promise<SearchResult> {
	const started = performance.now();
	uuid(oracleId);
	parseCatalogSearchRequest({ limit, offset });
	const result = await pool.query<SearchRow>(
		`
		WITH active AS MATERIALIZED (SELECT active_generation AS id FROM catalog_state WHERE id=1),
		matched AS MATERIALIZED (SELECT p.generation_id,p.id,p.set_code,p.collector_number,p.lang FROM catalog_printings p JOIN active a ON a.id=p.generation_id WHERE p.oracle_id=$1::uuid),
		page AS (SELECT generation_id,id,row_number() OVER(ORDER BY set_code,collector_number,lang,id) AS position FROM matched ORDER BY set_code,collector_number,lang,id LIMIT $2 OFFSET $3)
		SELECT COALESCE((SELECT jsonb_agg(p.document ORDER BY page.position) FROM page JOIN catalog_printings p ON p.generation_id=page.generation_id AND p.id=page.id),'[]'::jsonb) AS hits,
		(SELECT count(*)::int FROM matched) AS total,(SELECT id FROM active) AS generation_id`,
		[oracleId, limit, offset]
	);
	const row = result.rows[0];
	return {
		hits: row.hits,
		query: '',
		processingTimeMs: Math.round(performance.now() - started),
		estimatedTotalHits: row.total,
		generationId: row.generation_id
	};
}

export async function getCatalogPrinting(id: string): Promise<CardDocument> {
	const result = await pool.query<{ document: CardDocument }>(
		`SELECT p.document FROM catalog_printings p JOIN catalog_state s ON s.id=1 AND s.active_generation=p.generation_id WHERE p.id=$1::uuid`,
		[uuid(id)]
	);
	if (!result.rows[0]) throw new ValidationError('Catalog printing not found');
	return result.rows[0].document;
}

export async function resolveCatalogCandidates(line: ParsedDecklistLine): Promise<CardDocument[]> {
	const values: unknown[] = [line.normalizedName, line.name.toLowerCase()];
	let printing = '';
	if (line.setCode) {
		values.push(line.setCode.toLowerCase());
		printing += ` AND p.set_code=$${values.length}`;
	}
	if (line.collectorNumber) {
		values.push(line.collectorNumber);
		printing += ` AND p.collector_number=$${values.length}`;
	}
	const selection = line.setCode
		? 'SELECT document FROM matched ORDER BY lang,id LIMIT 100'
		: `SELECT document FROM (SELECT DISTINCT ON (oracle_id) document,oracle_id FROM matched ORDER BY oracle_id,(lang='en') DESC,document->>'released_at' DESC,id) cards LIMIT 100`;
	const result = await pool.query<{ document: CardDocument }>(
		`WITH matched AS (SELECT p.* FROM catalog_printings p JOIN catalog_state s ON s.id=1 AND s.active_generation=p.generation_id WHERE (p.normalized_name=$1 OR $1=ANY(string_to_array(p.normalized_name,' // ')) OR lower(p.printed_name)=$2 OR $2=ANY(string_to_array(lower(p.printed_name),' // '))) ${printing}) ${selection}`,
		values
	);
	return result.rows.map((row) => row.document);
}
