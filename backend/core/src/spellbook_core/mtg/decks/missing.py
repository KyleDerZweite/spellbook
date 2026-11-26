"""Missing-card aggregation and shop/wants-list export formatting for one or more Decks."""

from collections.abc import Mapping, Sequence
from typing import Literal, TypedDict

from spellbook_core.mtg.decks.models import DeckCard, Document, OwnedPrinting
from spellbook_core.mtg.decks.rules import allocate_deck_availability
from spellbook_core.mtg.inventory_value import display_amount, exact_amount
from spellbook_core.mtg.models import CardDocument
from spellbook_core.validation import js_trim

MAX_MISSING_EXPORT_DECKS = 50
BULK_BASIC_LAND_THRESHOLD = 10
BULK_BUDGET_CARD_THRESHOLD = 20
BUDGET_CARD_PRICE_LIMIT_EXACT = exact_amount("0.50")

MissingExportMode = Literal["sum", "max"]
MissingExportFormat = Literal["cardmarket", "tcgplayer", "text"]

BASIC_LAND_NAMES = frozenset(
    {
        "plains",
        "island",
        "swamp",
        "mountain",
        "forest",
        "wastes",
        "snow-covered plains",
        "snow-covered island",
        "snow-covered swamp",
        "snow-covered mountain",
        "snow-covered forest",
        "snow-covered wastes",
    }
)


class MissingDeckSummary(TypedDict):
    id: str
    name: str


class MissingCardItem(TypedDict):
    canonicalCardId: str
    catalogCardId: str
    name: str
    setCode: str
    collectorNumber: str
    quantity: int
    isBasicLand: bool
    unitPriceEur: str | None


class MissingCardExports(TypedDict):
    cardmarket: str
    tcgplayer: str
    text: str


class MissingCardsExport(TypedDict):
    deckIds: list[str]
    decks: list[MissingDeckSummary]
    mode: MissingExportMode
    includePrinting: bool
    totalMissingCopies: int
    uniqueMissingCards: int
    missingBasicLandCopies: int
    missingBudgetCardCopies: int
    bulkHintEligible: bool
    items: list[MissingCardItem]
    exports: MissingCardExports


def is_basic_land(name: str, type_line: str = "") -> bool:
    """Return True when the card is a MTG Basic Land (including Snow-Covered basics)."""
    if "Basic" in type_line and "Land" in type_line:
        return True
    return js_trim(name).lower() in BASIC_LAND_NAMES


def _known_eur_exact(
    price_references: Mapping[tuple[str, str], Document], catalog_card_id: str
) -> int | None:
    reference = price_references.get((catalog_card_id, "nonfoil"))
    if not reference or reference.get("kind") != "Known":
        return None
    currency = reference.get("currency", "EUR")
    if currency != "EUR":
        return None
    try:
        return exact_amount(reference["amount"])
    except Exception:
        return None


def aggregate_missing_cards(
    deck_cards_by_deck: Sequence[Sequence[DeckCard]],
    owned_printings: Sequence[OwnedPrinting],
    *,
    mode: MissingExportMode = "sum",
    include_printing: bool = False,
    documents: Mapping[str, CardDocument] = {},
    price_references: Mapping[tuple[str, str], Document] = {},
) -> tuple[list[MissingCardItem], int, int]:
    """Aggregate missing cards across one or more Decks.

    In ``sum`` mode, all selected Deck entries are allocated together against the account's
    inventory once so the result covers building all selected Decks simultaneously without sharing
    copies. In ``max`` mode, each Deck is allocated independently against inventory and the maximum
    missing quantity per card across Decks is taken so players can share copies between Decks.
    """
    quantities: dict[str, int] = {}
    representatives: dict[str, list[DeckCard]] = {}

    if mode == "sum":
        combined = [card for cards in deck_cards_by_deck for card in cards]
        allocations = allocate_deck_availability(combined, owned_printings)
        for card in combined:
            missing = allocations[card["id"]]["missing"]
            if missing <= 0:
                continue
            key = card["catalogCardId"] if include_printing else card["canonicalCardId"]
            quantities[key] = quantities.get(key, 0) + missing
            representatives.setdefault(key, []).append(card)
    else:
        for cards in deck_cards_by_deck:
            allocations = allocate_deck_availability(cards, owned_printings)
            deck_missing: dict[str, int] = {}
            for card in cards:
                missing = allocations[card["id"]]["missing"]
                if missing <= 0:
                    continue
                key = card["catalogCardId"] if include_printing else card["canonicalCardId"]
                deck_missing[key] = deck_missing.get(key, 0) + missing
                representatives.setdefault(key, []).append(card)
            for key, count in deck_missing.items():
                if count > quantities.get(key, 0):
                    quantities[key] = count

    items: list[MissingCardItem] = []
    missing_basic_land_copies = 0
    missing_budget_card_copies = 0

    for key, quantity in quantities.items():
        candidates = representatives[key]
        candidates_sorted = sorted(
            candidates,
            key=lambda card: (
                js_trim(card["setCode"]).lower(),
                js_trim(
                    documents[card["catalogCardId"]]["collector_number"]
                    if card["catalogCardId"] in documents
                    else ""
                ).lower(),
                card["catalogCardId"],
            ),
        )
        chosen = candidates_sorted[0]
        chosen_doc = documents.get(chosen["catalogCardId"])
        name = chosen_doc["name"] if chosen_doc else chosen["name"]
        set_code = js_trim(chosen_doc["set_code"] if chosen_doc else chosen["setCode"])
        collector_number = js_trim(chosen_doc["collector_number"]) if chosen_doc else ""
        type_line = chosen_doc["type_line"] if chosen_doc else ""
        basic = is_basic_land(name, type_line)

        exact_prices = [
            price
            for cid in dict.fromkeys(c["catalogCardId"] for c in candidates_sorted)
            if (price := _known_eur_exact(price_references, cid)) is not None
        ]
        selected_price = min(exact_prices) if exact_prices else None
        unit_price_eur = display_amount(selected_price) if selected_price is not None else None

        if basic:
            missing_basic_land_copies += quantity
        if selected_price is not None and selected_price < BUDGET_CARD_PRICE_LIMIT_EXACT:
            missing_budget_card_copies += quantity

        items.append(
            MissingCardItem(
                canonicalCardId=chosen["canonicalCardId"],
                catalogCardId=chosen["catalogCardId"],
                name=name,
                setCode=set_code,
                collectorNumber=collector_number,
                quantity=quantity,
                isBasicLand=basic,
                unitPriceEur=unit_price_eur,
            )
        )

    items.sort(
        key=lambda item: (
            item["name"].lower(),
            item["setCode"].lower(),
            item["collectorNumber"].lower(),
            item["catalogCardId"],
        )
    )
    return items, missing_basic_land_copies, missing_budget_card_copies


