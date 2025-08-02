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
- API Documentation: http://localhost:8000/docs

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

Use the interactive API documentation at http://localhost:8000/docs or test with curl:

```bash
# Health check
curl http://localhost:8000/health

# Register user
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","username":"testuser","password":"testpass123"}'

# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass123"}'
```

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
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── models/         # SQLAlchemy models
│   │   ├── schemas/        # Pydantic schemas
│   │   ├── api/            # API routes
│   │   ├── core/           # Core utilities
│   │   └── migrations/     # Alembic migrations
│   ├── requirements.txt
│   └── Dockerfile.dev
├── frontend/               # Next.js frontend
│   ├── src/
│   │   ├── app/           # App router pages
│   │   ├── components/    # React components
│   │   ├── lib/           # Utilities
│   │   └── types/         # TypeScript types
│   ├── package.json
│   └── Dockerfile.dev
├── research/              # Documentation
├── docker-compose.yml     # Production
├── docker-compose.dev.yml # Development
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