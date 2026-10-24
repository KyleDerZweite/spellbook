"""Seven existing Scan routes, with explicit parsing and Node-compatible errors.

Multipart parsing uses Starlette's maintained parser. Runtime assembly needs
python-multipart==0.0.32; the bounded raw body is parsed without FastAPI coercion.
"""

import base64
import re
from collections.abc import AsyncGenerator

from spellbook_core.auth import SessionAuth
from spellbook_core.models import Actor
from spellbook_core.mtg.scan import Scan, ScanError
from starlette.datastructures import FormData, UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser
from starlette.requests import Request
from starlette.responses import Response

from spellbook_api.http.auth import require_mobile_auth
from spellbook_api.http.errors import HttpError, json_response
from spellbook_api.http.parsing import (
    decode_parameter,
    header,
    read_json_object,
    read_request_bytes,
    require_uuid,
    trim,
)
from spellbook_api.http.router import HttpRoute

BASE = "/api/v1/mtg/scan"
MAX_MULTIPART_BYTES = 12 * 1024 * 1024
_FILENAME = re.compile(
    rb'(?:^|;)[ \t]*filename=[ \t]*(?:"([^"\r\n]*)"|([^; \t\r\n]*))', re.IGNORECASE
)


class _ScanMultipartParser(MultiPartParser):
    """Track the closing delimiter and restore Fetch's quoted filename escapes."""

    _complete = False

    def on_end(self) -> None:
        self._complete = True

    def on_headers_finished(self) -> None:
        super().on_headers_finished()
        file = self._current_part.file
        if file is None:
            return
        # Fetch replaces only these three escapes in quoted disposition values.
        # In particular, %2F, %25 and unquoted %22 remain literal.
        matches = list(_FILENAME.finditer(self._current_part.content_disposition or b""))
        if matches and (quoted := matches[-1][1]) is not None:
            filename = quoted.decode("utf-8-sig", "replace")
            file.filename = re.sub(
                "%0[ad]",
                lambda m: "\n" if m[0].lower() == "%0a" else "\r",
                filename,
                flags=re.IGNORECASE,
            ).replace("%22", '"')

    async def parse(self) -> FormData:
        form = await super().parse()
        if not self._complete:
            # Starlette's parser can return completed parts before the final
            # delimiter. Close both those files and any unfinished current file.
            for file in self._files_to_close_on_error:
                file.close()
            raise MultiPartException("Incomplete multipart upload")
        return form


def _file_body(body: bytes, file: UploadFile) -> bytes:
    encodings = file.headers.getlist("content-transfer-encoding")
    if not encodings or encodings[-1].strip(" \t") != "base64":
        return body
    # Node uses Buffer.from(body.toString(), 'base64'): exact lowercase encoding,
    # UTF-8 replacement, low UTF-16 bytes, URL-safe alphabet and forgiving padding.
    encoded = body.decode("utf-8", "replace").encode("utf-16-le")[::2]
    digits = re.sub(rb"[^A-Za-z0-9+/_-]", b"", encoded.split(b"=", 1)[0])
    if len(digits) % 4 == 1:
        digits = digits[:-1]
    return base64.b64decode(digits + b"=" * (-len(digits) % 4), altchars=b"-_")