def format_missing_exports(
    items: Sequence[MissingCardItem], *, include_printing: bool = False
) -> MissingCardExports:
    """Format missing items for Cardmarket Wants-List, TCGplayer Mass-Entry, and plain text."""
    if not items:
        return MissingCardExports(cardmarket="", tcgplayer="", text="")

    cardmarket_totals: dict[tuple[str, str], int] = {}
    tcgplayer_lines: list[str] = []
    text_lines: list[str] = []

    for item in items:
        qty = item["quantity"]
        name = item["name"]
        set_code = js_trim(item["setCode"]).upper()
        collector_number = js_trim(item["collectorNumber"])

        if not include_printing or not set_code:
            base = f"{qty} {name}"
            cm_key = (name, "")
            cardmarket_totals[cm_key] = cardmarket_totals.get(cm_key, 0) + qty
            tcgplayer_lines.append(base)
            text_lines.append(base)
            continue

        # Cardmarket Wants-List text import uses `(SET)` without collector numbers; merge
        # multiple variants from the same set to avoid emitting duplicate lines.
        cm_key = (name, set_code)
        cardmarket_totals[cm_key] = cardmarket_totals.get(cm_key, 0) + qty
        if collector_number:
            tcgplayer_lines.append(f"{qty} {name} [{set_code}] {collector_number}")
            text_lines.append(f"{qty} {name} ({set_code}) {collector_number}")
        else:
            tcgplayer_lines.append(f"{qty} {name} [{set_code}]")
            text_lines.append(f"{qty} {name} ({set_code})")

    cardmarket_lines = [
        f"{qty} {name} ({set_code})" if set_code else f"{qty} {name}"
        for (name, set_code), qty in cardmarket_totals.items()
    ]

    return MissingCardExports(
        cardmarket="\n".join(cardmarket_lines) + "\n",
        tcgplayer="\n".join(tcgplayer_lines) + "\n",
        text="\n".join(text_lines) + "\n",
    )


def build_missing_cards_export(
    decks: Sequence[MissingDeckSummary],
    deck_cards_by_deck: Sequence[Sequence[DeckCard]],
    owned_printings: Sequence[OwnedPrinting],
    *,
    mode: MissingExportMode = "sum",
    include_printing: bool = False,
    documents: Mapping[str, CardDocument] = {},
    price_references: Mapping[tuple[str, str], Document] = {},
) -> MissingCardsExport:
    items, basic_land_copies, budget_card_copies = aggregate_missing_cards(
        deck_cards_by_deck,
        owned_printings,
        mode=mode,
        include_printing=include_printing,
        documents=documents,
        price_references=price_references,
    )
    exports = format_missing_exports(items, include_printing=include_printing)
    deck_list = list(decks)
    return MissingCardsExport(
        deckIds=[deck["id"] for deck in deck_list],
        decks=deck_list,
        mode=mode,
        includePrinting=include_printing,
        totalMissingCopies=sum(item["quantity"] for item in items),
        uniqueMissingCards=len(items),
        missingBasicLandCopies=basic_land_copies,
        missingBudgetCardCopies=budget_card_copies,
        bulkHintEligible=(
            basic_land_copies >= BULK_BASIC_LAND_THRESHOLD
            or budget_card_copies >= BULK_BUDGET_CARD_THRESHOLD
        ),
        items=items,
        exports=exports,
    )
