import json
from pathlib import Path

import pytest

from worker.transform import MULTI_FACE_LAYOUTS, SKIP_LAYOUTS, transform_card

FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


class TestTransformNormalCard:
    """Test transformation of a standard single-face card."""

    @pytest.fixture
    def doc(self):
        return transform_card(load_fixture("normal_card.json"))

    def test_id(self, doc):
        assert doc["id"] == "1a05204e-7f55-4bfe-8440-6be38b225c52"

    def test_oracle_id(self, doc):
        assert doc["oracle_id"] == "68954295-54e3-4303-a6bc-fc4547a4e3a3"

    def test_name(self, doc):
        assert doc["name"] == "Llanowar Elves"

    def test_type_line(self, doc):
        assert doc["type_line"] == "Creature \u2014 Elf Druid"

    def test_oracle_text(self, doc):
        assert doc["oracle_text"] == "{T}: Add {G}."

    def test_mana_cost(self, doc):
        assert doc["mana_cost"] == "{G}"

    def test_cmc(self, doc):
        assert doc["cmc"] == 1.0

    def test_colors(self, doc):
        assert doc["colors"] == ["G"]

    def test_color_identity(self, doc):
        assert doc["color_identity"] == ["G"]

    def test_rarity(self, doc):
        assert doc["rarity"] == "common"

    def test_set_code(self, doc):
        assert doc["set_code"] == "dom"

    def test_set_name(self, doc):
        assert doc["set_name"] == "Dominaria"

    def test_collector_number(self, doc):
        assert doc["collector_number"] == "168"

    def test_lang(self, doc):
        assert doc["lang"] == "en"

    def test_released_at(self, doc):
        assert doc["released_at"] == "2018-04-27"

    def test_layout(self, doc):
        assert doc["layout"] == "normal"

    def test_power(self, doc):
        assert doc["power"] == "1"

    def test_toughness(self, doc):
        assert doc["toughness"] == "1"

    def test_foil_available(self, doc):
        assert doc["is_foil_available"] is True

    def test_nonfoil_available(self, doc):
        assert doc["is_nonfoil_available"] is True

    def test_image_uri(self, doc):
        assert "normal" in doc["image_uri"]

    def test_image_uri_small(self, doc):
        assert "small" in doc["image_uri_small"]

    def test_no_back_face(self, doc):
        assert "back_face_name" not in doc


class TestTransformDFC:
    """Test transformation of a double-faced card (transform layout)."""

    @pytest.fixture
    def doc(self):
        return transform_card(load_fixture("dfc_card.json"))

    def test_name_includes_both_faces(self, doc):
        assert doc["name"] == "Delver of Secrets // Insectile Aberration"

    def test_layout(self, doc):
        assert doc["layout"] == "transform"

    def test_image_from_front_face(self, doc):
        assert "front" in doc["image_uri"]
        assert "front" in doc["image_uri_small"]

    def test_oracle_text_from_front(self, doc):
        assert "look at the top card" in doc["oracle_text"]

    def test_back_face_name(self, doc):
        assert doc["back_face_name"] == "Insectile Aberration"

    def test_back_face_image(self, doc):
        assert "back" in doc["back_face_image_uri"]

    def test_foil_unavailable(self, doc):
        assert doc["is_foil_available"] is False

    def test_nonfoil_available(self, doc):
        assert doc["is_nonfoil_available"] is True


class TestTransformSplitCard:
    """Test transformation of a split card (Fire // Ice)."""

    @pytest.fixture
    def doc(self):
        return transform_card(load_fixture("split_card.json"))

    def test_name(self, doc):
        assert doc["name"] == "Fire // Ice"

    def test_layout(self, doc):
        assert doc["layout"] == "split"

    def test_oracle_text_combines_faces(self, doc):
        assert "Fire deals 2 damage" in doc["oracle_text"]
        assert "Tap target permanent" in doc["oracle_text"]

    def test_has_image(self, doc):
        assert doc["image_uri"] is not None
        assert doc["image_uri"] != ""