def create_scan_routes(auth: SessionAuth, scan: Scan, origin: str) -> list[HttpRoute]:
    async def actor(request: Request) -> Actor:
        return await require_mobile_auth(request, auth, origin)

    async def create_session(request: Request, params: dict[str, str]) -> Response:
        user = await actor(request)
        return json_response(
            {"session": await scan.create_session(user)}, headers={"Cache-Control": "no-store"}
        )

    async def list_sessions(request: Request, params: dict[str, str]) -> Response:
        user = await actor(request)
        return json_response(
            {"sessions": await scan.list_sessions(user)}, headers={"Cache-Control": "no-store"}
        )

    async def upload_frame(request: Request, params: dict[str, str]) -> Response:
        user = await actor(request)
        session_id = require_uuid(decode_parameter(params["sessionId"]), "sessionId")
        await scan.assert_uploadable(user, session_id)
        media = trim((header(request, "content-type") or "").split(";")[0]).lower()
        if media != "multipart/form-data":
            raise HttpError(415, "Scan uploads require multipart/form-data")
        body = await read_request_bytes(request, MAX_MULTIPART_BYTES)

        async def stream() -> AsyncGenerator[bytes]:
            yield body

        parser = _ScanMultipartParser(
            request.headers,
            stream(),
            max_files=float("inf"),
            max_fields=float("inf"),
            max_part_size=MAX_MULTIPART_BYTES,
        )
        try:
            form = await parser.parse()
        except MultiPartException, ValueError:
            raise HttpError(400, "Malformed multipart upload") from None
        try:
            # Fetch FormData.get returns the first occurrence, unlike Starlette get.
            file = next((value for key, value in form.multi_items() if key == "file"), None)
            if not isinstance(file, UploadFile):
                raise HttpError(400, 'multipart file field "file" is required')
            result = await scan.upload_frame(
                user,
                session_id=session_id,
                body=_file_body(await file.read(), file),
                content_type=(file.content_type or "application/octet-stream")
                .strip(" \t\r\n")
                .lower(),
                file_name=file.filename or "",
            )
            return json_response(result, headers={"Cache-Control": "no-store"})
        finally:
            await form.close()

    async def read_session(request: Request, params: dict[str, str]) -> Response:
        user = await actor(request)
        raw = request.query_params.getlist("limit")
        limit = raw[0] if raw else None
        if limit is not None and not re.fullmatch(r"[0-9]+", limit):
            raise HttpError(400, "Invalid Scan page limit")
        input: dict[str, object] = {
            "sessionId": require_uuid(decode_parameter(params["sessionId"]), "sessionId")
        }
        if limit is not None:
            significant = limit.lstrip("0") or "0"
            input["limit"] = int(significant) if len(significant) <= 3 else 101
        for key in ("artifactCursor", "reviewCursor"):
            values = request.query_params.getlist(key)
            if values:
                input[key] = values[0]
        return json_response(
            await scan.read_session(user, input), headers={"Cache-Control": "no-store"}
        )

    async def submit_result(request: Request, params: dict[str, str]) -> Response:
        user = await actor(request)
        body = await read_json_object(request)
        input = {
            **body,
            "sessionId": require_uuid(decode_parameter(params["sessionId"]), "sessionId"),
            "artifactId": require_uuid(decode_parameter(params["artifactId"]), "artifactId"),
        }
        return json_response(
            await scan.submit_result(user, input), headers={"Cache-Control": "no-store"}
        )

    async def read_image(request: Request, params: dict[str, str]) -> Response:
        user = await actor(request)
        image = await scan.read_image(
            user, require_uuid(decode_parameter(params["artifactId"]), "artifactId")
        )
        return Response(
            image.bytes,
            headers={
                "Content-Type": image.content_type,
                "Content-Length": str(len(image.bytes)),
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )

    async def commit_review(request: Request, params: dict[str, str]) -> Response:
        user = await actor(request)
        return json_response(
            await scan.commit_review(user, await read_json_object(request)),
            headers={"Cache-Control": "no-store"},
        )

    # Map Scan failures here because shared HTTP errors are owned by another slice.
    routes = [
        HttpRoute("POST", BASE + "/sessions", create_session),
        HttpRoute("GET", BASE + "/sessions", list_sessions),
        HttpRoute("POST", BASE + "/sessions/:sessionId/frames", upload_frame),
        HttpRoute("GET", BASE + "/sessions/:sessionId/result", read_session),
        HttpRoute(
            "POST", BASE + "/sessions/:sessionId/artifacts/:artifactId/result", submit_result
        ),
        HttpRoute("GET", BASE + "/artifacts/:artifactId/image", read_image),
        HttpRoute("POST", BASE + "/review/commit", commit_review),
    ]

    def wrap(item: HttpRoute) -> HttpRoute:
        async def handle(request: Request, params: dict[str, str]) -> Response:
            try:
                return await item.handle(request, params)
            except ScanError as cause:
                raise HttpError(
                    cause.status, {"kind": cause.kind, "message": str(cause)}
                ) from None

        return HttpRoute(item.method, item.path, handle)

    return [wrap(item) for item in routes]
