"""Native Scan routes with bounded raw image bodies and safe errors."""

import re
from typing import Annotated

from fastapi import APIRouter, Depends
from spellbook_core.auth import SessionAuth
from spellbook_core.models import Actor
from spellbook_core.mtg.scan import Scan
from starlette.requests import Request
from starlette.responses import Response

from spellbook_api.http.dependencies import UUIDPath, actor_dependency, body_dependency
from spellbook_api.http.errors import HttpError, json_response
from spellbook_api.http.parsing import drain_request_body, header, read_request_bytes, trim

BASE = "/api/v1/mtg/scan"
MAX_IMAGE_BYTES = 10 * 1024 * 1024


def create_scan_routes(auth: SessionAuth, scan: Scan, origin: str) -> APIRouter:
    router = APIRouter()
    authenticated = actor_dependency(auth, origin)

    async def create_session(
        request: Request, user: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        await drain_request_body(request)
        return json_response(
            {"session": await scan.create_session(user)}, headers={"Cache-Control": "no-store"}
        )

    async def list_sessions(
        request: Request, user: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        return json_response(
            {"sessions": await scan.list_sessions(user)}, headers={"Cache-Control": "no-store"}
        )

    async def upload_frame(
        request: Request, sessionId: UUIDPath, user: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        session_id = sessionId
        await scan.assert_uploadable(user, session_id)
        media = trim((header(request, "content-type") or "").split(";")[0]).lower()
        if media not in ("image/jpeg", "image/png", "image/webp"):
            raise HttpError(415, "Scan uploads require JPEG, PNG, or WebP bytes")
        body = await read_request_bytes(request, MAX_IMAGE_BYTES)
        result = await scan.upload_frame(
            user,
            session_id=session_id,
            body=body,
            content_type=media,
            file_name="scan-image",
        )
        return json_response(result, headers={"Cache-Control": "no-store"})

    async def read_session(
        request: Request, sessionId: UUIDPath, user: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        raw = request.query_params.getlist("limit")
        limit = raw[-1] if raw else None
        if limit is not None and (not re.fullmatch("[0-9]+", limit)):
            raise HttpError(400, "Invalid Scan page limit")
        input: dict[str, object] = {"sessionId": sessionId}
        if limit is not None:
            significant = limit.lstrip("0") or "0"
            input["limit"] = int(significant) if len(significant) <= 3 else 101
        for key in ("artifactCursor", "reviewCursor"):
            values = request.query_params.getlist(key)
            if values:
                input[key] = values[-1]
        return json_response(
            await scan.read_session(user, input), headers={"Cache-Control": "no-store"}
        )

    async def submit_result(
        request: Request,
        sessionId: UUIDPath,
        artifactId: UUIDPath,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 1048576))],
        user: Annotated[Actor, Depends(authenticated)],
    ) -> Response:
        input = {
            **body,
            "sessionId": sessionId,
            "artifactId": artifactId,
        }
        return json_response(
            await scan.submit_result(user, input), headers={"Cache-Control": "no-store"}
        )

    async def commit_review(
        request: Request,
        body: Annotated[dict[str, object], Depends(body_dependency(authenticated, 1048576))],
        user: Annotated[Actor, Depends(authenticated)],
    ) -> Response:
        return json_response(
            await scan.commit_review(user, body), headers={"Cache-Control": "no-store"}
        )

    router.add_api_route(
        "/api/v1/mtg/scan/sessions", create_session, methods=["POST"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/scan/sessions", list_sessions, methods=["GET"], response_model=None
    )
    router.add_api_route(
        "/api/v1/mtg/scan/sessions/{sessionId}/frames",
        upload_frame,
        methods=["POST"],
        response_model=None,
    )
    router.add_api_route(
        "/api/v1/mtg/scan/sessions/{sessionId}/result",
        read_session,
        methods=["GET"],
        response_model=None,
    )
    router.add_api_route(
        "/api/v1/mtg/scan/sessions/{sessionId}/artifacts/{artifactId}/result",
        submit_result,
        methods=["POST"],
        response_model=None,
    )
    router.add_api_route(
        "/api/v1/mtg/scan/review/commit", commit_review, methods=["POST"], response_model=None
    )
    return router
