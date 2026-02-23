# Spellbook OWASP Top 10 Security Review

> **Note:** The codebase is the ultimate source of truth. This security document provides a conceptual review and recommendations. Actual security controls, implementations, and dependencies evolve and are reflected in the project's source code.

## Executive Summary

Your Spellbook architecture demonstrates good security fundamentals but requires specific enhancements to fully mitigate OWASP Top 10 risks. The most critical areas needing attention are access control validation, secure file handling for card scanning, and comprehensive security logging.

## Detailed Risk Analysis & Recommendations

### A01:2021 – Broken Access Control ⚠️ **HIGH PRIORITY**

**Current State:** 
- JWT authentication implemented
- Basic RBAC (admin/user roles)
- API endpoints require authorization

**Vulnerabilities Identified:**
- No explicit ownership validation in API endpoints
- Potential horizontal privilege escalation
- Missing authorization checks on some endpoints

**Required Fixes:**

```python
# Add to all collection/deck endpoints
async def validate_resource_ownership(
    resource_id: UUID,
    user_id: UUID,
    resource_type: str,
    db: Session
) -> bool:
    """Ensure user owns the resource before allowing access."""
    if resource_type == "collection":
        owner = db.query(UserCards).filter(
            UserCards.id == resource_id,
            UserCards.user_id == user_id
        ).first()
    elif resource_type == "deck":
        owner = db.query(Decks).filter(
            Decks.id == resource_id,
            Decks.user_id == user_id
        ).first()
    return owner is not None

# Example endpoint with proper authorization
@router.patch("/collections/mine/cards/{entry_id}")
async def update_collection_entry(
    entry_id: UUID,
    updates: CollectionEntryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # CRITICAL: Validate ownership before any operations
    if not await validate_resource_ownership(entry_id, current_user.id, "collection", db):
        raise HTTPException(status_code=403, detail="Access denied")
    # ... rest of implementation
```

**Additional Controls:**
```python
# Implement in FastAPI dependencies
class ResourceOwnershipChecker:
    def __init__(self, resource_type: str):
        self.resource_type = resource_type
    
    def __call__(self, 
                 resource_id: UUID,
                 current_user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
        if not validate_resource_ownership(resource_id, current_user.id, self.resource_type, db):
            raise HTTPException(status_code=403, detail="Resource access denied")
        return resource_id

# Usage in routes
@router.get("/decks/{deck_id}")
async def get_deck(
    deck_id: UUID = Depends(ResourceOwnershipChecker("deck")),
    db: Session = Depends(get_db)
):
    # User ownership already validated by dependency
```

---

### A02:2021 – Cryptographic Failures ⚠️ **MEDIUM PRIORITY**

**Current State:**
- TLS 1.3+ enforced
- Bcrypt password hashing
- JWT tokens

**Vulnerabilities:**
- No encryption at rest specified
- JWT signing key management unclear
- API keys for external services not secured

**Required Fixes:**

```python
# Secure configuration management
from cryptography.fernet import Fernet
import os
from pydantic import BaseSettings

class Settings(BaseSettings):
    # JWT Configuration
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY")  # Must be 32+ chars
    JWT_ALGORITHM: str = "RS256"  # Use asymmetric signing
    JWT_PRIVATE_KEY: str = os.getenv("JWT_PRIVATE_KEY")
    JWT_PUBLIC_KEY: str = os.getenv("JWT_PUBLIC_KEY")
    
    # Database encryption
    DATABASE_ENCRYPTION_KEY: str = os.getenv("DB_ENCRYPTION_KEY")
    
    # External API keys (encrypted)
    SCRYFALL_API_KEY: str = os.getenv("SCRYFALL_API_KEY", "")
    
    class Config:
        env_file = ".env"

# Database field encryption for sensitive data
from sqlalchemy_utils import EncryptedType
from sqlalchemy_utils.types.encrypted.encrypted_type import AesEngine

class UserCards(Base):
    # ... other fields
    
    # Encrypt sensitive financial data
    purchase_price = Column(
        EncryptedType(DECIMAL(10, 2), settings.DATABASE_ENCRYPTION_KEY, AesEngine, 'pkcs5')
    )
    notes = Column(
        EncryptedType(TEXT, settings.DATABASE_ENCRYPTION_KEY, AesEngine, 'pkcs5')
    )
```

**Docker Security Configuration:**
```yaml
# docker-compose.prod.yml
services:
  backend:
    environment:
      - JWT_PRIVATE_KEY_FILE=/run/secrets/jwt_private_key
      - JWT_PUBLIC_KEY_FILE=/run/secrets/jwt_public_key
      - DB_ENCRYPTION_KEY_FILE=/run/secrets/db_encryption_key
    secrets:
      - jwt_private_key
      - jwt_public_key
      - db_encryption_key

secrets:
  jwt_private_key:
    external: true
  jwt_public_key:
    external: true
  db_encryption_key:
    external: true
```

