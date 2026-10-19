"""Bundle the canonical schema in distributions without a second checked-in copy."""

from pathlib import Path
from typing import Any

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class CustomBuildHook(BuildHookInterface):
    def initialize(self, version: str, build_data: dict[str, Any]) -> None:
        if version == "editable":
            # The source checkout reads contracts directly, so edits stay visible.
            return
        root = Path(self.root)
        bundled = root / "src/spellbook_api/openapi.json"
        if bundled.is_file():
            # A wheel built from our sdist already contains the included schema.
            return
        canonical = root.parent.parent / "contracts/openapi.json"
        if not canonical.is_file():
            raise RuntimeError("The canonical contracts/openapi.json is required to build the API")
        destination = (
            "spellbook_api/openapi.json"
            if self.target_name == "wheel"
            else "src/spellbook_api/openapi.json"
        )
        build_data["force_include"][str(canonical)] = destination
