from __future__ import annotations

import base64
import binascii
from hashlib import sha256
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


class ScanProcessRequest(BaseModel):
    sessionId: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    artifactId: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    imageSha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    imageBase64: str = Field(min_length=4, max_length=14_000_000)
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
    imageSha256: str
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
    try:
        image = base64.b64decode(request.imageBase64, validate=True)
    except binascii.Error:
        raise HTTPException(422, "Invalid Scan image encoding") from None
    if not 0 < len(image) <= 10 * 1024 * 1024:
        raise HTTPException(413, "Scan image exceeds 10 MiB")
    if sha256(image).hexdigest() != request.imageSha256:
        raise HTTPException(422, "Scan image digest mismatch")
    # Recognition remains a scaffold until OCR and embeddings are implemented.
    # The worker does not retain the image after this request returns.
    return ScanProcessResponse(
        status="no_match",
        imageSha256=request.imageSha256,
        qualityScore=0,
        embeddingModelVersion="stub-v1",
        ocrModelVersion="stub-v1",
        ocrTokens={},
        candidates=[],
    )
