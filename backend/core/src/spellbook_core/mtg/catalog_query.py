"""Catalog search validation and parameterized active-generation query."""

import json
import re
from dataclasses import dataclass

from spellbook_core.errors import ValidationError
from spellbook_core.validation import js_trim, utf16_length

_ALLOWED = {
    "colors": ["W", "U", "B", "R", "G", "C"],
    "colorIdentity": ["W", "U", "B", "R", "G", "C"],
    "rarities": ["common", "uncommon", "rare", "mythic"],
    "types": [
        "Creature",
        "Instant",
        "Sorcery",
        "Enchantment",
        "Artifact",
        "Planeswalker",
        "Land",
        "Battle",
        "Kindred",
    ],
    "legalities": [
        "standard",
        "pioneer",
        "modern",
        "legacy",
        "vintage",
        "commander",
        "pauper",
        "brawl",
    ],
}


@dataclass(frozen=True)
class ColorMatch:
    field: str
    any_colors: list[str]
    all_colors: list[str]


def parse_color_match(value: object) -> ColorMatch:
    if not isinstance(value, dict):
        raise ValidationError("colorMatch must be an object")
    if set(value) - {"field", "any", "all"} or value.get("field") not in ("color", "identity"):
        raise ValidationError("Invalid colorMatch field")
    groups: list[list[str]] = []
    for key in ("any", "all"):
        items = value.get(key)
        if (
            not isinstance(items, list)
            or len(items) > 6
            or any(
                not isinstance(color, str) or color not in _ALLOWED["colors"] for color in items
            )
        ):
            raise ValidationError(f"colorMatch.{key} must contain at most 6 known colors")
        groups.append(list(dict.fromkeys(items)))
    if set(groups[0]) & set(groups[1]):
        raise ValidationError("A color cannot be both OR and AND")
    return ColorMatch(value["field"], groups[0], groups[1])


@dataclass(frozen=True)
class CatalogSearch:
    query: str
    filters: dict[str, list[str]]
    limit: int
    offset: int
    sort: str | None
    facets: bool
    color_match: ColorMatch | None = None


def parse_catalog_search_request(value: object) -> CatalogSearch:
    if not isinstance(value, dict):
        raise ValidationError("Search request must be an object")
    if set(value) - {"query", "filters", "limit", "offset", "sort", "facets"}:
        raise ValidationError("Unknown search option")
    query = value.get("query", "")
    if not isinstance(query, str) or utf16_length(query) > 300:
        raise ValidationError("query must be a string of at most 300 characters")
    raw_filters = value.get("filters", {})
    if not isinstance(raw_filters, dict):
        raise ValidationError("filters must be an object")
    filters: dict[str, list[str]] = {}
    color_match = None
    for key, items in raw_filters.items():
        if key == "colorMatch":
            color_match = parse_color_match(items)
            continue
        if key not in _ALLOWED and key != "sets":
            raise ValidationError(f"Unknown filter: {key}")
        if (
            not isinstance(items, list)
            or len(items) > 100
            or any(not isinstance(item, str) for item in items)
        ):
            raise ValidationError(f"{key} must be an array of at most 100 strings")
        normalized = [item.lower() for item in items] if key == "sets" else items
        if any(
            not re.fullmatch("[a-z0-9]{1,12}", item)
            if key == "sets"
            else item not in _ALLOWED[key]
            for item in normalized
        ):
            raise ValidationError(f"Invalid {key} filter")
        filters[key] = list(dict.fromkeys(normalized))
    integers: list[int] = []
    for name, default, maximum in [("limit", 20, 500), ("offset", 0, 1000000)]:
        number = value.get(name, default)
        if (
            isinstance(number, bool)
            or not isinstance(number, int | float)
            or not (0 <= number <= maximum and number == int(number))
        ):
            raise ValidationError(f"{name} must be an integer between 0 and {maximum}")
        integers.append(int(number))
    sort = value.get("sort")
    if "sort" in value and sort not in ("name:asc", "name:desc"):
        raise ValidationError("Invalid search sort")
    facets = value.get("facets", False)
    if not isinstance(facets, bool):
        raise ValidationError("facets must be a boolean")
    return CatalogSearch(
        js_trim(query), filters, integers[0], integers[1], sort, facets, color_match
    )


