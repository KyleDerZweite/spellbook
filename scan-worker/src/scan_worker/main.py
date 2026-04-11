from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel


class ScanProcessRequest(BaseModel):
    sessionId: str
    artifactId: str
    originalObjectKey: str
    contentType: str
    fileName: str


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
    status: str
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
    # This is intentionally a scaffold. It preserves the mobile API and worker
    # boundary while the production OCR + embedding pipeline is developed.
    normalized_key = request.originalObjectKey.replace("/scan-sessions/", "/scan-normalized/", 1)
    if normalized_key == request.originalObjectKey:
        normalized_key = f"scan-normalized/{request.sessionId}/{request.artifactId}.jpg"

    return ScanProcessResponse(
        status="no_match",
        normalizedObjectKey=normalized_key,
        qualityScore=0,
        embeddingModelVersion="stub-v1",
        ocrModelVersion="stub-v1",
        ocrTokens={},
        candidates=[],
    )
