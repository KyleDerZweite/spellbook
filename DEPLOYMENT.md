# Spellbook Deployment Guide

## Quick Start (No Reverse Proxy)

The simplest way to run Spellbook in production:

```bash
# Set environment variables
export SECRET_KEY="your-super-secure-secret-key-here"

# Start all services
docker-compose up -d

# Access the application
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
```

This exposes services directly on their ports - perfect for simple setups or when you want to use your own reverse proxy.

## Deployment Options

### Option 1: Direct Access (Default)
- **Simple setup** - Just run `docker-compose up`
- **Works with any reverse proxy** - Nginx, Apache, Caddy, etc.
- **No additional dependencies**
- **Easy to customize**

Services accessible at:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- Database: `localhost:5432` (if needed)
- Redis: `localhost:6379` (if needed)

### Option 2: With Traefik (Optional)
If you want automatic SSL certificates and subdomain routing:

```bash
# Start with Traefik
docker-compose -f docker-compose.yml -f docker-compose.traefik.yml up -d

# Access via subdomains (after DNS setup)
# Frontend: https://spellbook.localhost
# Backend: https://api.spellbook.localhost
# Traefik Dashboard: http://localhost:8080
```

**Traefik Benefits:**
- Automatic SSL certificates (Let's Encrypt)
- Subdomain routing
- Load balancing ready
- Dashboard for monitoring

### Option 3: With Your Own Reverse Proxy

#### Nginx Example
```nginx
# /etc/nginx/sites-available/spellbook
server {
    listen 80;
    server_name spellbook.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name api.spellbook.yourdomain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### Caddy Example
```caddyfile
# Caddyfile
spellbook.yourdomain.com {
    reverse_proxy localhost:3000
}

api.spellbook.yourdomain.com {
    reverse_proxy localhost:8000
}
```

#### Apache Example
```apache
<VirtualHost *:80>
    ServerName spellbook.yourdomain.com
    ProxyPreserveHost On
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/
</VirtualHost>

<VirtualHost *:80>
    ServerName api.spellbook.yourdomain.com
    ProxyPreserveHost On
    ProxyPass / http://localhost:8000/
    ProxyPassReverse / http://localhost:8000/
</VirtualHost>
```

## Environment Configuration

### Required Environment Variables
```bash
# Security (IMPORTANT!)
SECRET_KEY=your-256-bit-secret-key-here

# Database (optional - defaults provided)
DATABASE_URL=postgresql+asyncpg://user:password@postgres:5432/spellbookdb

# Redis (optional - defaults provided)  
REDIS_URL=redis://redis:6379

# Frontend API URL (adjust for your setup)
NEXT_PUBLIC_API_URL=http://localhost:8000  # or https://api.yourdomain.com
```

### Production Environment File
Create `.env` file:

```bash
# .env
SECRET_KEY=your-very-long-random-secret-key-minimum-32-characters
DATABASE_URL=postgresql+asyncpg://user:strongpassword@postgres:5432/spellbookdb
REDIS_URL=redis://redis:6379
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
POSTGRES_PASSWORD=strongpassword
DEBUG=false
```

## Production Checklist

### Security
- Change default SECRET_KEY
- Change default database passwords
- Use strong passwords (16+ characters)
- Enable HTTPS (SSL/TLS)
- Configure firewall rules
- Disable debug mode (`DEBUG=false`)

### Performance
- Configure resource limits in Docker
- Set up database connection pooling
- Configure Redis persistence
- Enable gzip compression in reverse proxy
- Set up CDN for static assets (optional)

### Monitoring
- Set up log aggregation
- Configure health checks
- Monitor resource usage
- Set up backup strategy
- Configure alerting

### Backup Strategy
```bash
# Database backup
docker exec spellbook-postgres pg_dump -U user spellbookdb > backup.sql

# Volume backup
docker run --rm -v spellbook_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-backup.tar.gz /data
docker run --rm -v spellbook_redis_data:/data -v $(pwd):/backup alpine tar czf /backup/redis-backup.tar.gz /data
```

## Scaling Considerations

### Horizontal Scaling
- Multiple backend instances behind load balancer
- Shared PostgreSQL and Redis instances
- Container orchestration (Docker Swarm, Kubernetes)

### Vertical Scaling
- Increase CPU/RAM for containers
- Optimize database settings
- Redis memory optimization

## Troubleshooting

### Common Issues

**Port conflicts:**
```bash
# Check what's using ports
sudo netstat -tulpn | grep :3000
sudo netstat -tulpn | grep :8000

# Change ports in docker-compose.yml if needed
```

**Database connection issues:**
```bash
# Check if PostgreSQL is running
docker logs spellbook-postgres

# Test connection
docker exec -it spellbook-postgres psql -U user -d spellbookdb
```

**Permission errors:**
```bash
# Fix file permissions
sudo chown -R $USER:$USER letsencrypt/
chmod -R 755 letsencrypt/
```

### Health Checks
```bash
# Check all services
docker-compose ps

# Check API health
curl http://localhost:8000/health

# Check frontend
curl http://localhost:3000
```

## Migration from Other Setups

### From Development to Production
1. Stop development containers: `docker-compose -f docker-compose.dev.yml down`
2. Set production environment variables
3. Start production: `docker-compose up -d`
4. Run database migrations: `docker exec spellbook-backend alembic upgrade head`

### Updating Application
```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose build
docker-compose down
docker-compose up -d

# Run any new migrations
docker exec spellbook-backend alembic upgrade head
```

Choose the deployment option that best fits your infrastructure and requirements!