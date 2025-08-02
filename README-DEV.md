# Spellbook Development Setup

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local frontend development)
- Python 3.11+ (for local backend development)

### Development Environment

1. **Clone and navigate to project:**
```bash
git clone <repository>
cd spellbook
```

2. **Start development environment:**
```bash
# Start all services
docker-compose -f docker-compose.dev.yml up

# Or start specific services
docker-compose -f docker-compose.dev.yml up postgres redis
```

3. **Run database migrations:**
```bash
# In backend directory
cd backend
pip install -r requirements-dev.txt
alembic upgrade head
```

4. **Access the application:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- **Swagger UI: http://localhost:8000/docs**
- **ReDoc: http://localhost:8000/redoc**
- OpenAPI Schema: http://localhost:8000/openapi.json

### Local Development (without Docker)

#### Backend
```bash
cd backend
pip install -r requirements-dev.txt
cp .env.example .env
# Edit .env with your settings
alembic upgrade head
uvicorn app.main:app --reload
```

#### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local with your settings
npm run dev
```

### Database Setup

The PostgreSQL database is automatically set up with Docker. If running locally:

1. Create database:
```sql
CREATE DATABASE spellbookdb;
CREATE USER user WITH PASSWORD 'password';
GRANT ALL PRIVILEGES ON DATABASE spellbookdb TO user;
```

2. Run migrations:
```bash
cd backend
alembic upgrade head
```

### API Testing

#### Interactive Documentation (Recommended)
- **Swagger UI**: http://localhost:8000/docs
  - Interactive interface to test all endpoints
  - Built-in authentication support
  - Request/response examples
  - Schema documentation

- **ReDoc**: http://localhost:8000/redoc  
  - Alternative documentation view
  - Better for browsing API structure

#### Automated Testing Script
```bash
cd backend
python test_api.py
```

#### Manual Testing with curl
```bash
# Health check
curl http://localhost:8000/health

# Register user
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","username":"testuser","password":"testpass123"}'

# Login and get token
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass123"}' | \
  jq -r '.data.access_token')

# Use token for protected endpoints
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/users/me

# Search cards (empty until database populated)
curl "http://localhost:8000/api/v1/cards/search?q=lightning"
```

#### Authentication in Swagger UI
1. Go to http://localhost:8000/docs
2. Click "Authorize" button
3. Register a user via `/api/v1/auth/register`
4. Login via `/api/v1/auth/login` to get token
5. Enter token in format: `Bearer <your_token>`
6. Now you can test protected endpoints!

### Development Commands

#### Backend
```bash
cd backend

# Run tests
pytest

# Code formatting
black .
isort .

# Linting
flake8

# Type checking
mypy .

# Create migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head
```

#### Frontend
```bash
cd frontend

# Development server
npm run dev

# Build for production
npm run build

# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix
```

### Project Structure

```
spellbook/
├── backend/                       # FastAPI backend
│   ├── app/
│   │   ├── models/               # SQLAlchemy models
│   │   ├── schemas/              # Pydantic schemas
│   │   ├── api/                  # API routes
│   │   ├── core/                 # Core utilities
│   │   └── migrations/           # Alembic migrations
│   ├── requirements.txt
│   ├── Dockerfile.dev
│   └── test_api.py               # API testing script
├── frontend/                     # Next.js frontend
│   ├── src/
│   │   ├── app/                 # App router pages
│   │   ├── components/          # React components
│   │   ├── lib/                 # Utilities
│   │   └── types/               # TypeScript types
│   ├── package.json
│   └── Dockerfile.dev
├── research/                     # Documentation & planning
├── docker-compose.yml            # Production (no reverse proxy)
├── docker-compose.dev.yml        # Development
├── docker-compose.traefik.yml    # Optional Traefik config
├── DEPLOYMENT.md                 # Deployment guide
└── README.md
```

### Troubleshooting

#### Database Connection Issues
```bash
# Check if PostgreSQL is running
docker-compose -f docker-compose.dev.yml ps postgres

# View logs
docker-compose -f docker-compose.dev.yml logs postgres

# Reset database
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up postgres
```

#### Frontend Issues
```bash
# Clear Next.js cache
rm -rf frontend/.next

# Reinstall dependencies
cd frontend && rm -rf node_modules package-lock.json && npm install
```

#### Backend Issues
```bash
# Check Python environment
python --version
pip list

# Reinstall dependencies
cd backend && pip install -r requirements-dev.txt
```

## Production Deployment

### Simple Production Setup (No Reverse Proxy)
```bash
# Set environment variables
export SECRET_KEY="your-super-secure-secret-key"

# Start production services
docker-compose up -d

# Access:
# Frontend: http://localhost:3000
# Backend: http://localhost:8000
```

### With Traefik (Optional)
```bash
# For automatic SSL and subdomain routing
docker-compose -f docker-compose.yml -f docker-compose.traefik.yml up -d

# Access:
# Frontend: https://spellbook.localhost
# Backend: https://api.spellbook.localhost
```

### With Your Own Reverse Proxy
The default setup works with any reverse proxy (Nginx, Apache, Caddy, etc.).
See `DEPLOYMENT.md` for detailed configuration examples.

### Next Development Steps

1. **Implement Authentication UI**
   - Login/register pages
   - Protected routes
   - User profile management

2. **Build Card Search**
   - Search interface
   - Card display components
   - Pagination

3. **Collection Management**
   - Add/remove cards
   - Collection statistics
   - Import/export functionality

4. **Scryfall Integration**
   - Card data sync
   - Background jobs with Celery
   - Image processing

5. **Advanced Features**
   - Deck building
   - Mobile app (Flutter)
   - Card scanning