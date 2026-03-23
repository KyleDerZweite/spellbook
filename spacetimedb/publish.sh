#!/bin/sh

STDB_HOST="${STDB_HOST:-http://spacetimedb:3000}"
STDB_DATABASE="${STDB_DATABASE:-spellbook}"

echo "Waiting for SpacetimeDB at $STDB_HOST..."
attempts=0
until spacetime server ping "$STDB_HOST" 2>/dev/null; do
  attempts=$((attempts + 1))
  if [ "$attempts" -ge 30 ]; then
    echo "ERROR: SpacetimeDB not reachable after 60s"
    exit 1
  fi
  sleep 2
done

# Clear stale credentials — server signing key changes on restart
rm -f /root/.config/spacetime/cli.toml

echo "Publishing module '$STDB_DATABASE'..."
output=$(spacetime publish "$STDB_DATABASE" \
  --server "$STDB_HOST" \
  --module-path /module \
  --yes 2>&1) && {
  echo "$output"
  echo "Module '$STDB_DATABASE' published successfully."
  exit 0
}

# Publish failed — check if it's because the database already exists
# (owned by a previous identity). This is expected on restarts.
if echo "$output" | grep -qE "401|403|not authorized"; then
  echo "Module '$STDB_DATABASE' already exists (owned by prior identity). Skipping."
  exit 0
fi

# Unexpected error
echo "$output"
echo "ERROR: Failed to publish module '$STDB_DATABASE'"
exit 1
