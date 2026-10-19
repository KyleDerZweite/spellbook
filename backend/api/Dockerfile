FROM python:3.14.8-slim-bookworm AS builder
COPY --from=ghcr.io/astral-sh/uv:0.12.23 /uv /uvx /bin/
WORKDIR /app
COPY backend/core/ backend/core/
COPY backend/api/ backend/api/
COPY contracts/openapi.json contracts/openapi.json
RUN uv sync --project backend/api --frozen --no-dev --no-editable --python 3.14.8

FROM python:3.14.8-slim-bookworm AS runtime
WORKDIR /app
COPY --from=builder /app/backend/api/.venv /app/backend/api/.venv
ENV API_HOST=127.0.0.1
ENV API_PORT=3002
CMD ["/app/backend/api/.venv/bin/spellbook-api"]
