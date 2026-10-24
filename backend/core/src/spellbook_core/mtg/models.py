"""MTG printing and mutation conflict projections."""

from typing import NotRequired, TypedDict


class CardDocument(TypedDict):
    id: str
    game: NotRequired[str]
    oracle_id: str
    name: str
    printed_name: NotRequired[str]
    normalized_name: NotRequired[str]
    lang: str
    released_at: str
    layout: str
    mana_cost: str
    cmc: float
    type_line: str
    oracle_text: str
    colors: list[str]
    color_identity: list[str]
    keywords: list[str]
    card_types: list[str]
    power: NotRequired[str]
    toughness: NotRequired[str]
    rarity: str
    set_code: str
    set_name: str
    collector_number: str
    image_uri: str
    image_uri_small: str
    is_foil_available: bool
    is_nonfoil_available: bool
    legalities: dict[str, str]
    back_face_name: NotRequired[str]
    back_face_image_uri: NotRequired[str]


class NotesLatest(TypedDict):
    entryId: str
    notes: str
    notesRevision: str


class DescriptionLatest(TypedDict):
    description: str
    descriptionRevision: str
