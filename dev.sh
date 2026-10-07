#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if command -v fnm >/dev/null 2>&1; then
	exec fnm exec --using "$(cat frontend/.node-version)" pnpm --dir frontend dev:local "$@"
fi

exec pnpm --dir frontend dev:local "$@"
