"""Explicit ADR-0028 path translation for HTTP compatibility and transport policy."""


def canonical_path(path: str) -> str:
    if path == "/api/account/dashboard":
        return "/api/v1/mtg/dashboard"
    if path == "/api/web/v1/commands":
        return "/api/v1/mtg/commands"
    if path == "/api/mobile/v1/mtg/search":
        return "/api/v1/mtg/catalog/search"
    for old, new in (
        ("/api/mobile/v1/mtg/cards", "/api/v1/mtg/catalog/cards"),
        ("/api/catalog", "/api/v1/mtg/catalog"),
        ("/api/mobile/v1/mtg", "/api/v1/mtg"),
        ("/api/account", "/api/v1/account"),
        ("/api/auth", "/api/v1/auth"),
        ("/api/web/v1", "/api/v1/web"),
    ):
        if path == old or path.startswith(old + "/"):
            return new + path[len(old) :]
    return path


def legacy_paths(path: str) -> tuple[str, ...]:
    if path == "/api/v1/mtg/dashboard":
        return ("/api/account/dashboard",)
    if path == "/api/v1/mtg/commands":
        return ("/api/web/v1/commands",)
    for new, old in (
        ("/api/v1/mtg/catalog", "/api/catalog"),
        ("/api/v1/mtg", "/api/mobile/v1/mtg"),
        ("/api/v1/account", "/api/account"),
        ("/api/v1/auth", "/api/auth"),
        ("/api/v1/web", "/api/web/v1"),
    ):
        if path == new or path.startswith(new + "/"):
            primary = old + path[len(new) :]
            if path == "/api/v1/mtg/catalog/search":
                return (primary, "/api/mobile/v1/mtg/search")
            if path.startswith("/api/v1/mtg/catalog/cards/"):
                return (primary, "/api/mobile/v1/mtg/cards/" + path.split("/catalog/cards/", 1)[1])
            return (primary,)
    return ()