class TestTransformAdventure:
    """Test transformation of an adventure card (Bonecrusher Giant)."""

    @pytest.fixture
    def doc(self):
        return transform_card(load_fixture("adventure_card.json"))

    def test_name(self, doc):
        assert doc["name"] == "Bonecrusher Giant // Stomp"

    def test_layout(self, doc):
        assert doc["layout"] == "adventure"

    def test_oracle_text_combines_faces(self, doc):
        assert "becomes the target" in doc["oracle_text"]
        assert "Damage can't be prevented" in doc["oracle_text"]

    def test_power_toughness(self, doc):
        assert doc["power"] == "4"
        assert doc["toughness"] == "3"


class TestTransformSkipLayouts:
    """Test that non-game card layouts are skipped."""

    @pytest.mark.parametrize(
        "layout",
        ["token", "double_faced_token", "art_series", "emblem", "planar", "scheme", "vanguard"],
    )
    def test_skip_layout_returns_none(self, layout):
        card = {"object": "card", "id": "skip-1", "layout": layout, "name": "Skipped"}
        assert transform_card(card) is None


class TestTransformEdgeCases:
    """Test edge cases and missing data."""

    def test_missing_id_returns_none(self):
        card = {"object": "card", "oracle_id": "abc", "layout": "normal", "name": "X"}
        assert transform_card(card) is None

    def test_missing_oracle_id_returns_none(self):
        card = {"object": "card", "id": "abc", "layout": "normal", "name": "X"}
        assert transform_card(card) is None

    def test_empty_id_returns_none(self):
        card = {"object": "card", "id": "", "oracle_id": "abc", "layout": "normal", "name": "X"}
        assert transform_card(card) is None

    def test_missing_oracle_text_defaults_empty(self):
        card = {
            "object": "card",
            "id": "abc",
            "oracle_id": "def",
            "layout": "normal",
            "name": "Vanilla Creature",
            "finishes": ["nonfoil"],
        }
        doc = transform_card(card)
        assert doc["oracle_text"] == ""

    def test_null_colors_defaults_empty_list(self):
        card = {
            "object": "card",
            "id": "abc",
            "oracle_id": "def",
            "layout": "normal",
            "name": "Colorless",
            "colors": None,
            "finishes": ["nonfoil"],
        }
        doc = transform_card(card)
        assert doc["colors"] == []

    def test_etched_foil_counts_as_foil(self):
        card = {
            "object": "card",
            "id": "abc",
            "oracle_id": "def",
            "layout": "normal",
            "name": "Etched",
            "finishes": ["etched"],
        }
        doc = transform_card(card)
        assert doc["is_foil_available"] is True
        assert doc["is_nonfoil_available"] is False

    def test_multi_face_with_empty_faces_falls_back(self):
        card = {
            "object": "card",
            "id": "abc",
            "oracle_id": "def",
            "layout": "transform",
            "name": "Broken DFC",
            "card_faces": [],
            "finishes": ["nonfoil"],
        }
        doc = transform_card(card)
        assert doc["oracle_text"] == ""
        assert doc["image_uri"] == ""


class TestLayoutSets:
    """Verify the layout classification sets are correct."""

    def test_skip_layouts_are_non_game(self):
        assert "token" in SKIP_LAYOUTS
        assert "art_series" in SKIP_LAYOUTS
        assert "normal" not in SKIP_LAYOUTS

    def test_multi_face_includes_all_dfc_types(self):
        assert "transform" in MULTI_FACE_LAYOUTS
        assert "modal_dfc" in MULTI_FACE_LAYOUTS
        assert "split" in MULTI_FACE_LAYOUTS
        assert "adventure" in MULTI_FACE_LAYOUTS
        assert "normal" not in MULTI_FACE_LAYOUTS
