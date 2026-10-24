"""Private Profile and password bridges with the existing account error bodies."""

from spellbook_core.auth import LocalAuth
from spellbook_core.errors import ProfileError
from spellbook_core.profile import Profile
from spellbook_core.validation import utf16_length, valid_password
from starlette.requests import Request
from starlette.responses import Response

from spellbook_api.http.auth import (
    client_address,
    require_mobile_auth,
    require_same_origin,
    write_session_cookie,
)
from spellbook_api.http.errors import HttpError, json_response
from spellbook_api.http.parsing import read_form_data, read_json_object
from spellbook_api.http.router import HttpRoute


def create_account_routes(
    auth: LocalAuth,
    profile: Profile,
    origin: str,
    trusted_proxy_addresses: tuple[str, ...] = (),
) -> list[HttpRoute]:
    async def get_profile(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        return json_response(await profile.get(actor), headers={"Cache-Control": "no-store"})

    async def patch_profile(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        body = await read_json_object(request)
        try:
            result = await profile.patch(actor, body)
        except ProfileError as cause:
            return json_response(
                {"kind": cause.kind, "message": str(cause), "fields": cause.fields},
                status=400,
                headers={"Cache-Control": "no-store"},
            )
        return json_response(result, headers={"Cache-Control": "no-store"})

    async def password(request: Request, params: dict[str, str]) -> Response:
        actor = await require_mobile_auth(request, auth, origin)
        auth.take_auth_attempt(client_address(request, trusted_proxy_addresses))
        body = await read_json_object(request)
        if (
            body.keys() - {"currentPassword", "newPassword"}
            or not isinstance(body.get("currentPassword"), str)
            or not isinstance(body.get("newPassword"), str)
        ):
            raise HttpError(400, "Invalid password fields")
        current, new = body["currentPassword"], body["newPassword"]
        assert isinstance(current, str) and isinstance(new, str)
        session = await auth.change_password(actor, current, new)
        if session is None:
            raise HttpError(400, "Unable to change password with those details")
        response = json_response(session.to_dto(), headers={"Cache-Control": "no-store"})
        if "authorization" not in request.headers:
            write_session_cookie(response, session.token, origin)
        return response

    async def password_form(request: Request, params: dict[str, str]) -> Response:
        require_same_origin(request, origin)
        actor = await require_mobile_auth(request, auth, origin)
        errors: dict[str, str] = {}
        if auth.demo_mode:
            return json_response(
                {
                    "success": False,
                    "message": "Password changes are disabled in demo mode.",
                    "errors": errors,
                },
                status=403,
            )
        auth.take_auth_attempt(client_address(request, trusted_proxy_addresses))
        body = await read_form_data(request)
        current, new, confirm = (
            body.get("currentPassword"),
            body.get("newPassword"),
            body.get("confirmPassword"),
        )
        if not isinstance(current, str) or not current or utf16_length(current) > 128:
            errors["currentPassword"] = "Enter your current password."
        if not valid_password(new):
            errors["newPassword"] = "Use 12 to 128 characters for your new password."
        if not isinstance(confirm, str) or confirm != new:
            errors["confirmPassword"] = "The new passwords must match."
        if (
            errors
            or not isinstance(current, str)
            or not isinstance(new, str)
            or not valid_password(new)
        ):
            return json_response(
                {
                    "success": False,
                    "message": "Check the password fields and try again.",
                    "errors": errors,
                },
                status=400,
            )
        session = await auth.change_password(actor, current, new)
        if session is None:
            return json_response(
                {
                    "success": False,
                    "message": "Your current password could not be verified.",
                    "errors": {"currentPassword": "Enter your current password and try again."},
                },
                status=400,
            )
        response = json_response({"success": True, **session.to_dto()})
        if "authorization" not in request.headers:
            write_session_cookie(response, session.token, origin)
        return response

    return [
        HttpRoute("GET", "/api/v1/account/profile", get_profile),
        HttpRoute("PATCH", "/api/v1/account/profile", patch_profile),
        HttpRoute("POST", "/api/v1/account/password", password),
        HttpRoute("POST", "/api/v1/web/password", password_form),
    ]
