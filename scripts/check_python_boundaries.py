"""Check Python package dependency directions without importing application code."""

import ast
import sys
from dataclasses import dataclass
from pathlib import Path

SOURCE_ROOTS = (
    ("backend/api/src", "api"),
    ("backend/core/src", "core"),
    ("worker/src", "worker"),
    ("scan-worker/src", "worker"),
    ("backend/workers/catalog/src", "worker"),
    ("backend/workers/scan/src", "worker"),
    ("backend/workers/state/src", "worker"),
)


@dataclass(frozen=True)
class Violation:
    path: str
    line: int
    module: str
    rule: str


def forbidden(owner: str, module: str) -> str | None:
    parts = module.split(".")
    api = parts[0] == "spellbook_api" or parts[:2] == ["backend", "api"]
    worker = parts[0] in {"worker", "scan_worker"} or parts[:2] == [
        "backend",
        "workers",
    ]
    client = parts[0] in {"frontend", "android", "contracts"}
    framework = parts[0] in {"fastapi", "starlette", "uvicorn"}
    if client:
        return "server-client"
    if owner == "core" and (api or worker or framework):
        return "core-independent"
    if owner == "worker" and api:
        return "worker-http"
    if owner == "api" and worker:
        return "api-worker"
    return None


def check_boundaries(root: Path) -> list[Violation]:
    violations: list[Violation] = []
    for directory, owner in SOURCE_ROOTS:
        source = root / directory
        for path in sorted(source.rglob("*.py")):
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            relative = path.relative_to(source).with_suffix("").parts
            package = list(relative[:-1])
            aliases: dict[str, str] = {}
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        aliases[alias.asname or alias.name.split(".")[0]] = alias.name
                elif isinstance(node, ast.ImportFrom) and not node.level:
                    for alias in node.names:
                        aliases[alias.asname or alias.name] = f"{node.module}.{alias.name}"
            for node in ast.walk(tree):
                modules: list[str] = []
                if isinstance(node, ast.Import):
                    modules = [alias.name for alias in node.names]
                elif isinstance(node, ast.ImportFrom):
                    prefix = package[: len(package) - node.level + 1] if node.level else []
                    base = ".".join([*prefix, *([node.module] if node.module else [])])
                    modules = [base, *(f"{base}.{alias.name}" for alias in node.names)]
                elif isinstance(node, ast.Call):
                    function = ""
                    if isinstance(node.func, ast.Name):
                        function = aliases.get(node.func.id, node.func.id)
                    elif isinstance(node.func, ast.Attribute) and isinstance(
                        node.func.value, ast.Name
                    ):
                        module_name = aliases.get(node.func.value.id, node.func.value.id)
                        function = f"{module_name}.{node.func.attr}"
                    if function in {"__import__", "importlib.import_module"}:
                        argument = node.args[0] if node.args else None
                        if not isinstance(argument, ast.Constant) or not isinstance(
                            argument.value, str
                        ):
                            violations.append(
                                Violation(
                                    str(path.relative_to(root)),
                                    node.lineno,
                                    "?",
                                    "dynamic-import",
                                )
                            )
                        else:
                            module = argument.value
                            if module.startswith("."):
                                level = len(module) - len(module.lstrip("."))
                                module = ".".join(
                                    [
                                        *package[: len(package) - level + 1],
                                        module[level:],
                                    ]
                                )
                            modules = [module]
                for module in modules:
                    rule = forbidden(owner, module)
                    if rule:
                        violations.append(
                            Violation(
                                str(path.relative_to(root)),
                                getattr(node, "lineno", 0),
                                module,
                                rule,
                            )
                        )
    return violations


def main() -> None:
    violations = check_boundaries(Path(__file__).resolve().parents[1])
    for violation in violations:
        print(f"{violation.path}:{violation.line}: {violation.rule}: {violation.module}")
    if violations:
        sys.exit(1)
    print("Python package dependency directions passed.")


if __name__ == "__main__":
    main()
