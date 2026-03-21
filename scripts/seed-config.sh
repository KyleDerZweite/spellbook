#!/usr/bin/env bash
# Seed SpacetimeDB ServerConfig with auth signing secret.
# Run this ONCE after deploying the module.
#
# Usage: ./scripts/seed-config.sh <AUTH_SIGNING_SECRET>

set -euo pipefail

SECRET="${1:?Usage: $0 <AUTH_SIGNING_SECRET>}"

spacetime call set_server_config "{\"key\": \"auth_signing_secret\", \"value\": \"${SECRET}\"}"

echo "ServerConfig seeded successfully."