---

### A03:2021 – Injection ⚠️ **HIGH PRIORITY**

**Current State:**
- SQLAlchemy ORM (good)
- Pydantic validation

**Vulnerabilities:**
- File upload processing
- OCR text processing
- Dynamic query building

**Required Fixes:**

```python
# Secure file upload handling
from PIL import Image
import magic
from pathlib import Path

ALLOWED_MIME_TYPES = {
    'image/jpeg', 'image/png', 'image/webp'
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

async def validate_image_upload(file: UploadFile) -> bool:
    """Secure image validation."""
    # Check file size
    if file.size > MAX_FILE_SIZE:
        raise HTTPException(400, "File too large")
    
    # Read file header to detect actual type
    header = await file.read(1024)
    await file.seek(0)
    
    # Validate MIME type
    detected_type = magic.from_buffer(header, mime=True)
    if detected_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(400, "Invalid file type")
    
    # Validate image can be opened (prevents malformed files)
    try:
        img = Image.open(file.file)
        img.verify()
        await file.seek(0)
    except Exception:
        raise HTTPException(400, "Corrupted image file")
    
    return True

# Secure OCR text processing
import re
from typing import List

def sanitize_ocr_text(text: str) -> str:
    """Sanitize OCR output to prevent injection."""
    # Remove potential code injection patterns
    dangerous_patterns = [
        r'<script.*?>.*?</script>',
        r'javascript:',
        r'data:text/html',
        r'vbscript:',
        r'on\w+\s*=',
    ]
    
    for pattern in dangerous_patterns:
        text = re.sub(pattern, '', text, flags=re.IGNORECASE | re.DOTALL)
    
    # Limit length to prevent DoS
    return text[:1000]

# Secure dynamic query building
def build_card_search_query(filters: CardSearchFilters, db: Session):
    """Build search query with proper parameterization."""
    query = db.query(Card)
    
    # Always use parameterized queries
    if filters.name:
        # Use proper LIKE with parameterization
        query = query.filter(Card.name.ilike(f"%{filters.name}%"))
    
    if filters.colors:
        # Validate color input
        valid_colors = {'W', 'U', 'B', 'R', 'G'}
        if not all(c in valid_colors for c in filters.colors):
            raise ValueError("Invalid color specification")
        query = query.filter(Card.colors.contains(filters.colors))
    
    return query
```

---

### A04:2021 – Insecure Design ✅ **GOOD**

**Current State:** Architecture is well-designed with proper separation of concerns.

**Enhancements:**
```python
# Add rate limiting to prevent abuse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    # Different limits for different endpoints
    if request.url.path.startswith("/scan/"):
        # Stricter limits for resource-intensive scanning
        limiter.limit("10/minute")(request)
    elif request.url.path.startswith("/auth/"):
        # Prevent brute force attacks
        limiter.limit("5/minute")(request)
    
    return await call_next(request)

# Implement proper session management
class SessionManager:
    @staticmethod
    async def invalidate_user_sessions(user_id: UUID, redis_client):
        """Invalidate all sessions for a user (password change, etc.)"""
        pattern = f"session:user:{user_id}:*"
        keys = await redis_client.keys(pattern)
        if keys:
            await redis_client.delete(*keys)
```

---

### A05:2021 – Security Misconfiguration ⚠️ **MEDIUM PRIORITY**

**Current Issues:**
- Default test user in schema
- Missing security headers
- Docker security not optimized

**Required Fixes:**

```dockerfile
# Secure Dockerfile
FROM python:3.12-slim as base

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Install security updates
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set secure permissions
COPY --chown=appuser:appuser . /app
WORKDIR /app

# Use non-root user
USER appuser

# Remove debug capabilities in production
ENV PYTHONPATH=/app
ENV DEBUG=False
```

```python
# Security headers middleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.middleware.cors import CORSMiddleware

# Add security headers
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    
    # Security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    
    return response

# Trusted hosts only
app.add_middleware(
    TrustedHostMiddleware, 
    allowed_hosts=["spellbook.local", "*.spellbook.local"]
)
```

**Remove Default Credentials:**
```sql
-- Remove from schema.sql - handle via proper setup scripts
-- DELETE THIS: INSERT INTO users (email, username, password_hash, is_admin) VALUES...

-- Instead, create setup script
-- setup_admin.py
import asyncio
from passlib.hash import bcrypt

async def create_admin_user():
    email = input("Admin email: ")
    username = input("Admin username: ")
    password = getpass.getpass("Admin password: ")
    
    # Validate password strength
    if len(password) < 12:
        raise ValueError("Password must be at least 12 characters")
    
    # Create admin user
    hashed_password = bcrypt.hash(password)
    # ... database insertion logic
```

