"""Application identities and explicit public projections. No persistence models."""

from dataclasses import dataclass
from typing import TypedDict


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


class SessionDeviceDTO(TypedDict):
    id: str
    name: str | None
    type: str | None


@dataclass(frozen=True, slots=True)
class SessionDevice:
    """Linked device identity of a session issued by a QR device request."""

    id: str
    name: str | None
    type: str | None

    def to_dto(self) -> SessionDeviceDTO:
        return {"id": self.id, "name": self.name, "type": self.type}


@dataclass(frozen=True, slots=True)
class SessionInfo:
    user: Actor
    expires_at: str
    device: SessionDevice | None = None

    def to_dto(self) -> SessionDTO:
        return {"user": self.user.to_dto(), "expiresAt": self.expires_at}