def search_sql(input: CatalogSearch) -> tuple[str, list[object]]:
    values: list[object] = []

    def bind(value: object) -> str:
        values.append(value)
        return f"${len(values)}"

    where: list[str] = []
    query = input.query.lower()
    relevance = "0"
    if query:
        q = bind(query)
        literal = re.sub(r"([\\%_])", r"\\\1", query)
        contains, prefix = bind(f"%{literal}%"), bind(f"{literal}%")
        fuzzy = (
            f"p.search_name %> {q}"
            if utf16_length(query) >= 3 and re.search("[a-z]", query)
            else "false"
        )
        where.append(
            f"(p.search_name LIKE {contains} "
            f"OR p.search_vector @@ plainto_tsquery('simple', {q}) OR {fuzzy})"
        )
        relevance = (
            f"CASE WHEN lower(p.name) = {q} OR lower(p.printed_name) = {q} THEN 5 "
            f"WHEN lower(p.name) LIKE {prefix} OR lower(p.printed_name) LIKE {prefix} THEN 4 "
            f"WHEN p.search_vector @@ plainto_tsquery('simple', {q}) THEN 3 "
            f"WHEN p.search_name LIKE {contains} THEN 2 ELSE 1 END"
        )
    filters = input.filters
    if (match := input.color_match) and (match.any_colors or match.all_colors):
        if match.field == "identity":
            bits = {"W": 1, "U": 2, "B": 4, "R": 8, "G": 16, "C": 0}

            def accepts(mask: int, color: str) -> bool:
                return mask == 0 if color == "C" else bool(mask & bits[color])

            masks = [
                mask
                for mask in range(32)
                if (not match.any_colors or any(accepts(mask, c) for c in match.any_colors))
                and all(accepts(mask, c) for c in match.all_colors)
            ]
            where.append(f"p.color_identity_mask = ANY({bind(masks)}::smallint[])")
        else:
            if match.any_colors:
                colored = [color for color in match.any_colors if color != "C"]
                options = [f"p.colors && {bind(colored)}::text[]"] if colored else []
                if "C" in match.any_colors:
                    options.append("cardinality(p.colors) = 0")
                where.append("(" + " OR ".join(options) + ")")
            if match.all_colors:
                colored = [color for color in match.all_colors if color != "C"]
                if colored:
                    where.append(f"p.colors @> {bind(colored)}::text[]")
                if "C" in match.all_colors:
                    where.append("cardinality(p.colors) = 0")
    if colors := filters.get("colors"):
        colored = [color for color in colors if color != "C"]
        matches = (
            f"(p.colors <@ {bind(colored)}::text[] AND cardinality(p.colors) > 0)"
            if colored
            else "false"
        )
        where.append(f"(cardinality(p.colors) = 0 OR {matches})" if "C" in colors else matches)
    if identity := filters.get("colorIdentity"):
        mask = 0
        for color in identity:
            mask |= {"W": 1, "U": 2, "B": 4, "R": 8, "G": 16, "C": 0}[color]
        where.append(
            "p.color_identity_mask = ANY("
            f"{bind([n for n in range(32) if n & mask == n])}::smallint[])"
        )
    for key, column, op in [
        ("rarities", "rarity", "any"),
        ("types", "card_types", "overlap"),
        ("sets", "set_code", "any"),
    ]:
        if items := filters.get(key):
            parameter = bind(items)
            where.append(
                f"p.{column} = ANY({parameter}::text[])"
                if op == "any"
                else f"p.{column} && {parameter}::text[]"
            )
    if legalities := filters.get("legalities"):
        where.append(
            "("
            + " OR ".join(
                f"p.legalities @> {bind(json.dumps({name: 'legal'}))}::jsonb"
                for name in legalities
            )
            + ")"
        )
    order = (
        "name DESC, oracle_id"
        if input.sort == "name:desc"
        else (
            "name ASC, oracle_id"
            if input.sort == "name:asc" or not query
            else "relevance DESC, name ASC, oracle_id"
        )
    )
    limit, offset = bind(input.limit), bind(input.offset)
    facets = "'{}'::jsonb"
    if input.facets:
        facets = """
        jsonb_build_object( 'colors' , (SELECT COALESCE(jsonb_object_agg(value, n), '{}' ::jsonb)
        FROM (SELECT value, count(*)::int AS n FROM (SELECT DISTINCT oracle_id, color AS value
        FROM (SELECT DISTINCT oracle_id, colors FROM matched) color_cards CROSS JOIN LATERAL
        unnest(CASE WHEN cardinality(colors)=0 THEN ARRAY[ 'C' ]::text[] ELSE colors END) AS
        color) pairs GROUP BY value) f), 'rarity' , (SELECT COALESCE(jsonb_object_agg(value, n),
        '{}' ::jsonb) FROM (SELECT value, count(*)::int AS n FROM (SELECT DISTINCT oracle_id,
        rarity AS value FROM matched) pairs GROUP BY value) f), 'set_code' , (SELECT
        COALESCE(jsonb_object_agg(value, n), '{}' ::jsonb) FROM (SELECT value, count(*)::int AS n
        FROM (SELECT DISTINCT oracle_id, set_code AS value FROM matched) pairs GROUP BY value) f))
        """
    sql = f"""
    WITH active AS MATERIALIZED (SELECT active_generation AS id FROM catalog_state WHERE id=1),
    matched AS MATERIALIZED (SELECT p.generation_id,p.id,p.oracle_id,p.name,
p.lang{",p.colors,p.rarity,p.set_code" if input.facets else ""},{relevance}
AS relevance FROM catalog_printings p JOIN active a ON a.id=p.generation_id
{"WHERE " + " AND ".join(where) if where else ""}),
    preferences AS (SELECT oracle_id,max(relevance*2+(lang='en')::int) AS preference
FROM matched GROUP BY oracle_id),
    preferred AS MATERIALIZED (SELECT m.generation_id,m.id,m.oracle_id,m.name,
m.relevance FROM matched m JOIN preferences pref USING(oracle_id)
WHERE m.relevance*2+(m.lang='en')::int=pref.preference),
    names AS MATERIALIZED (SELECT oracle_id,min(name) AS name,max(name) AS max_name,
max(relevance) AS relevance FROM preferred GROUP BY oracle_id),
    mixed_names AS MATERIALIZED (SELECT oracle_id FROM names WHERE name<>max_name),
    mixed AS MATERIALIZED (SELECT m.oracle_id,m.name,row_number() OVER(PARTITION
BY m.oracle_id ORDER BY p.document->>'released_at' DESC,m.id) AS choice FROM
preferred m JOIN mixed_names n ON n.oracle_id=m.oracle_id JOIN catalog_printings
p ON p.generation_id=m.generation_id AND p.id=m.id),
    cards AS (SELECT n.oracle_id,COALESCE(m.name,n.name) AS name,n.relevance
FROM names n LEFT JOIN mixed m ON m.oracle_id=n.oracle_id AND m.choice=1),
    page AS (SELECT oracle_id,row_number() OVER(ORDER BY {order}) AS position
FROM cards ORDER BY {order} LIMIT {limit} OFFSET {offset}),
    page_candidates AS (SELECT m.generation_id,m.id,page.position,row_number()
OVER(PARTITION BY m.oracle_id ORDER BY p.document->>'released_at' DESC,m.id)
AS choice FROM page JOIN preferred m USING(oracle_id) JOIN catalog_printings
p ON p.generation_id=m.generation_id AND p.id=m.id)
    SELECT COALESCE((SELECT jsonb_agg(p.document ORDER BY page.position) FROM
page_candidates page JOIN catalog_printings p ON p.generation_id=page.generation_id
AND p.id=page.id WHERE page.choice=1),'[]'::jsonb),
    (SELECT count(*)::int FROM names),(SELECT id FROM active),{facets}
    """
    return sql, values
