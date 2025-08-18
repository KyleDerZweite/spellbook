# Spellbook Development Quick Start

## Prerequisites

- Python 3.11+ (required for backend)
- Podman/Docker (for databases)
- Node.js 18+ (for frontend)

## Initial Setup

### 1. Start Database Containers
Start PostgreSQL and Redis in containers. These should be kept running during development.
```bash
docker-compose up -d

# Check that they are running
docker-compose ps
```

### 2. Setup Backend
This only needs to be done the first time.
```bash
cd backend

# Create a Python virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy development configuration
cp .env.dev .env

# Initialize the database with an admin user
DEBUG=true python init_db.py --admin-email admin@spellbook.local --admin-username admin --admin-password admin123!
```

### 3. Start the Development Server
```bash
# From the backend/ directory with the virtual environment activated
DEBUG=true uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. Access Your API
- Backend API: http://localhost:8000
- Swagger UI: http://localhost:8000/docs
- Health Check: http://localhost:8000/health

### 5. Test Authentication
Admin Login Credentials:
- Email: `admin@spellbook.local`
- Username: `admin`
- Password: `admin123!`

## Daily Development Workflow

1.  **Start databases (if not running)**
    ```bash
    docker-compose up -d
    ```
2.  **Activate Python environment**
    ```bash
    cd backend
    source venv/bin/activate
    ```
3.  **Start backend with hot reload**
    ```bash
    DEBUG=true uvicorn app.main:app --reload
    ```
4.  **Stop when done**
    ```bash
    # Ctrl+C to stop uvicorn
    deactivate
    docker-compose down
    ```

## Project Data

This project relies on data from the Scryfall API. The `scryfall/` directory in the root of this project is the designated location for this data.

**Please Note:** Due to its size, the data in the `scryfall/` directory is not included in this repository. You will need to acquire the data from Scryfall and place it in this directory for the application to function correctly.

## Troubleshooting

### Database Connection Issues
```bash
# Check that the containers are running
docker-compose ps

# View logs
docker-compose logs postgres-dev

# Reset the database
docker-compose down -v
docker-compose up -d
# Then re-run the database initialization
DEBUG=true python init_db.py
```

### Python Environment Issues
```bash
# Recreate the virtual environment
rm -rf venv
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Port Conflicts
```bash
# Check what is using the ports
sudo netstat -tulpn | grep :5432 # PostgreSQL
sudo netstat -tulpn | grep :6379 # Redis
sudo netstat -tulpn | grep :8000 # Backend
```