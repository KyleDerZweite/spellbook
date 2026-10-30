"""Validation at the application boundary without interpreting query operators."""

import pytest

from spellbook_core.errors import ValidationError
from spellbook_core.mtg.power_search import query_parameters


@pytest.mark.parametrize("query", ["😀" * 151, "a" * 301, "a\x00b"])
def test_query_limit(query: str) -> None:
    with pytest.raises(ValidationError):
        query_parameters(query)


@pytest.mark.parametrize("query", ["123", "' | ! : &", "x'); DROP TABLE decks; --", "Sol Ring"])
def test_literal_tokens(query: str) -> None:
    _, prefix, _, _ = query_parameters(query)
    assert all(c.isalnum() or c in "' :*&" for c in prefix)
    assert query_parameters("😀" * 150)
