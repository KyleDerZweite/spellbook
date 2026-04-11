FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml ./
COPY src/ src/
RUN pip install --no-cache-dir .

CMD ["uvicorn", "scan_worker.main:app", "--host", "0.0.0.0", "--port", "8080"]
