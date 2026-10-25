"""Scan wire projections and the two externally owned IO ports."""

from dataclasses import dataclass
from typing import Literal, NotRequired, Protocol, TypedDict

from spellbook_core.mtg.inventory import InventoryAcknowledgement

type ScanStatus = Literal["matched", "ambiguous", "no_match", "failed"]
type SessionStatus = Literal["open", "pending_review", "committed", "cancelled"]


class ScanSession(TypedDict):
    id: str
    game: Literal["mtg"]
    status: SessionStatus
    createdAt: str
    updatedAt: str


class ScanCandidate(TypedDict):
    catalogCardId: str
    canonicalCardId: str
    oracleId: str
    name: str
    setCode: str
    collectorNumber: str
    imageUri: str
    similarityScore: int
    ocrScore: int
    finalScore: int
    matchReason: str
    confidence: NotRequired[float]


class ScanResult(TypedDict):
    artifactId: str
    status: ScanStatus
    qualityScore: int
    embeddingModelVersion: str
    ocrModelVersion: str
    ocrTokens: dict[str, str]
    candidates: list[ScanCandidate]


class ScanArtifact(ScanResult):
    id: str
    sessionId: str
    createdAt: str
    updatedAt: str


class ScanReviewItem(ScanCandidate):
    id: str
    sessionId: str
    scanArtifactId: str
    finish: str
    condition: str
    quantity: int
    createdAt: str
    updatedAt: str


class ScanSessionResult(TypedDict):
    session: ScanSession
    artifacts: list[ScanArtifact]
    reviewItems: list[ScanReviewItem]
    artifactCount: int
    reviewCount: int
    nextArtifactCursor: str | None
    nextReviewCursor: str | None
    lastResult: ScanResult | None


class ArtifactResult(TypedDict):
    artifact: ScanArtifact
    result: ScanResult


class ReviewIntent(TypedDict):
    id: NotRequired[str]
    scanArtifactId: str
    catalogCardId: str
    finish: str
    condition: str
    quantity: int


class ScanCommitAcknowledgement(TypedDict):
    kind: Literal["Committed"]
    sessionId: str
    acknowledgement: InventoryAcknowledgement


class WorkerInput(TypedDict):
    sessionId: str
    artifactId: str
    originalObjectKey: str
    contentType: str
    fileName: str


class WorkerResult(TypedDict):
    status: ScanStatus
    normalizedObjectKey: str
    qualityScore: int
    embeddingModelVersion: str
    ocrModelVersion: str
    ocrTokens: dict[str, str]
    candidates: list[ScanCandidate]


@dataclass(frozen=True, slots=True)
class ScanImage:
    bytes: bytes
    content_type: str


class ScanStorage(Protocol):
    """API runtime owns construction and close; Core owns generated object keys."""

    async def write(self, key: str, body: bytes, content_type: str) -> None: ...
    async def read(self, key: str) -> ScanImage: ...
    async def delete(self, key: str) -> None: ...


class ScanWorker(Protocol):
    """Return bounded decoded JSON. Core validates identity against Catalog."""

    async def process(self, input: WorkerInput) -> object: ...
