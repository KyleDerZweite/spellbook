"""Bundle canonical schema and migration assets without a checked-in copy."""

from pathlib import Path
from typing import Any

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class CustomBuildHook(BuildHookInterface):
    def initialize(self, version: str, build_data: dict[str, Any]) -> None:
        if version == "editable":
            return
        root = Path(self.root)
        assets = [
            (
                root / "src/spellbook_api/openapi.json",
                root.parent.parent / "contracts/openapi.json",
                "openapi.json",
            ),
            (root / "src/spellbook_api/drizzle", root.parent / "drizzle", "drizzle"),
        ]
        for bundled, canonical, name in assets:
            if bundled.exists():
                # An sdist already includes the exact canonical assets.
                continue
            if not canonical.exists():
                raise RuntimeError(f"Canonical {name} assets are required to build the API")
            destination = (
                f"spellbook_api/{name}"
                if self.target_name == "wheel"
                else f"src/spellbook_api/{name}"
            )
            build_data["force_include"][str(canonical)] = destination
