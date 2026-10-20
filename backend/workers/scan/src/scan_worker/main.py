from __future__ import annotations

from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field


class ScanProcessRequest(BaseModel):
    sessionId: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    artifactId: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    originalObjectKey: str = Field(min_length=1, max_length=1024, pattern=r"\S")
    contentType: Literal["image/jpeg", "image/png", "image/webp"]
    fileName: str = Field(min_length=1, max_length=255, pattern=r"\S")


class ScanCandidate(BaseModel):
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


class ScanProcessResponse(BaseModel):
    status: Literal["matched", "ambiguous", "no_match", "failed"]
    normalizedObjectKey: str
    qualityScore: int
    embeddingModelVersion: str
    ocrModelVersion: str
    ocrTokens: dict[str, str]
    candidates: list[ScanCandidate]


app = FastAPI(title="Spellbook Scan Worker", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/scan/process", response_model=ScanProcessResponse)
def process_scan(request: ScanProcessRequest) -> ScanProcessResponse:
    # ponytail: recognition is a scaffold; revisit when OCR and embeddings are implemented.
    # Reuse the existing artifact until the worker actually writes a normalized image.
    return ScanProcessResponse(
        status="no_match",
        normalizedObjectKey=request.originalObjectKey,
        qualityScore=0,
        embeddingModelVersion="stub-v1",
        ocrModelVersion="stub-v1",
        ocrTokens={},
        candidates=[],
    )
