"""Credential, session and QR HTTP adapters preserving the existing client DTOs."""

from spellbook_core.auth import LocalAuth, SessionAuth, valid_session_token
from spellbook_core.qr import QrAuthError, Requester
from spellbook_core.validation import MISSING
from starlette.requests import Request
from starlette.responses import Response

from spellbook_api.http.auth import (
    append_cookie,
    client_address,
    get_bearer_token,
    read_cookie,
    require_mobile_auth,
    require_same_origin,
    selected_token,
    write_session_cookie,
)
from spellbook_api.http.errors import HttpError, json_response
from spellbook_api.http.parsing import decode_parameter, read_form_data, read_json_object
from spellbook_api.http.router import HttpRoute

QR_COOKIE = "spellbook_qr_requester"


async def get_session(request: Request, auth: SessionAuth, public_origin: str) -> Response:
    actor = await require_mobile_auth(request, auth, public_origin)
    current = await auth.require_actor(actor)
    session = await auth.inspect_session(selected_token(request))
    if session is None:
        raise HttpError(401, "Authentication required")
    return json_response(
        {"user": current.to_dto(), "expiresAt": session.expires_at},
        headers={"Cache-Control": "no-store"},
    )


def create_auth_routes(
    auth: LocalAuth, origin: str, trusted_proxy_addresses: tuple[str, ...] = ()
) -> list[HttpRoute]:
    async def authenticate(request: Request, mode: str, *, form: bool = False) -> Response:
        require_same_origin(request, origin, allow_missing=not form)
        auth.take_auth_attempt(client_address(request, trusted_proxy_addresses))
        body = await read_form_data(request) if form else await read_json_object(request)
        assert mode in {"login", "register"}
        result = await auth.authenticate(
            "login" if mode == "login" else "register",
            body.get("username"),
            body.get("password"),
            {"artworkId": body["artworkId"]} if "artworkId" in body else {},
        )
        if result is None:
            message = (
                "Invalid username or password"
                if mode == "login"
                else "Unable to create an account with those details"
            )
            if form:
                return json_response(
                    {
                        "message": message + ".",
                        "username": body.get("username")
                        if isinstance(body.get("username"), str)
                        else "",
                        **(
                            {
                                "artworkId": body.get("artworkId")
                                if isinstance(body.get("artworkId"), str)
                                else ""
                            }
                            if mode == "register"
                            else {}
                        ),
                    },
                    status=400,
                )
            raise HttpError(401 if mode == "login" else 400, message)
        return json_response(
            result.to_dto(),
            status=201 if mode == "register" and not form else 200,
            headers={"Cache-Control": "no-store"} if not form else None,
        )

    async def login(request: Request, params: dict[str, str]) -> Response:
        return await authenticate(request, "login")

    async def register(request: Request, params: dict[str, str]) -> Response:
        return await authenticate(request, "register")

    async def login_form(request: Request, params: dict[str, str]) -> Response:
        return await authenticate(request, "login", form=True)

    async def register_form(request: Request, params: dict[str, str]) -> Response:
        return await authenticate(request, "register", form=True)

    async def logout(request: Request, params: dict[str, str]) -> Response:
        require_same_origin(request, origin, allow_missing=True)
        token = get_bearer_token(request)
        if not token:
            raise HttpError(401, "Bearer token required")
        await auth.revoke_session(token)
        return Response(status_code=204, headers={"Cache-Control": "no-store"})

    async def browser_authenticated(request: Request) -> bool:
        return await auth.validate_session(read_cookie(request)) is not None

    async def qr_body(request: Request, keys: set[str]) -> dict[str, object]:
        body = await read_json_object(request, 1024)
        if body.keys() - keys:
            raise HttpError(400, "Unknown QR fields")
        return body

    async def qr(request: Request, params: dict[str, str], operation: str) -> Response:
        headers = {"Cache-Control": "no-store"}
        try:
            require_same_origin(request, origin, allow_missing=True)
            address = client_address(request, trusted_proxy_addresses)
            if operation == "create":
                body = await qr_body(request, {"kind"})
                kind = body.get("kind")
                if kind not in ("browser", "device"):
                    raise HttpError(400, "Invalid QR kind")
                if kind == "browser":
                    require_same_origin(request, origin)
                    if await browser_authenticated(request):
                        raise HttpError(409, "This browser is already signed in.")
                assert isinstance(kind, str)
                created = await auth.qr.create(kind, address)
                secret = str(created.pop("requesterSecret"))
                response = json_response(
                    {
                        **created,
                        "verificationUri": f"{origin}/auth/approve?code={created['code']}",
                        **({"requesterSecret": secret} if kind == "device" else {}),
                    },
                    status=201,
                    headers=headers,
                )
                if kind == "browser":
                    append_cookie(
                        response,
                        QR_COOKIE,
                        f"{created['code']}.{secret}",
                        "/api/auth/qr",
                        300,
                        origin,
                    )
                return response
            if operation in {"inspect", "decide"}:
                actor = await require_mobile_auth(request, auth, origin)
                code = decode_parameter(params["code"])
                if not valid_session_token(code):
                    raise HttpError(400, "Invalid QR code")
                if operation == "inspect":
                    return json_response(
                        await auth.qr.inspect(actor, code, address), headers=headers
                    )
                body = await qr_body(request, {"decision"})
                decision = body.get("decision")
                if decision not in ("approve", "deny"):
                    raise HttpError(400, "Invalid QR decision")
                assert isinstance(decision, str)
                return json_response(
                    await auth.qr.decide(actor, code, decision, address), headers=headers
                )
            body = await qr_body(request, {"code", "requesterSecret"})
            token_code = body.get("code")
            if not isinstance(token_code, str) or not valid_session_token(token_code):
                raise HttpError(400, "Invalid QR code")
            secret_input = body.get("requesterSecret", MISSING)
            if secret_input is not MISSING and not valid_session_token(secret_input):
                raise HttpError(400, "Invalid requester secret")
            cookie = (read_cookie(request, QR_COOKIE) or "").split(".")
            browser_secret = (
                cookie[1]
                if len(cookie) == 2 and cookie[0] == token_code and valid_session_token(cookie[1])
                else None
            )
            if browser_secret:
                require_same_origin(request, origin)
            requester = Requester(
                secret_input if isinstance(secret_input, str) else MISSING,
                browser_secret,
                await browser_authenticated(request),
            )
            result = await auth.qr.redeem(token_code, requester, address)
            if result.status != "authenticated":
                response = json_response({"status": result.status}, headers=headers)
                if result.kind == "browser" and result.status != "pending":
                    append_cookie(response, QR_COOKIE, "", "/api/auth/qr", 0, origin)
                return response
            assert result.session is not None
            response = json_response(
                {
                    "status": "authenticated",
                    "expiresAt": result.session.expires_at,
                    **({"token": result.session.token} if result.kind == "device" else {}),
                },
                headers=headers,
            )
            if result.kind == "browser":
                write_session_cookie(response, result.session.token, origin)
                append_cookie(response, QR_COOKIE, "", "/api/auth/qr", 0, origin)
            return response
        except QrAuthError as cause:
            statuses = {
                "ValidationFailed": 400,
                "Unauthenticated": 401,
                "NotFound": 404,
                "Conflict": 409,
                "RateLimited": 429,
            }
            return json_response(
                {"kind": cause.kind, "message": str(cause)},
                status=statuses[cause.kind],
                headers=headers,
            )

    async def qr_create(request: Request, params: dict[str, str]) -> Response:
        return await qr(request, params, "create")

    async def qr_inspect(request: Request, params: dict[str, str]) -> Response:
        return await qr(request, params, "inspect")

    async def qr_decide(request: Request, params: dict[str, str]) -> Response:
        return await qr(request, params, "decide")

    async def qr_token(request: Request, params: dict[str, str]) -> Response:
        return await qr(request, params, "token")

    return [
        HttpRoute("POST", "/api/auth/login", login),
        HttpRoute("POST", "/api/auth/register", register),
        HttpRoute("POST", "/api/web/v1/auth/login", login_form),
        HttpRoute("POST", "/api/web/v1/auth/register", register_form),
        HttpRoute("POST", "/api/auth/logout", logout),
        HttpRoute("POST", "/api/auth/qr/requests", qr_create),
        HttpRoute("GET", "/api/auth/qr/requests/:code", qr_inspect),
        HttpRoute("POST", "/api/auth/qr/requests/:code/decision", qr_decide),
        HttpRoute("POST", "/api/auth/qr/token", qr_token),
    ]
