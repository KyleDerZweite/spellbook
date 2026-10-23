"""Search validation and query construction; native SQL is covered separately."""

import math

import pytest
from spellbook_core.catalog import printing_dto
from spellbook_core.catalog_query import parse_catalog_search_request, search_sql
from spellbook_core.errors import ValidationError


@pytest.mark.parametrize(
    "input,message",
    [
        (None, "Search request must be an object"),
        ([], "Search request must be an object"),
        ({"other": True}, "Unknown search option"),
        ({"query": None}, "query must be a string"),
        ({"query": "😀" * 151}, "query must be a string"),
        ({"filters": None}, "filters must be an object"),
        ({"filters": {"other": []}}, "Unknown filter"),
        ({"filters": {"sets": ["not-valid"]}}, "Invalid sets filter"),
        ({"filters": {"colors": "W"}}, "colors must be an array"),
        ({"filters": {"types": ["creature"]}}, "Invalid types filter"),
        ({"limit": True}, "limit must be an integer"),
        ({"limit": math.inf}, "limit must be an integer"),
        ({"offset": -1}, "offset must be an integer"),
        ({"sort": None}, "Invalid search sort"),
        ({"facets": None}, "facets must be a boolean"),
    ],
)
def test_search_rejects_wire_edge_cases(input: object, message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        parse_catalog_search_request(input)


def test_search_normalizes_sets_and_js_whitespace() -> None:
    input = parse_catalog_search_request(
        {
            "query": "\ufeffÄther\u00a0",
            "filters": {"sets": ["ABC", "abc"], "colors": ["C", "W", "W"]},
            "limit": 0.0,
            "offset": 1000000,
            "facets": True,
        }
    )
    assert input.query == "Äther"
    assert input.filters == {"sets": ["abc"], "colors": ["C", "W"]}
    assert input.limit == 0


def test_search_binds_untrusted_text_and_color_identity_subsets() -> None:
    text = "x%_\\' OR true"
    sql, parameters = search_sql(
        parse_catalog_search_request(
            {
                "query": text,
                "filters": {
                    "colors": ["C", "W"],
                    "colorIdentity": ["W", "U"],
                    "legalities": ["modern"],
                    "types": ["Land"],
                },
                "facets": True,
            }
        )
    )
    assert text not in sql
    assert parameters[:3] == [text.lower(), "%x\\%\\_\\\\' or true%", "x\\%\\_\\\\' or true%"]
    assert [0, 1, 2, 3] in parameters
    assert "cardinality(p.colors) = 0 OR" in sql
    assert "SELECT DISTINCT oracle_id, color AS value" in " ".join(sql.split())
    assert "p.search_name %> $1" in sql


def test_short_unicode_query_disables_latin_fuzzy_matching() -> None:
    sql, _ = search_sql(parse_catalog_search_request({"query": "東京"}))
    assert "%>" not in sql


def test_printing_projection_preserves_absence_and_explicit_null() -> None:
    result = printing_dto({"id": "printing", "printed_name": None, "internal": "secret"})
    assert dict(result) == {"id": "printing", "printed_name": None}
    assert "power" not in result
