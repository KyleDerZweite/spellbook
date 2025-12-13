# Spellbook v2.0

**Your Magic: The Gathering Collection Companion**

Spellbook is a self-hosted card collection management platform with mobile scanning, OCR recognition, and real-time sync between your phone and web dashboard.

> IMPORTANT: This project is under development and is not a stable, released product. It is provided "as-is", without warranty or guarantee. It works to some extent, but may be incomplete, unstable, or contain bugs. Mentions of a version such as "v2" do not imply an official release.

## Features

### Card Scanning (v2.0)
- **Mobile Camera Scanning**: Capture cards using your phone's camera
- **Batch Scanning**: Scan multiple cards in a session
- **OCR Recognition**: Automatic card text extraction using Tesseract
- **Smart Matching**: AI-powered card identification with confidence scores
- **Review Workflow**: Confirm or correct matches from web or mobile

### Collection Management
- **Multiple Collections**: Organize cards into binders, decks, trade lists
- **Condition Tracking**: Track card conditions (NM, LP, MP, HP, DMG)
- **Foil Support**: Mark foil versions separately
- **Price Tracking**: Real-time prices from Scryfall
- **Statistics**: Collection value, rarity breakdown, color distribution

### Import/Export
- **CSV Import**: Deckbox, Moxfield, generic CSV formats
- **MTG Arena**: Import/export Arena format deck lists
- **JSON Export**: Full collection backup in Spellbook format

### Platform Support
- **Web Dashboard**: Vite + React 18
- **Mobile App**: Flutter (iOS & Android)
- **API**: FastAPI with OpenAPI documentation

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Mobile App    │────▶│   REST API      │────▶│   PostgreSQL    │
│   (Flutter)     │     │   (FastAPI)     │     │   Database      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   MinIO         │     │   Celery        │     │   Redis         │
│   (S3 Storage)  │     │   (Background)  │     │   (Cache/Queue) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Prerequisites

- **Python 3.11+** - Backend runtime
- **Node.js 18+** - Frontend build
- **Docker/Podman** - Container runtime
- **Flutter 3.16+** - Mobile app development (optional)

## Quick Start

### 1. Start Infrastructure

```bash
# Start all services (PostgreSQL, Redis, MinIO)
docker-compose up -d

# Verify services are running
docker-compose ps
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy environment configuration
cp .env.dev .env

# Run database migrations
alembic upgrade head

# Initialize with admin user
DEBUG=true python init_db.py \
  --admin-email admin@spellbook.local \
  --admin-username admin \
  --admin-password admin123!

# Start the API server
DEBUG=true uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Start Celery Workers (for scanning)

```bash
# In a new terminal, from backend directory
source venv/bin/activate

# Start Celery worker
celery -A app.celery_app worker --loglevel=info --queues=default,scans,priority

# (Optional) Start Celery beat for scheduled tasks
celery -A app.celery_app beat --loglevel=info
```

### 4. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### 5. Mobile App Setup (Optional)

```bash
cd mobile

# Get Flutter dependencies
flutter pub get

# Run code generation
flutter pub run build_runner build --delete-conflicting-outputs

# Run on device/emulator
flutter run
```

## Access Points

| Service | URL | Description |
|---------|-----|-------------|
| API | http://localhost:8000 | FastAPI backend |
| API Docs | http://localhost:8000/docs | Swagger UI |
| Web App | http://localhost:5173 | Vite + React frontend |
| MinIO Console | http://localhost:9001 | Object storage UI |

## Default Credentials

**Admin Account:**
- Email: `admin@spellbook.local`
- Username: `admin`
- Password: `admin123!`

**MinIO:**
- Username: `spellbook`
- Password: `spellbook-dev-password`

## Mobile App Configuration

Update the API URL in `/mobile/lib/app/network/api_constants.dart`:

```dart
class ApiConstants {
  static const String baseUrl = 'http://YOUR_SERVER_IP:8000';
  // ...
}
```

For local development, use your machine's local IP (not localhost) so the mobile device can connect.

## Database Migrations

```bash
cd backend
source venv/bin/activate

# Create a new migration
alembic revision --autogenerate -m "Description of changes"

# Apply migrations
alembic upgrade head

# Rollback one step
alembic downgrade -1
```

## Project Structure

```
spellbook/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── api/v1/         # API endpoints
│   │   ├── models/         # SQLAlchemy models
│   │   ├── schemas/        # Pydantic schemas
│   │   ├── services/       # Business logic
│   │   └── tasks/          # Celery tasks
│   ├── migrations/         # Alembic migrations
│   └── requirements.txt
├── frontend/               # Vite + React web app
│   ├── src/
│   │   ├── pages/         # Page components
│   │   ├── components/    # React components
│   │   └── lib/           # Utilities
│   └── package.json
├── mobile/                 # Flutter mobile app
│   ├── lib/
│   │   └── app/
│   │       ├── features/  # Feature modules
│   │       └── shared/    # Shared widgets
│   └── pubspec.yaml
├── scryfall/              # Card data (not in repo)
└── docker-compose.yml     # Development services
```

## Environment Variables

### Backend (.env)

```env
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=spellbook
POSTGRES_PASSWORD=spellbook
POSTGRES_DB=spellbook

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# MinIO (S3-compatible storage)
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=spellbook
MINIO_SECRET_KEY=spellbook-dev-password
MINIO_SECURE=false

# Security
JWT_SECRET_KEY=your-super-secret-key-change-in-production
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=30

# Feature flags
SCAN_ENABLED=true
DEBUG=true
```

## Testing

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test

# Mobile tests
cd mobile
flutter test
```

## API Documentation

Once the backend is running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

Key endpoints:
- `POST /api/v1/auth/login` - Authentication
- `GET /api/v1/cards/search` - Search cards
- `GET /api/v1/collections` - List collections
- `POST /api/v1/scan/upload` - Upload scan image
- `GET /api/v1/scan/batches` - List scan batches

## Troubleshooting

### Database Connection Issues
```bash
docker-compose logs postgres-dev
docker-compose restart postgres-dev
```

### MinIO Issues
```bash
# Check if buckets exist
docker-compose exec minio-dev mc ls local/

# Recreate buckets
docker-compose restart minio-setup
```

### Celery Not Processing Scans
```bash
# Check worker status
celery -A app.celery_app inspect active

# View task queue
celery -A app.celery_app inspect reserved
```

### Mobile App Can't Connect
1. Ensure backend is running on `0.0.0.0` not `127.0.0.1`
2. Use your machine's local IP, not `localhost`
3. Check firewall allows port 8000

## License

MIT License - see [LICENSE](LICENSE)

## Acknowledgments

- Card data provided by [Scryfall](https://scryfall.com/)
- Icons by [Lucide](https://lucide.dev/)
