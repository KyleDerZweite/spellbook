"""Functional validation transfer from the shared Profile/card client contract."""

import pytest

from spellbook_core.auth import normalize_username
from spellbook_core.auth_attempts import AttemptLimiter
from spellbook_core.errors import AuthError
from spellbook_core.profile import (
    ProfileError,
    default_profile_card,
    normalize_contact_email,
    validate_profile_card,
)


@pytest.mark.parametrize(
    "value,expected",
    [
        ("  ALICE_1\ufeff", "alice_1"),
        ("ab", None),
        (None, None),
        ("\u03b1lice", None),
        ("\x85alice", None),
        ("a-b", "a-b"),
    ],
)
def test_username_matches_node_trim_and_ascii(value: object, expected: str | None) -> None:
    assert normalize_username(value) == expected


@pytest.mark.parametrize(
    "value,expected",
    [
        ("  me+card@example.test ", "me+card@example.test"),
        ("", ""),
        (None, None),
        ("x@y", None),
        ("é@example.test", None),
        ("x@éxample.test", None),
        ("x" * 255, None),
    ],
)
def test_contact_email(value: object, expected: str | None) -> None:
    assert normalize_contact_email(value) == expected


def test_card_normalizes_text_and_retains_placeholders() -> None:
    card = default_profile_card("alice")
    card.update(
        name="  Wizard 🔮\ufeff",
        rulesText="\r\n{T}: Own {total_owned_cards} cards.\r{W/U/P}",
        power="{total_decks}",
        toughness="1+*",
    )
    result = validate_profile_card(card)
    assert result["name"] == "Wizard 🔮"
    assert result["rulesText"] == "{T}: Own {total_owned_cards} cards.\n{W/U/P}"
    assert result["power"] == "{total_decks}"
    assert result["toughness"] == "1+*"


@pytest.mark.parametrize(
    "patch,field,message",
    [
        ({"name": "🔮" * 21}, "name", "Use at most 40 characters."),
        ({"name": "\x00wizard"}, "name", "Remove control characters."),
        ({"name": "wizard\rnext"}, "name", "Use one line for this field."),
        (
            {"manaCost": "{T}"},
            "manaCost",
            "Use up to 8 mana symbols in braces, for example {2}{U}.",
        ),
        (
            {"manaCost": "{G}" * 9},
            "manaCost",
            "Use up to 8 mana symbols in braces, for example {2}{U}.",
        ),
        (
            {"rulesText": "{unknown}"},
            "rulesText",
            "Unknown placeholder {unknown}. Choose a value from Insert KPI.",
        ),
        (
            {"rulesText": "{"},
            "rulesText",
            "Close each placeholder with braces, for example {total_owned_cards}.",
        ),
        ({"power": "1"}, "toughness", "Fill both Power and Toughness, or leave both empty."),
        (
            {"power": "{T}", "toughness": "1"},
            "power",
            "Unknown placeholder {T}. Choose a value from Insert KPI.",
        ),
        ({"legendary": 1}, "legendary", "Choose a standard or legendary frame."),
        ({"rulesText": "\n".join("line" for _ in range(9))}, "rulesText", "Use at most 8 lines."),
        ({"frame": None}, "frame", "Choose a frame color."),
        ({"extra": "unknown"}, "form", "The card contains unsupported fields."),
    ],
)
def test_card_field_errors(patch: dict[str, object], field: str, message: str) -> None:
    with pytest.raises(ProfileError) as error:
        validate_profile_card({**default_profile_card("alice"), **patch})
    assert error.value.fields[field] == message


def test_attempt_windows_are_shared_fixed_and_bounded() -> None:
    limiter = AttemptLimiter(2, seconds=900, capacity=2)
    limiter.take("a", 0)
    limiter.take("a", 899)
    with pytest.raises(AuthError, match="15 minutes"):
        limiter.take("a", 899)
    limiter.take("b", 899)
    with pytest.raises(AuthError, match="Try again later"):
        limiter.take("c", 899)
    limiter.take("a", 900)
    limiter.take("a", 900)
    with pytest.raises(AuthError):
        limiter.take("a", 900)
