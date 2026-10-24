"""Native Scan routes with guarded Multipart decoding and safe errors.

Multipart parsing uses Starlette's maintained parser. Runtime assembly needs
python-multipart==0.0.32; request authority is checked before bounded Multipart decoding.
"""

import re
from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import APIRouter, Depends
from spellbook_core.auth import SessionAuth
from spellbook_core.models import Actor
from spellbook_core.mtg.scan import Scan
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException
from starlette.requests import Request
from starlette.responses import Response

from spellbook_api.http.dependencies import UUIDPath, actor_dependency, body_dependency
from spellbook_api.http.errors import HttpError, json_response
from spellbook_api.http.multipart import CompleteMultipartParser
from spellbook_api.http.parsing import drain_request_body, header, read_request_bytes, trim

BASE = "/api/v1/mtg/scan"
MAX_MULTIPART_BYTES = 12 * 1024 * 1024


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
        if media != "multipart/form-data":
            raise HttpError(415, "Scan uploads require multipart/form-data")
        body = await read_request_bytes(request, MAX_MULTIPART_BYTES)

        async def stream() -> AsyncGenerator[bytes]:
            yield body

        parser = CompleteMultipartParser(
            request.headers, stream(), max_files=1, max_fields=8, max_part_size=MAX_MULTIPART_BYTES
        )
        try:
            form = await parser.parse()
        except MultiPartException, ValueError:
            raise HttpError(400, "Malformed multipart upload") from None
        try:
            file = form.get("file")
            if not isinstance(file, UploadFile):
                raise HttpError(400, 'multipart file field "file" is required')
            result = await scan.upload_frame(
                user,
                session_id=session_id,
                body=await file.read(),
                content_type=(file.content_type or "application/octet-stream")
                .strip(" \t\r\n")
                .lower(),
                file_name=file.filename or "",
            )
            return json_response(result, headers={"Cache-Control": "no-store"})
        finally:
            await form.close()

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

    async def read_image(
        request: Request, artifactId: UUIDPath, user: Annotated[Actor, Depends(authenticated)]
    ) -> Response:
        image = await scan.read_image(user, artifactId)
        return Response(
            image.bytes,
            headers={
                "Content-Type": image.content_type,
                "Content-Length": str(len(image.bytes)),
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
            },
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
        "/api/v1/mtg/scan/artifacts/{artifactId}/image",
        read_image,
        methods=["GET"],
        response_model=None,
    )
    router.add_api_route(
        "/api/v1/mtg/scan/review/commit", commit_review, methods=["POST"], response_model=None
    )
    return router
