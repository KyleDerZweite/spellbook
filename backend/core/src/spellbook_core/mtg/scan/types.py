"""Scan wire projections and the worker port."""

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
    imageSha256: str
    contentType: str
    fileName: str


class WorkerResult(TypedDict):
    status: ScanStatus
    imageSha256: str
    qualityScore: int
    embeddingModelVersion: str
    ocrModelVersion: str
    ocrTokens: dict[str, str]
    candidates: list[ScanCandidate]


class ScanWorker(Protocol):
    """Process bytes synchronously without persisting images or jobs."""

    async def process(self, input: WorkerInput, image: bytes) -> object: ...
