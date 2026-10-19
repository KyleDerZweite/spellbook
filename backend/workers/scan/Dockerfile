FROM python:3.14.8-slim-bookworm

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.12.23 /uv /uvx /bin/

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src/ src/
RUN uv sync --frozen --no-dev --no-editable

CMD ["uv", "run", "--no-sync", "uvicorn", "scan_worker.main:app", "--host", "0.0.0.0", "--port", "8080"]
