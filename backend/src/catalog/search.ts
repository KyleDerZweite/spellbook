import type { Pool } from 'pg';
import type {
	CardDocument,
	FacetResponse,
	SearchResult,
	CatalogApplication
} from '@spellbook/contracts/catalog.ts';
import type { CatalogCandidateInput } from '@spellbook/contracts/catalog.ts';
import { ValidationError } from '../mtg/validation.ts';
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

function printingDto(document: CardDocument): CardDocument {
	return {
		id: document.id,
		game: document.game,
		oracle_id: document.oracle_id,
		name: document.name,
		printed_name: document.printed_name,
		normalized_name: document.normalized_name,
		lang: document.lang,
		released_at: document.released_at,
		layout: document.layout,
		mana_cost: document.mana_cost,
		cmc: document.cmc,
		type_line: document.type_line,
		oracle_text: document.oracle_text,
		colors: document.colors,
		color_identity: document.color_identity,
		keywords: document.keywords,
		card_types: document.card_types,
		power: document.power,
		toughness: document.toughness,
		rarity: document.rarity,
		set_code: document.set_code,
		set_name: document.set_name,
		collector_number: document.collector_number,
		image_uri: document.image_uri,
		image_uri_small: document.image_uri_small,
		is_foil_available: document.is_foil_available,
		is_nonfoil_available: document.is_nonfoil_available,
		legalities: document.legalities,
		back_face_name: document.back_face_name,
		back_face_image_uri: document.back_face_image_uri
	};
}

function copyFacets(facets: FacetResponse): FacetResponse {
	return {
		colors: { ...facets.colors },
		rarity: { ...facets.rarity },
		set_code: { ...facets.set_code }
	};
}

