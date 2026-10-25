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


@dataclass(frozen=True, slots=True)
class SessionInfo:
    user: Actor
    expires_at: str

    def to_dto(self) -> SessionDTO:
        return {"user": self.user.to_dto(), "expiresAt": self.expires_at}
