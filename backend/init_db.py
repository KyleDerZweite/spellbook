#!/usr/bin/env python3
"""
Database initialization script for Spellbook

This script:
1. Runs database migrations
2. Creates an initial admin user if none exists
3. Validates the database schema

Usage:
    python init_db.py [--admin-email EMAIL] [--admin-username USERNAME] [--admin-password PASSWORD]

Environment variables:
    ADMIN_EMAIL: Email for the first admin user (default: admin@spellbook.local)
    ADMIN_USERNAME: Username for the first admin user (default: admin)
    ADMIN_PASSWORD: Password for the first admin user (default: admin123!)
"""

import asyncio
import argparse
import os
import sys
from datetime import datetime
from getpass import getpass

# Add the app directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from alembic.config import Config
from alembic import command
from app.database import async_session_maker, engine
from app.models.user import User
from app.core.security import get_password_hash
from app.config import settings
import uuid


def run_migrations():
    """Run database migrations"""
    print("Running database migrations...")
    
    import subprocess
    try:
        result = subprocess.run(
            ["alembic", "upgrade", "head"],
            capture_output=True,
            text=True,
            check=True
        )
        print("✓ Database migrations completed successfully")
        if result.stdout:
            print(f"Migration output: {result.stdout}")
    except subprocess.CalledProcessError as e:
        print(f"✗ Migration failed: {e}")
        if e.stdout:
            print(f"stdout: {e.stdout}")
        if e.stderr:
            print(f"stderr: {e.stderr}")
        raise


async def check_database_connection():
    """Check if database is accessible"""
    print("Checking database connection...")
    
    try:
        async with engine.begin() as conn:
            result = await conn.execute(text("SELECT 1"))
            row = result.fetchone()
            if row and row[0] == 1:
                print("✓ Database connection successful")
                return True
    except Exception as e:
        print(f"✗ Database connection failed: {e}")
        print("Make sure PostgreSQL is running and the database exists.")
        return False


async def create_admin_user(email: str, username: str, password: str):
    """Create the first admin user if none exists"""
    print("Checking for existing admin users...")
    
    async with async_session_maker() as session:
        # Check if any admin users exist
        result = await session.execute(
            select(User).where(User.is_admin == True)
        )
        existing_admin = result.scalar_one_or_none()
        
        if existing_admin:
            print(f"✓ Admin user already exists: {existing_admin.username} ({existing_admin.email})")
            return existing_admin
        
        # Check if username or email already exists
        result = await session.execute(
            select(User).where(
                (User.email == email) | (User.username == username)
            )
        )
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            if existing_user.email == email:
                print(f"✗ Email {email} is already taken by user: {existing_user.username}")
            if existing_user.username == username:
                print(f"✗ Username {username} is already taken by user: {existing_user.email}")
            return None
        
        # Create new admin user
        print(f"Creating admin user: {username} ({email})")
        
        password_hash = get_password_hash(password)
        admin_user = User(
            id=uuid.uuid4(),
            email=email,
            username=username,
            password_hash=password_hash,
            is_active=True,
            is_admin=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            preferences={}
        )
        
        session.add(admin_user)
        await session.commit()
        await session.refresh(admin_user)
        
        print(f"✓ Admin user created successfully: {admin_user.username} (ID: {admin_user.id})")
        return admin_user


async def validate_schema():
    """Validate that all expected tables exist"""
    print("Validating database schema...")
    
    # Hardcoded table names - safe to use in query
    # Using information_schema instead of direct table access to avoid SQL injection warnings
    expected_tables = [
        'users', 'card_sets', 'cards', 'user_cards', 'decks', 'deck_cards'
    ]
    
    async with engine.begin() as conn:
        for table in expected_tables:
            try:
                # Use information_schema to check table existence (SQL injection safe)
                result = await conn.execute(
                    text("SELECT 1 FROM information_schema.tables WHERE table_name = :table_name"),
                    {"table_name": table}
                )
                if result.fetchone():
                    print(f"✓ Table '{table}' exists and is accessible")
                else:
                    print(f"✗ Table '{table}' does not exist")
                    return False
            except Exception as e:
                print(f"✗ Table '{table}' validation failed: {e}")
                return False
    
    print("✓ Database schema validation completed")
    return True


def get_admin_credentials(args):
    """Get admin credentials from args, environment, or user input"""
    
    # Email
    email = args.admin_email or os.getenv('ADMIN_EMAIL')
    if not email:
        email = input("Enter admin email [admin@spellbook.local]: ").strip()
        if not email:
            email = "admin@spellbook.local"
    
    # Username
    username = args.admin_username or os.getenv('ADMIN_USERNAME')
    if not username:
        username = input("Enter admin username [admin]: ").strip()
        if not username:
            username = "admin"
    
    # Password
    password = args.admin_password or os.getenv('ADMIN_PASSWORD')
    if not password:
        password = getpass("Enter admin password (min 8 chars) [admin123!]: ")
        if not password:
            password = "admin123!"
    
    # Validate password
    if len(password) < 8:
        print("✗ Password must be at least 8 characters long")
        sys.exit(1)
    
    return email, username, password


async def main():
    """Main initialization function"""
    parser = argparse.ArgumentParser(
        description="Initialize Spellbook database with admin user"
    )
    parser.add_argument(
        "--admin-email",
        help="Email for admin user (default: admin@spellbook.local)"
    )
    parser.add_argument(
        "--admin-username",
        help="Username for admin user (default: admin)"
    )
    parser.add_argument(
        "--admin-password",
        help="Password for admin user (default: admin123!)"
    )
    parser.add_argument(
        "--skip-migrations",
        action="store_true",
        help="Skip running database migrations"
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Only validate database connection and schema"
    )
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("Spellbook Database Initialization")
    print("=" * 60)
    print(f"Database URL: {settings.DATABASE_URL}")
    print(f"Environment: {'Development' if settings.DEBUG else 'Production'}")
    print("")
    
    # Check database connection
    if not await check_database_connection():
        print("\n✗ Database initialization failed")
        sys.exit(1)
    
    # Run migrations unless skipped
    if not args.skip_migrations:
        try:
            run_migrations()
        except Exception as e:
            print(f"\n✗ Database initialization failed: {e}")
            sys.exit(1)
    
    # Validate schema
    if not await validate_schema():
        print("\n✗ Database initialization failed")
        sys.exit(1)
    
    # If validate-only mode, stop here
    if args.validate_only:
        print("\n✓ Database validation completed successfully")
        return
    
    # Create admin user
    print("")
    email, username, password = get_admin_credentials(args)
    
    admin_user = await create_admin_user(email, username, password)
    if not admin_user:
        print("\n✗ Admin user creation failed")
        sys.exit(1)
    
    print("\n" + "=" * 60)
    print("Database initialization completed successfully!")
    print("=" * 60)
    print(f"Admin user: {admin_user.username}")
    print(f"Admin email: {admin_user.email}")
    print(f"Admin ID: {admin_user.id}")
    print("\nYou can now start the Spellbook API server.")
    print("For security, change the admin password after first login.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n✗ Database initialization cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Database initialization failed: {e}")
        sys.exit(1)