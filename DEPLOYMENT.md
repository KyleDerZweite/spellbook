# Spellbook Deployment Guide

## Overview

This guide provides instructions for deploying the Spellbook application. The current deployment strategy involves running the database and Redis services with Docker and running the backend and frontend applications manually.

## Prerequisites

- Docker and Docker Compose
- Python 3.11+
- Node.js 18+

## Deployment Steps

### 1. Start Core Services

The `docker-compose.yml` file will start the PostgreSQL and Redis services.

```bash
docker-compose up -d
```

### 2. Run the Backend

```bash
cd backend
source venv/bin/activate

# Ensure all production dependencies are installed
pip install -r requirements.txt

# Run the application
# It is recommended to use a production-ready ASGI server like Gunicorn
gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app
```

### 3. Run the Frontend

```bash
cd frontend

# Ensure all production dependencies are installed
npm install

# Build the application
npm run build

# Start the application
npm start
```

### 4. Environment Configuration

Create a `.env` file in the root of the project and add the following variables:

```bash
# Security (IMPORTANT!)
SECRET_KEY=your-256-bit-secret-key-here

# Database
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/spellbookdb

# Redis
REDIS_URL=redis://localhost:6379

# Frontend API URL
NEXT_PUBLIC_API_URL=http://localhost:8000

# Other settings
POSTGRES_PASSWORD=password
DEBUG=false
```

## Production Checklist

- **Security:**
    - Use a strong, randomly generated `SECRET_KEY`.
    - Use strong passwords for the database.
    - Configure firewall rules to restrict access to the application.
    - Disable debug mode (`DEBUG=false`).
- **Performance:**
    - Use a production-grade ASGI server like Gunicorn or Uvicorn with multiple workers.
    - Monitor resource usage and scale as needed.
- **Backups:**
    - Regularly back up the PostgreSQL database.

## Backups

```bash
# Database backup
docker exec spellbook-postgres-dev pg_dump -U user spellbookdb > backup.sql
```
