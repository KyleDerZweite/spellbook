# Spellbook Architecture

> **Note:** The codebase is the ultimate source of truth. This documentation provides a high-level overview, but architectural details, directory structures, and configurations may evolve. Always refer to the actual code, Docker configurations, and running services for the most accurate and up-to-date information.

## System Overview

Spellbook is a self-hosted card collection management platform built with a modern, scalable architecture designed for single-instance deployment.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Web Client    │     │  Mobile Client  │     │   External API  │
│  (Vite+React)   │     │    (Flutter)    │     │   (Scryfall)    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────┬───────────┘                       │
                     │                                   │
              ┌──────▼──────┐                            │
              │   Traefik   │                            │
              │   (Proxy)   │                            │
              └──────┬──────┘                            │
                     │                                   │
         ┌───────────▼───────────┐                       │
         │      FastAPI          │◄──────────────────────┘
         │   (Backend API)       │
         └───────────┬───────────┘
                     │
    ┌────────────────┼────────────────┐
    │                │                │
┌───▼───┐     ┌──────▼──────┐   ┌─────▼─────┐
│ Redis │     │ PostgreSQL  │   │   MinIO   │
│(Cache)│     │ (Database)  │   │ (Storage) │
└───────┘     └─────────────┘   └───────────┘
```

## Core Components

### 1. Web Frontend (Vite + React)
- **Technology**: React 18, TypeScript, Tailwind CSS, Vite
- **Features**:
  - Hot Module Replacement for development
  - Responsive design (mobile to 4K)
  - Card search and collection management

### 2. Backend API (FastAPI)
- **Technology**: Python 3.12+, FastAPI, SQLAlchemy 2.0, Pydantic
- **Features**:
  - Async request handling with asyncpg
  - JWT authentication with refresh tokens
  - Auto-initialization of card index from Scryfall
  - RESTful API with OpenAPI documentation

### 3. Mobile Application (Flutter)
- **Technology**: Flutter 3.x, Dart
- **Features**: Camera scanning, offline mode (Phase 3)

### 4. Database (PostgreSQL 16)
- **Features**:
  - JSONB for flexible card metadata
  - Full-text search with pg_trgm
  - Alembic migrations

### 5. Cache (Redis)
- **Use Cases**: Session storage, API caching, rate limiting

### 6. Object Storage (MinIO)
- **Use Cases**: Card images, user scans

---

## Backend Architecture

### Data Models

#### User
```python
User:
  id: UUID
  email: str (unique)
  username: str (unique)
  password_hash: str (bcrypt)
  is_active: bool
  is_admin: bool
  status: UserStatus  # PENDING, APPROVED, REJECTED, SUSPENDED
  preferences: JSONB
```

#### Card Data (Dual Storage)

**CardIndex** - Lightweight search index (~100k English cards)
```python
CardIndex:
  scryfall_id: UUID (PK)
  oracle_id: UUID
  name: str (indexed)
  type_line: str
  mana_cost: str
  colors: str
  set_code: str
  rarity: str
  lang: str  # 'en' for English
```

**Card** - Full details, fetched on-demand
```python
Card:
  id: UUID
  scryfall_id: UUID
  oracle_id: UUID
  name, type_line, mana_cost, oracle_text, ...
  image_uris: JSONB
  prices: JSONB
  legalities: JSONB
  storage_reason: CardStorageReason
  cached_at, last_accessed: DateTime
```

#### Collections
```python
UserCard:
  user_id: UUID (FK)
  card_id: UUID (FK)
  quantity: int
  foil_quantity: int
  condition: CardCondition
  purchase_price: Decimal
  tags: List[str]
```

---

## API Structure

Base URL: `/api/v1/`

```
├── auth/
│   ├── POST /register
│   ├── POST /login
│   ├── POST /refresh
│   └── POST /logout
├── cards/
│   ├── GET /search?q=...&colors=...&type=...
│   └── GET /{scryfall_id}
├── collections/
│   ├── GET /mine
│   ├── POST /mine/cards
│   └── PATCH /mine/cards/{id}
└── decks/
    ├── GET /
    ├── POST /
    └── GET /{id}/cards
```

---

## Data Flow

### Card Search
```
User Query → API → CardIndex (PostgreSQL) → Return matches
                 ↓
           Cache Miss? → Fetch from Scryfall → Store in Card table
```

### Auto-Initialization (First Startup)
```
Backend starts → Check CardIndex count
              → If < 1000 cards:
                  → Download Scryfall default_cards bulk data
                  → Filter English cards only
                  → Batch insert to CardIndex
```

---

## Security

### Authentication
- JWT access tokens (15 min) + refresh tokens (7 days)
- HttpOnly cookies for web clients
- Bcrypt password hashing

### Authorization
- Role-based: admin, user
- Resource ownership validation on collections/decks

### Registration Modes
- `OPEN`: Anyone can register
- `INVITE_ONLY`: Requires invite code
- `ADMIN_APPROVAL`: Admin must approve new users

---

## Development Setup

```bash
# Start all services
podman-compose up -d

# Services available at:
# - Frontend: http://localhost:5173
# - Backend API: http://localhost:8000
# - PostgreSQL: localhost:5432
# - Redis: localhost:6379
# - MinIO Console: http://localhost:9001
```

Refer to the container orchestration configurations in the project root for full deployment details.