export function createCatalog(pool: Pool) {
	let unfilteredFacets: { generationId: string; facets: FacetResponse } | undefined;
	async function searchCatalogRequest(request: CatalogSearchInput): Promise<SearchResult> {
		const input = parseCatalogSearchRequest(request);
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
		const memoEligible =
			input.facets && !query && !Object.values(filters).some((values) => values.length);
		const observedMemo = unfilteredFacets;
		const memo = memoEligible ? observedMemo : undefined;
		const limit = bind(input.limit);
		const offset = bind(input.offset);
		async function execute(includeFacets: boolean) {
			const facets = includeFacets
				? `jsonb_build_object(
		'colors', (SELECT COALESCE(jsonb_object_agg(value, n), '{}'::jsonb) FROM (SELECT value,count(*)::int AS n FROM (SELECT DISTINCT oracle_id,color AS value FROM (SELECT DISTINCT oracle_id,colors FROM matched) color_cards CROSS JOIN LATERAL unnest(CASE WHEN cardinality(colors)=0 THEN ARRAY['C']::text[] ELSE colors END) AS color) pairs GROUP BY value) f),
		'rarity', (SELECT COALESCE(jsonb_object_agg(value, n), '{}'::jsonb) FROM (SELECT value,count(*)::int AS n FROM (SELECT DISTINCT oracle_id,rarity AS value FROM matched) pairs GROUP BY value) f),
		'set_code', (SELECT COALESCE(jsonb_object_agg(value, n), '{}'::jsonb) FROM (SELECT value,count(*)::int AS n FROM (SELECT DISTINCT oracle_id,set_code AS value FROM matched) pairs GROUP BY value) f)
	)`
				: `'{}'::jsonb`;
			// Materialize mixed-name identities before joining; selective filters can underestimate broad matches.
			// Deduplicate facet pairs before counting; resolve dates only for page candidates and mixed names.
			const result = await pool.query<SearchRow>(
				`
		WITH active AS MATERIALIZED (SELECT active_generation AS id FROM catalog_state WHERE id=1),
		matched AS MATERIALIZED (SELECT p.generation_id,p.id,p.oracle_id,p.name,p.lang${includeFacets ? ',p.colors,p.rarity,p.set_code' : ''},${relevance} AS relevance FROM catalog_printings p JOIN active a ON a.id=p.generation_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}),
		preferences AS (SELECT oracle_id,max(relevance*2+(lang='en')::int) AS preference FROM matched GROUP BY oracle_id),
		preferred AS MATERIALIZED (SELECT m.generation_id,m.id,m.oracle_id,m.name,m.relevance FROM matched m JOIN preferences pref USING(oracle_id) WHERE m.relevance*2+(m.lang='en')::int=pref.preference),
		names AS MATERIALIZED (SELECT oracle_id,min(name) AS name,max(name) AS max_name,max(relevance) AS relevance FROM preferred GROUP BY oracle_id),
		mixed_names AS MATERIALIZED (SELECT oracle_id FROM names WHERE name<>max_name),
		mixed AS MATERIALIZED (SELECT m.oracle_id,m.name,row_number() OVER(PARTITION BY m.oracle_id ORDER BY p.document->>'released_at' DESC,m.id) AS choice FROM preferred m JOIN mixed_names n ON n.oracle_id=m.oracle_id JOIN catalog_printings p ON p.generation_id=m.generation_id AND p.id=m.id),
		cards AS (SELECT n.oracle_id,COALESCE(m.name,n.name) AS name,n.relevance FROM names n LEFT JOIN mixed m ON m.oracle_id=n.oracle_id AND m.choice=1),
		page AS (SELECT oracle_id,row_number() OVER(ORDER BY ${order}) AS position FROM cards ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}),
		page_candidates AS (SELECT m.generation_id,m.id,page.position,row_number() OVER(PARTITION BY m.oracle_id ORDER BY p.document->>'released_at' DESC,m.id) AS choice FROM page JOIN preferred m USING(oracle_id) JOIN catalog_printings p ON p.generation_id=m.generation_id AND p.id=m.id)
		SELECT COALESCE((SELECT jsonb_agg(p.document ORDER BY page.position) FROM page_candidates page JOIN catalog_printings p ON p.generation_id=page.generation_id AND p.id=page.id WHERE page.choice=1), '[]'::jsonb) AS hits,
		(SELECT count(*)::int FROM names) AS total, (SELECT id FROM active) AS generation_id,
		${facets} AS facets`,
				values
			);
			return result.rows[0];
		}
		let row = await execute(Boolean(input.facets && !memo));
		const memoMatches = memo && row.generation_id === memo.generationId && row.total > 0;
		if (memo && !memoMatches) row = await execute(true);
		const resultFacets = memoMatches ? memo.facets : row.facets;
		if (memoEligible && !memoMatches && unfilteredFacets === observedMemo) {
			unfilteredFacets =
				row.generation_id && row.total > 0
					? { generationId: row.generation_id, facets: copyFacets(resultFacets) }
					: undefined;
		}
		return {
			hits: row.hits.map(printingDto),
			query: input.query,
			processingTimeMs: Math.round(performance.now() - started),
			estimatedTotalHits: row.total,
			generationId: row.generation_id,
			...(input.facets ? { facets: copyFacets(resultFacets) } : {})
		};
	}

	async function searchCatalog(query: string, limit = 20, offset = 0): Promise<SearchResult> {
		return searchCatalogRequest(parseCatalogSearchRequest({ query, limit, offset }));
	}

	async function getCatalogSetNames(setCodes: readonly string[]): Promise<Record<string, string>> {
		const codes = [...new Set(setCodes.map((code) => code.trim().toLowerCase()).filter(Boolean))];
		if (codes.length === 0) return {};
		const result = await pool.query<{
			set_code: string;
			set_name: string | null;
		}>(
			`SELECT p.set_code, MIN(NULLIF(BTRIM(p.document->>'set_name'), '')) AS set_name
		FROM catalog_printings p
		JOIN catalog_state s ON s.id=1 AND s.active_generation=p.generation_id
		WHERE p.set_code=ANY($1::text[])
		GROUP BY p.set_code`,
			[codes]
		);
		return Object.fromEntries(
			result.rows.flatMap((row) => (row.set_name ? [[row.set_code, row.set_name]] : []))
		);
	}

	async function getPrintings(oracleId: string, limit = 100, offset = 0): Promise<SearchResult> {
		const started = performance.now();
		uuid(oracleId);
		if (!Number.isInteger(limit) || limit < 1 || limit > 100)
			throw new ValidationError('Printing limit must be an integer between 1 and 100');
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
			hits: row.hits.map(printingDto),
			query: '',
			processingTimeMs: Math.round(performance.now() - started),
			estimatedTotalHits: row.total,
			generationId: row.generation_id
		};
	}

	async function getCatalogPrinting(id: string): Promise<CardDocument> {
		const result = await pool.query<{ document: CardDocument }>(
			`SELECT p.document FROM catalog_printings p JOIN catalog_state s ON s.id=1 AND s.active_generation=p.generation_id WHERE p.id=$1::uuid`,
			[uuid(id)]
		);
		if (!result.rows[0]) throw new ValidationError('Catalog printing not found');
		return printingDto(result.rows[0].document);
	}

	async function resolveCatalogCandidates(line: CatalogCandidateInput): Promise<CardDocument[]> {
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
		return result.rows.map((row) => printingDto(row.document));
	}

	return {
		searchCatalogRequest,
		searchCatalog,
		getCatalogSetNames,
		getPrintings,
		getCatalogPrinting,
		resolveCatalogCandidates
	} satisfies CatalogApplication;
}