---

### A06:2021 – Vulnerable Components ⚠️ **MEDIUM PRIORITY**

**Required Implementation:**

```yaml
# GitHub Actions security scanning
name: Security Scan
on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      # Python dependency scanning
      - name: Run Safety check
        run: |
          pip install safety
          safety check --json
      
      # Docker image scanning
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: spellbook:latest
          format: 'sarif'
          
      # SAST scanning
      - name: Run Semgrep
        uses: returntocorp/semgrep-action@v1
```

```python
# requirements-security.txt
# Add to regular dependency updates
pip-audit>=2.6.0
safety>=2.3.0
bandit>=1.7.0

# Automated dependency updates with security focus
# dependabot.yml
version: 2
updates:
  - package-ecosystem: "pip"
    directory: "/"
    schedule:
      interval: "weekly"
    allow:
      - dependency-type: "all"
    reviewers:
      - "security-team"
```

---

### A07:2021 – Authentication Failures ⚠️ **MEDIUM PRIORITY**

**Enhancements Needed:**

```python
# Implement account lockout
class AuthenticationManager:
    @staticmethod
    async def handle_failed_login(email: str, redis_client):
        """Track failed login attempts."""
        key = f"failed_login:{email}"
        attempts = await redis_client.incr(key)
        await redis_client.expire(key, 3600)  # 1 hour window
        
        if attempts >= 5:
            # Lock account for 30 minutes
            lock_key = f"account_locked:{email}"
            await redis_client.setex(lock_key, 1800, "locked")
            raise HTTPException(429, "Account temporarily locked")
    
    @staticmethod
    async def validate_password_strength(password: str) -> bool:
        """Enforce strong password policy."""
        requirements = [
            len(password) >= 12,
            any(c.isupper() for c in password),
            any(c.islower() for c in password),
            any(c.isdigit() for c in password),
            any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password)
        ]
        return all(requirements)

# Optional: Add 2FA support
from pyotp import TOTP
import qrcode

class TwoFactorAuth:
    @staticmethod
    def generate_secret(user_id: UUID) -> str:
        """Generate TOTP secret for user."""
        secret = pyotp.random_base32()
        # Store secret securely in database
        return secret
    
    @staticmethod
    def verify_totp(secret: str, token: str) -> bool:
        """Verify TOTP token."""
        totp = TOTP(secret)
        return totp.verify(token, valid_window=1)
```

---

### A08:2021 – Software Integrity Failures ⚠️ **MEDIUM PRIORITY**

**Implementation:**

```yaml
# docker-compose.prod.yml with image verification
services:
  postgres:
    image: postgres:16-alpine@sha256:specific-hash  # Pin exact hash
    
  backend:
    build:
      context: .
      dockerfile: Dockerfile
    image: spellbook/backend:${VERSION}
    deploy:
      restart_policy:
        condition: on-failure
        max_attempts: 3
```

```python
# CI/CD pipeline integrity
# .github/workflows/build.yml
- name: Sign Docker image
  run: |
    cosign sign --key cosign.key spellbook:${GITHUB_SHA}
    
- name: Generate SBOM
  run: |
    syft packages dir:. -o json > sbom.json
    
- name: Verify dependencies
  run: |
    pip-audit --desc --format=json
```

---

### A09:2021 – Security Logging ⚠️ **HIGH PRIORITY**

**Critical Implementation:**

```python
import structlog
from enum import Enum

class SecurityEventType(Enum):
    AUTH_SUCCESS = "auth_success"
    AUTH_FAILURE = "auth_failure"
    ACCESS_DENIED = "access_denied"
    PRIVILEGE_ESCALATION = "privilege_escalation"
    DATA_ACCESS = "data_access"
    DATA_MODIFICATION = "data_modification"
    SUSPICIOUS_ACTIVITY = "suspicious_activity"

class SecurityLogger:
    def __init__(self):
        self.logger = structlog.get_logger("security")
    
    def log_security_event(
        self,
        event_type: SecurityEventType,
        user_id: Optional[UUID] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        resource: Optional[str] = None,
        details: Optional[dict] = None
    ):
        """Log security events with structured data."""
        self.logger.info(
            "security_event",
            event_type=event_type.value,
            user_id=str(user_id) if user_id else None,
            ip_address=ip_address,
            user_agent=user_agent,
            resource=resource,
            details=details or {},
            timestamp=datetime.utcnow().isoformat()
        )

# Middleware for automatic security logging
@app.middleware("http")
async def security_logging_middleware(request: Request, call_next):
    start_time = time.time()
    
    # Extract request info
    client_ip = request.client.host
    user_agent = request.headers.get("user-agent")
    
    try:
        response = await call_next(request)
        
        # Log suspicious patterns
        if response.status_code == 403:
            security_logger.log_security_event(
                SecurityEventType.ACCESS_DENIED,
                ip_address=client_ip,
                user_agent=user_agent,
                resource=str(request.url)
            )
        
        return response
        
    except HTTPException as e:
        if e.status_code == 401:
            security_logger.log_security_event(
                SecurityEventType.AUTH_FAILURE,
                ip_address=client_ip,
                user_agent=user_agent
            )
        raise
```

