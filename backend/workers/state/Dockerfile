FROM python:3.14.8-slim-bookworm AS builder
COPY --from=ghcr.io/astral-sh/uv:0.12.23 /uv /uvx /bin/
WORKDIR /app
COPY backend/core/ backend/core/
COPY backend/workers/state/ backend/workers/state/
RUN uv sync --project backend/workers/state --frozen --no-dev --no-editable --python 3.14.8

FROM python:3.14.8-slim-bookworm AS runtime
# Match Node's ICU en-US Combo witness ordering without changing process locale.
RUN apt-get update && apt-get install -y --no-install-recommends libicu72 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/backend/workers/state/.venv /app/backend/workers/state/.venv
CMD ["/app/backend/workers/state/.venv/bin/spellbook-state-worker"]
