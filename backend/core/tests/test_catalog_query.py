"""Search validation and query construction; native SQL is covered separately."""

import math

import pytest

from spellbook_core.errors import ValidationError
from spellbook_core.mtg.catalog import printing_dto
from spellbook_core.mtg.catalog_query import parse_catalog_search_request, search_sql


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


@pytest.mark.parametrize(
    "value",
    [
        None,
        [],
        {},
        {"field": "invalid", "any": [], "all": []},
        {"field": "color", "any": "W", "all": []},
        {"field": "color", "any": ["invalid"], "all": []},
        {"field": "color", "any": [], "all": ["B"] * 7},
        {"field": "color", "any": ["W"], "all": ["W"]},
        {"field": "color", "any": [], "all": [], "extra": True},
    ],
)
def test_color_match_rejects_invalid_or_ambiguous_expressions(value: object) -> None:
    with pytest.raises(ValidationError):
        parse_catalog_search_request({"filters": {"colorMatch": value}})


def test_printed_color_expression_combines_or_with_required_colors() -> None:
    sql, parameters = search_sql(
        parse_catalog_search_request(
            {"filters": {"colorMatch": {"field": "color", "any": ["W", "U"], "all": ["B"]}}}
        )
    )
    assert "p.colors && $1::text[]" in sql
    assert "p.colors @> $2::text[]" in sql
    assert parameters[:2] == [["W", "U"], ["B"]]
    assert "p.colors <@" not in sql


def test_identity_expression_matches_presence_including_additional_colors() -> None:
    _, parameters = search_sql(
        parse_catalog_search_request(
            {"filters": {"colorMatch": {"field": "identity", "any": ["W", "U"], "all": ["B"]}}}
        )
    )
    assert parameters[0] == [5, 6, 7, 13, 14, 15, 21, 22, 23, 29, 30, 31]


@pytest.mark.parametrize("field", ["color", "identity"])
def test_empty_color_expression_has_no_predicate(field: str) -> None:
    baseline, values = search_sql(parse_catalog_search_request({}))
    sql, parameters = search_sql(
        parse_catalog_search_request(
            {"filters": {"colorMatch": {"field": field, "any": [], "all": []}}}
        )
    )
    assert (sql, parameters) == (baseline, values)


def test_colorless_is_empty_set_and_cannot_be_required_with_a_colored_identity() -> None:
    def parameters(any_colors: list[str], all_colors: list[str]) -> list[object]:
        return search_sql(
            parse_catalog_search_request(
                {
                    "filters": {
                        "colorMatch": {"field": "identity", "any": any_colors, "all": all_colors}
                    }
                }
            )
        )[1]

    assert parameters(["C"], [])[0] == [0]
    assert parameters([], ["W", "C"])[0] == []
    assert parameters([], ["W", "U"])[0] == [3, 7, 11, 15, 19, 23, 27, 31]


@pytest.mark.parametrize("excluded", [None, "W", [1], ["w"], ["W"] * 7])
def test_color_match_rejects_malformed_not(excluded: object) -> None:
    with pytest.raises(ValidationError, match=r"colorMatch.not"):
        parse_catalog_search_request(
            {"filters": {"colorMatch": {"field": "color", "any": [], "all": [], "not": excluded}}}
        )


@pytest.mark.parametrize("group", ["any", "all"])
@pytest.mark.parametrize("color", ["W", "C"])
def test_color_match_rejects_not_overlap(group: str, color: str) -> None:
    expression: dict[str, object] = {"field": "identity", "any": [], "all": [], "not": [color]}
    expression[group] = [color]
    with pytest.raises(ValidationError):
        parse_catalog_search_request({"filters": {"colorMatch": expression}})


def test_color_match_defaults_and_deduplicates_each_group() -> None:
    from spellbook_core.mtg.catalog_query import ColorMatch, parse_color_match

    legacy = ColorMatch("color", [], [])
    other = ColorMatch("color", [], [])
    assert legacy.not_colors == []
    assert legacy.not_colors is not other.not_colors
    assert parse_color_match({"field": "color", "any": [], "all": []}) == legacy
    assert parse_color_match(
        {"field": "color", "any": ["W", "W"], "all": ["U", "U"], "not": ["B", "B"]}
    ) == ColorMatch("color", ["W"], ["U"], ["B"])


@pytest.mark.parametrize(
    "excluded,predicates,parameters",
    [
        (["R", "G"], ["NOT (p.colors && $1::text[])"], [["R", "G"], 20, 0]),
        (["C"], ["cardinality(p.colors) > 0"], [20, 0]),
        (
            ["W", "C"],
            ["NOT (p.colors && $1::text[])", "cardinality(p.colors) > 0"],
            [["W"], 20, 0],
        ),
    ],
)
def test_printed_not_only_activates_exclusion(
    excluded: list[str], predicates: list[str], parameters: list[object]
) -> None:
    sql, actual = search_sql(
        parse_catalog_search_request(
            {"filters": {"colorMatch": {"field": "color", "any": [], "all": [], "not": excluded}}}
        )
    )
    assert actual == parameters
    assert all(predicate in sql for predicate in predicates)


def test_printed_any_all_not_preserves_additional_colors_and_palette_filters() -> None:
    sql, parameters = search_sql(
        parse_catalog_search_request(
            {
                "filters": {
                    "colorMatch": {
                        "field": "color",
                        "any": ["W", "U"],
                        "all": ["B"],
                        "not": ["R", "C"],
                    },
                    "colors": ["W", "U", "B", "G"],
                    "colorIdentity": ["W", "U", "B", "G"],
                }
            }
        )
    )
    assert (
        "(p.colors && $1::text[]) AND p.colors @> $2::text[] "
        "AND NOT (p.colors && $3::text[]) AND cardinality(p.colors) > 0" in sql
    )
    assert parameters[:4] == [["W", "U"], ["B"], ["R"], ["W", "U", "B", "G"]]
    assert "p.colors <@ $4::text[]" in sql
    assert "p.color_identity_mask = ANY($5::smallint[])" in sql


@pytest.mark.parametrize(
    "any_colors,all_colors,excluded,expected",
    [
        ([], [], ["W", "U", "B", "R", "G"], [0]),
        ([], [], ["C"], list(range(1, 32))),
        ([], [], ["R"], list(range(8)) + list(range(16, 24))),
        (["W", "U"], ["B"], ["R"], [5, 6, 7, 21, 22, 23]),
        (["C", "W"], [], ["U"], [0, 1, 5, 9, 13, 17, 21, 25, 29]),
        ([], ["C"], ["W"], [0]),
        (["W"], [], ["C"], list(range(1, 32, 2))),
        ([], [], ["W", "U", "B", "R", "G", "C"], []),
    ],
)
def test_identity_not_enumerates_only_known_accepted_masks(
    any_colors: list[str], all_colors: list[str], excluded: list[str], expected: list[int]
) -> None:
    sql, parameters = search_sql(
        parse_catalog_search_request(
            {
                "filters": {
                    "colorMatch": {
                        "field": "identity",
                        "any": any_colors,
                        "all": all_colors,
                        "not": excluded,
                    }
                }
            }
        )
    )
    assert parameters == [expected, 20, 0]
    assert "p.color_identity_mask = ANY($1::smallint[])" in sql
    assert "IS NULL" not in sql