---

### A10:2021 – Server-Side Request Forgery ⚠️ **MEDIUM PRIORITY**

**Critical for Scryfall API Integration:**

```python
import ipaddress
from urllib.parse import urlparse

class SSRFProtection:
    BLOCKED_NETWORKS = [
        ipaddress.ip_network('127.0.0.0/8'),    # Localhost
        ipaddress.ip_network('10.0.0.0/8'),     # Private
        ipaddress.ip_network('172.16.0.0/12'),  # Private
        ipaddress.ip_network('192.168.0.0/16'), # Private
        ipaddress.ip_network('169.254.0.0/16'), # Link-local
    ]
    
    ALLOWED_DOMAINS = [
        'api.scryfall.com',
        'c2.scryfall.com',  # Image CDN
        'cards.scryfall.io'
    ]
    
    @classmethod
    async def validate_url(cls, url: str) -> bool:
        """Validate URL against SSRF attacks."""
        parsed = urlparse(url)
        
        # Only allow HTTPS
        if parsed.scheme != 'https':
            return False
        
        # Check domain whitelist
        if parsed.hostname not in cls.ALLOWED_DOMAINS:
            return False
        
        # Resolve and check IP
        try:
            ip = ipaddress.ip_address(socket.gethostbyname(parsed.hostname))
            for blocked_network in cls.BLOCKED_NETWORKS:
                if ip in blocked_network:
                    return False
        except Exception:
            return False
        
        return True

# Secure external API client
class SecureAPIClient:
    def __init__(self):
        self.session = httpx.AsyncClient(
            timeout=10.0,
            limits=httpx.Limits(max_connections=10),
            transport=httpx.AsyncHTTPTransport(
                verify=True,  # Always verify SSL
                retries=3
            )
        )
    
    async def fetch_card_data(self, card_id: str) -> dict:
        """Securely fetch card data from Scryfall."""
        url = f"https://api.scryfall.com/cards/{card_id}"
        
        # Validate URL
        if not await SSRFProtection.validate_url(url):
            raise HTTPException(400, "Invalid URL")
        
        # Make request with security headers
        response = await self.session.get(
            url,
            headers={
                "User-Agent": "Spellbook/1.0 (contact@spellbook.local)",
                "Accept": "application/json"
            }
        )
        
        response.raise_for_status()
        return response.json()
```

## Implementation Priority

### 🔴 **Immediate (Week 1)**
1. Fix access control authorization checks
2. Implement security logging
3. Remove default credentials

### 🟡 **Short-term (Month 1)**
1. Add file upload security
2. Implement rate limiting
3. Add security headers
4. SSRF protection for external APIs

### 🟢 **Medium-term (Month 2-3)**
1. Dependency scanning automation
2. Enhanced authentication (2FA optional)
3. Database encryption for sensitive fields
4. Docker security hardening

## Monitoring & Verification

Create security tests to verify implementations:

```python
# tests/test_security.py
import pytest
from fastapi.testclient import TestClient

def test_access_control_horizontal_privilege_escalation():
    """Test users can't access other users' data."""
    # Create two users
    user1_token = create_test_user_and_get_token("user1@test.com")
    user2_token = create_test_user_and_get_token("user2@test.com")
    
    # User1 creates a collection entry
    collection_entry = client.post(
        "/collections/mine/cards",
        json={"card_id": "test-card-id", "quantity": 1},
        headers={"Authorization": f"Bearer {user1_token}"}
    ).json()
    
    # User2 should NOT be able to access User1's collection entry
    response = client.get(
        f"/collections/mine/cards/{collection_entry['id']}",
        headers={"Authorization": f"Bearer {user2_token}"}
    )
    assert response.status_code == 403

def test_rate_limiting():
    """Test rate limiting prevents abuse."""
    for i in range(15):  # Exceed 10/minute limit
        response = client.post("/scan/process", files={"image": test_image})
    
    assert response.status_code == 429

def test_file_upload_security():
    """Test malicious file upload prevention."""
    malicious_file = create_malicious_image()
    response = client.post("/scan/process", files={"image": malicious_file})
    assert response.status_code == 400
```

Your architecture is solid, but implementing these security measures is crucial before production deployment. Focus on the high-priority items first, especially access control and security logging.