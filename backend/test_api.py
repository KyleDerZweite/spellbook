#!/usr/bin/env python3
"""
Simple API testing script for Spellbook API
Run this to test basic functionality
"""

import requests
import json
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:8000"
API_BASE = f"{BASE_URL}/api/v1"

# Test credentials
TEST_USER = {
    "email": "test@spellbook.local",
    "username": "testuser",
    "password": "testpassword123"
}

def print_response(response, title):
    """Pretty print API response"""
    print(f"\n{'='*50}")
    print(f"{title}")
    print(f"{'='*50}")
    print(f"Status: {response.status_code}")
    
    try:
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
    except:
        print(f"Response: {response.text}")
    print("="*50)

def test_health():
    """Test health endpoint"""
    response = requests.get(f"{BASE_URL}/health")
    print_response(response, "Health Check")
    return response.status_code == 200

def test_register():
    """Test user registration"""
    response = requests.post(
        f"{API_BASE}/auth/register",
        json=TEST_USER
    )
    print_response(response, "User Registration")
    return response.status_code in [201, 409]  # 409 if user already exists

def test_login():
    """Test user login"""
    response = requests.post(
        f"{API_BASE}/auth/login",
        json={
            "username": TEST_USER["username"],
            "password": TEST_USER["password"]
        }
    )
    print_response(response, "User Login")
    
    if response.status_code == 200:
        return response.json()["data"]["access_token"]
    return None

def test_protected_endpoint(token):
    """Test protected endpoint"""
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{API_BASE}/users/me", headers=headers)
    print_response(response, "Get Current User (Protected)")
    return response.status_code == 200

def test_card_search():
    """Test card search endpoint"""
    response = requests.get(f"{API_BASE}/cards/search?q=lightning")
    print_response(response, "Card Search")
    return response.status_code == 200

def main():
    """Run all tests"""
    print(f"Testing Spellbook API at {BASE_URL}")
    print(f"Time: {datetime.now().isoformat()}")
    
    # Test 1: Health check
    if not test_health():
        print("[FAIL] Health check failed - is the server running?")
        return
    
    print("[PASS] Health check passed")
    
    # Test 2: User registration
    if not test_register():
        print("[FAIL] User registration failed")
        return
    
    print("[PASS] User registration passed")
    
    # Test 3: User login
    token = test_login()
    if not token:
        print("[FAIL] User login failed")
        return
    
    print("[PASS] User login passed")
    
    # Test 4: Protected endpoint
    if not test_protected_endpoint(token):
        print("[FAIL] Protected endpoint failed")
        return
    
    print("[PASS] Protected endpoint passed")
    
    # Test 5: Card search (will be empty until database is populated)
    if not test_card_search():
        print("[FAIL] Card search failed")
        return
    
    print("[PASS] Card search passed")
    
    print(f"\nAll tests passed!")
    print(f"\nAccess API documentation at:")
    print(f"   Swagger UI: {BASE_URL}/docs")
    print(f"   ReDoc:      {BASE_URL}/redoc")
    print(f"   OpenAPI:    {BASE_URL}/openapi.json")

if __name__ == "__main__":
    main()