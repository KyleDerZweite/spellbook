"""Application identities and explicit public projections. No persistence models."""

from dataclasses import dataclass
from typing import NotRequired, TypedDict


class AuthUser(TypedDict):
    accountId: str
    username: str
    email: str
    avatarId: str
    artworkId: str


class SessionDTO(TypedDict):
    user: AuthUser
    expiresAt: str


@dataclass(frozen=True, eq=False, slots=True, weakref_slot=True)
class Actor:
    """Identity only. Authority requires membership in its SessionAuth issuer."""

    account_id: str
    username: str
    email: str
    avatar_id: str
    artwork_id: str

    def to_dto(self) -> AuthUser:
        return {
            "accountId": self.account_id,
            "username": self.username,
            "email": self.email,
            "avatarId": self.avatar_id,
            "artworkId": self.artwork_id,
        }


@dataclass(frozen=True, slots=True)
class SessionInfo:
    user: Actor
    expires_at: str

    def to_dto(self) -> SessionDTO:
        return {"user": self.user.to_dto(), "expiresAt": self.expires_at}


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
