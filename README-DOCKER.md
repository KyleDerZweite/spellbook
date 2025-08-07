# Spellbook Docker Guide

This guide explains the different Docker Compose configurations available for Spellbook.

## Quick Start

### 1. Configure Environment
```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your settings (at minimum, change the SECRET_KEY)
nano .env
```

### 2. Choose Your Setup

#### For Development (Recommended)
Run only databases while developing locally:
```bash
# Start PostgreSQL and Redis only
docker-compose -f docker-compose.dev-services.yml up -d

# Your services will be available at:
# PostgreSQL: localhost:5432
# Redis: localhost:6379

# Run backend locally
cd backend
source venv/bin/activate
python init_db.py  # Initialize database
uvicorn app.main:app --reload

# Run frontend locally (in another terminal)
cd frontend
npm run dev
```

#### For Production
```bash
# Start full application stack
docker-compose up -d

# Access the application:
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# Swagger UI: http://localhost:8000/docs
```

## Docker Compose Files

### `docker-compose.dev-services.yml`
**Purpose**: Development database services only  
**Use Case**: When you want to run backend/frontend locally but need databases  
**Services**: PostgreSQL, Redis  
**Ports**: 5432, 6379  

```bash
# Start development databases
docker-compose -f docker-compose.dev-services.yml up -d

# Stop development databases
docker-compose -f docker-compose.dev-services.yml down

# View logs
docker-compose -f docker-compose.dev-services.yml logs -f
```

### `docker-compose.yml`
**Purpose**: Full production deployment  
**Use Case**: Production or full local testing  
**Services**: Frontend, Backend, PostgreSQL, Redis, Worker  
**Ports**: 3000, 8000, 5432, 6379  

```bash
# Start full stack
docker-compose up -d

# Stop full stack
docker-compose down

# Rebuild and restart
docker-compose build
docker-compose up -d
```

### `docker-compose.traefik.yml`
**Purpose**: Optional Traefik reverse proxy  
**Use Case**: When you want automatic SSL and subdomain routing  

```bash
# Start with Traefik
docker-compose -f docker-compose.yml -f docker-compose.traefik.yml up -d

# Access via subdomains (after DNS setup):
# Frontend: https://spellbook.localhost
# Backend: https://api.spellbook.localhost
```

## Environment Configuration

### Required Variables
```bash
SECRET_KEY=your-secure-secret-key-here
POSTGRES_USER=user
POSTGRES_PASSWORD=strong-password
POSTGRES_DB=spellbookdb
```

### Optional Variables
```bash
REGISTRATION_MODE=OPEN  # OPEN, INVITE_ONLY, ADMIN_APPROVAL
DEBUG=false
FRONTEND_PORT=3000
BACKEND_PORT=8000
```

See `.env.example` for all available options.

## Data Persistence

### Development Services
- **PostgreSQL**: `spellbook-postgres-dev-data` volume
- **Redis**: `spellbook-redis-dev-data` volume

### Production
- **PostgreSQL**: `spellbook-postgres-data` volume or `./data/postgres` bind mount
- **Redis**: `spellbook-redis-data` volume or `./data/redis` bind mount
- **Uploads**: `./data/uploads` bind mount

### Managing Data
```bash
# View volumes
docker volume ls | grep spellbook

# Backup database
docker exec spellbook-postgres pg_dump -U user spellbookdb > backup.sql

# Remove all data (WARNING: Destructive)
docker-compose down -v
docker volume prune
```

## Database Initialization

### First Time Setup
```bash
# 1. Start databases
docker-compose -f docker-compose.dev-services.yml up -d

# 2. Wait for PostgreSQL to be ready
docker-compose -f docker-compose.dev-services.yml logs postgres-dev

# 3. Initialize database (from backend directory)
cd backend
source venv/bin/activate
python init_db.py

# 4. The script will:
#    - Run database migrations
#    - Create admin user
#    - Validate schema
```

### Custom Admin User
```bash
python init_db.py --admin-email admin@yourcompany.com --admin-username admin --admin-password securepass123
```

## Troubleshooting

### Common Issues

**Port conflicts:**
```bash
# Check what's using ports
sudo netstat -tulpn | grep :5432
sudo netstat -tulpn | grep :6379

# Change ports in .env file
POSTGRES_PORT=5433
REDIS_PORT=6380
```

**Database connection issues:**
```bash
# Check if PostgreSQL is running
docker-compose -f docker-compose.dev-services.yml ps

# Check logs
docker-compose -f docker-compose.dev-services.yml logs postgres-dev

# Test connection
docker exec -it spellbook-postgres-dev psql -U user -d spellbookdb
```

**Permission errors:**
```bash
# Fix data directory permissions
sudo chown -R $USER:$USER data/
chmod -R 755 data/
```

### Health Checks
```bash
# Check service health
docker-compose ps

# Check individual service
curl http://localhost:8000/health  # Backend
curl http://localhost:3000         # Frontend

# Check database
docker exec spellbook-postgres-dev pg_isready -U user -d spellbookdb
```

### Reset Everything
```bash
# Stop all services
docker-compose down
docker-compose -f docker-compose.dev-services.yml down

# Remove volumes (WARNING: Deletes all data)
docker volume rm $(docker volume ls -q | grep spellbook)

# Remove networks
docker network rm spellbook-network spellbook-dev-network

# Clean up
docker system prune -f
```

## Development Workflow

### Recommended Setup
1. **Databases**: Use `docker-compose.dev-services.yml`
2. **Backend**: Run locally with `uvicorn app.main:app --reload`
3. **Frontend**: Run locally with `npm run dev`

### Benefits
- Fast code reloading
- Easy debugging
- Full IDE integration
- Lower resource usage
- Easy log access

### Database Access
```bash
# PostgreSQL
psql -h localhost -U user -d spellbookdb

# Redis
redis-cli -h localhost

# Or via Docker
docker exec -it spellbook-postgres-dev psql -U user -d spellbookdb
docker exec -it spellbook-redis-dev redis-cli
```