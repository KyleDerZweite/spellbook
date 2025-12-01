# Spellbook API Specification

## Base URL
```
https://api.spellbook.local/v1
```

## Authentication
All authenticated endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

## Common Response Format
```json
{
  "data": {}, // Response data
  "meta": {   // Optional metadata
    "total": 100,
    "page": 1,
    "per_page": 20
  },
  "errors": [] // Error details if any
}
```

## Error Response Format
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  }
}
```

## Status Codes
- `200` - Success
- `201` - Created
- `204` - No Content
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Unprocessable Entity
- `429` - Too Many Requests
- `500` - Internal Server Error

---

## Authentication Endpoints

### Register User
```http
POST /auth/register
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "SecurePassword123!"
}
```

**Response:** `201 Created`
```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "username": "johndoe",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

### Login
```http
POST /auth/login
```

**Request Body:**
```json
{
  "username": "johndoe", // or email
  "password": "SecurePassword123!"
}
```

**Response:** `200 OK`
```json
{
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "Bearer",
    "expires_in": 900 // 15 minutes
  }
}
```

### Refresh Token
```http
POST /auth/refresh
```

**Request Body:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response:** `200 OK`
```json
{
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "expires_in": 900
  }
}
```

### Logout
```http
POST /auth/logout
Authorization: Bearer <token>
```

**Response:** `204 No Content`

---

## User Endpoints

### Get Current User
```http
GET /users/me
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "username": "johndoe",
    "preferences": {
      "theme": "dark",
      "language": "en"
    },
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

### Update User Profile
```http
PATCH /users/me
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "preferences": {
    "theme": "dark",
    "language": "en",
    "default_game": "mtg"
  }
}
```

**Response:** `200 OK`

### Change Password
```http
POST /users/me/password
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "current_password": "OldPassword123!",
  "new_password": "NewPassword123!"
}
```

**Response:** `204 No Content`

---

## Card Database Endpoints

### Search Cards
```http
GET /cards/search
```

**Query Parameters:**
- `q` - Search query (searches name, type, oracle text)
- `colors` - Color filter (e.g., "WU" for white/blue)
- `set` - Set code filter
- `rarity` - Rarity filter (common, uncommon, rare, mythic)
- `type` - Type line filter
- `page` - Page number (default: 1)
- `per_page` - Results per page (default: 20, max: 100)

**Example:**
```
GET /cards/search?q=lightning%20bolt&colors=R&page=1
```

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "name": "Lightning Bolt",
      "mana_cost": "{R}",
      "type_line": "Instant",
      "oracle_text": "Lightning Bolt deals 3 damage to any target.",
      "colors": ["R"],
      "rarity": "common",
      "set": {
        "code": "2ED",
        "name": "Unlimited Edition"
      },
      "image_uris": {
        "small": "https://...",
        "normal": "https://...",
        "large": "https://..."
      },
      "prices": {
        "usd": "2.50",
        "usd_foil": "15.00"
      }
    }
  ],
  "meta": {
    "total": 145,
    "page": 1,
    "per_page": 20
  }
}
```

### Get Card by ID
```http
GET /cards/{card_id}
```

**Response:** `200 OK`
```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "Lightning Bolt",
    "scryfall_id": "e3285e6b-3e79-4d7c-bf96-d920f973b122",
    "oracle_id": "4457ed35-7c10-48c8-9776-456485fdf070",
    "mana_cost": "{R}",
    "cmc": 1,
    "type_line": "Instant",
    "oracle_text": "Lightning Bolt deals 3 damage to any target.",
    "power": null,
    "toughness": null,
    "colors": ["R"],
    "color_identity": ["R"],
    "legalities": {
      "standard": "not_legal",
      "modern": "legal",
      "legacy": "legal",
      "vintage": "legal",
      "commander": "legal"
    },
    "set": {
      "id": "550e8400-e29b-41d4-a716-446655440010",
      "code": "2ED",
      "name": "Unlimited Edition"
    },
    "rarity": "common",
    "artist": "Christopher Rush",
    "prices": {
      "usd": "2.50",
      "usd_foil": null,
      "eur": "2.10"
    }
  }
}
```

### Get Sets
```http
GET /sets
```

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440010",
      "code": "NEO",
      "name": "Kamigawa: Neon Dynasty",
      "release_date": "2022-02-18",
      "card_count": 302,
      "icon_url": "https://..."
    }
  ]
}
```

---

## Collection Endpoints

### Get User Collection
```http
GET /collections/mine
Authorization: Bearer <token>
```

**Query Parameters:**
- `card_name` - Filter by card name
- `set` - Filter by set
- `colors` - Filter by colors
- `tags` - Filter by user tags
- `sort` - Sort by: name, date_added, price (default: name)
- `page` - Page number
- `per_page` - Results per page

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440020",
      "card": {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "name": "Lightning Bolt",
        "set": {
          "code": "2ED",
          "name": "Unlimited Edition"
        },
        "image_uris": {
          "normal": "https://..."
        }
      },
      "quantity": 4,
      "foil_quantity": 1,
      "condition": "near_mint",
      "language": "en",
      "purchase_price": 2.00,
      "current_price": 2.50,
      "tags": ["trade", "modern"],
      "notes": "Bought from LGS",
      "added_at": "2024-01-01T00:00:00Z"
    }
  ],
  "meta": {
    "total": 1523,
    "page": 1,
    "per_page": 20,
    "total_value": 5234.50
  }
}
```

### Add Cards to Collection
```http
POST /collections/mine/cards
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "card_id": "550e8400-e29b-41d4-a716-446655440001",
  "quantity": 4,
  "foil_quantity": 1,
  "condition": "near_mint",
  "language": "en",
  "purchase_price": 2.00,
  "tags": ["trade", "modern"],
  "notes": "Bought from LGS"
}
```

**Response:** `201 Created`

### Update Collection Entry
```http
PATCH /collections/mine/cards/{entry_id}
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "quantity": 3,
  "tags": ["keep", "modern"]
}
```

**Response:** `200 OK`

### Remove from Collection
```http
DELETE /collections/mine/cards/{entry_id}
Authorization: Bearer <token>
```

**Response:** `204 No Content`

### Bulk Import
```http
POST /collections/mine/import
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Request Body:**
- `file` - CSV/TXT file
- `format` - Import format: "deckbox", "moxfield", "arena", "csv"

**Response:** `202 Accepted`
```json
{
  "data": {
    "import_id": "550e8400-e29b-41d4-a716-446655440030",
    "status": "processing",
    "total_lines": 150
  }
}
```

### Get Import Status
```http
GET /collections/mine/imports/{import_id}
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440030",
    "status": "completed",
    "total_cards": 150,
    "successful_imports": 145,
    "failed_imports": 5,
    "errors": [
      {
        "line": 23,
        "card": "Mistyped Card Name",
        "error": "Card not found"
      }
    ]
  }
}
```

### Collection Statistics
```http
GET /collections/mine/stats
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "data": {
    "total_cards": 5234,
    "unique_cards": 1523,
    "total_value": 12453.67,
    "sets_collected": 45,
    "rarity_breakdown": {
      "mythic": 23,
      "rare": 234,
      "uncommon": 567,
      "common": 699
    },
    "color_breakdown": {
      "W": 234,
      "U": 345,
      "B": 456,
      "R": 567,
      "G": 678,
      "colorless": 123,
      "multicolor": 234
    }
  }
}
```

---

## Deck Endpoints

### Get User Decks
```http
GET /decks
Authorization: Bearer <token>
```

**Query Parameters:**
- `format` - Filter by format
- `colors` - Filter by color identity
- `tags` - Filter by tags

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440040",
      "name": "Burn",
      "format": "modern",
      "colors": "R",
      "description": "Classic red burn deck",
      "tags": ["competitive", "tournament"],
      "card_count": 60,
      "sideboard_count": 15,
      "value": 234.56,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-15T00:00:00Z"
    }
  ]
}
```

### Create Deck
```http
POST /decks
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "Burn",
  "format": "modern",
  "description": "Classic red burn deck",
  "tags": ["competitive", "tournament"]
}
```

**Response:** `201 Created`

### Get Deck Details
```http
GET /decks/{deck_id}
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440040",
    "name": "Burn",
    "format": "modern",
    "colors": "R",
    "description": "Classic red burn deck",
    "tags": ["competitive", "tournament"],
    "cards": {
      "mainboard": [
        {
          "card_id": "550e8400-e29b-41d4-a716-446655440001",
          "name": "Lightning Bolt",
          "quantity": 4,
          "category": "Burn"
        }
      ],
      "sideboard": [
        {
          "card_id": "550e8400-e29b-41d4-a716-446655440002",
          "name": "Smash to Smithereens",
          "quantity": 3,
          "category": "Artifact Hate"
        }
      ]
    },
    "stats": {
      "total_cards": 75,
      "average_cmc": 1.8,
      "color_distribution": {
        "R": 60
      },
      "mana_curve": {
        "0": 0,
        "1": 20,
        "2": 16,
        "3": 4
      },
      "total_value": 234.56,
      "missing_cards": [
        {
          "card_id": "550e8400-e29b-41d4-a716-446655440003",
          "name": "Goblin Guide",
          "quantity_needed": 2
        }
      ]
    }
  }
}
```

### Add Cards to Deck
```http
POST /decks/{deck_id}/cards
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "card_id": "550e8400-e29b-41d4-a716-446655440001",
  "quantity": 4,
  "is_sideboard": false,
  "category": "Burn"
}
```

**Response:** `201 Created`

### Export Deck
```http
GET /decks/{deck_id}/export
Authorization: Bearer <token>
```

**Query Parameters:**
- `format` - Export format: "arena", "mtgo", "text", "moxfield"

**Response:** `200 OK`
```text
Deck
4 Lightning Bolt
4 Lava Spike
...

Sideboard
3 Smash to Smithereens
...
```

---

## Scanning Endpoints

### Process Card Scan
```http
POST /scan/process
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Request Body:**
- `image` - Image file (JPEG, PNG)
- `add_to_collection` - Boolean (optional, default: false)

**Response:** `200 OK`
```json
{
  "data": {
    "detected_cards": [
      {
        "card_id": "550e8400-e29b-41d4-a716-446655440001",
        "name": "Lightning Bolt",
        "set": "2ED",
        "confidence": 0.95,
        "bounding_box": {
          "x": 100,
          "y": 50,
          "width": 300,
          "height": 420
        }
      }
    ],
    "scan_id": "550e8400-e29b-41d4-a716-446655440050",
    "processing_time": 1.23
  }
}
```

### Get Scan History
```http
GET /scan/history
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440050",
      "detected_card": {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "name": "Lightning Bolt"
      },
      "confidence": 0.95,
      "scanned_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

## Utility Endpoints

### Health Check
```http
GET /health
```

**Response:** `200 OK`
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### Sync Card Database
```http
POST /admin/sync-cards
Authorization: Bearer <token>
```
**Requires Admin Role**

**Response:** `202 Accepted`
```json
{
  "data": {
    "task_id": "550e8400-e29b-41d4-a716-446655440060",
    "status": "processing"
  }
}
```

---

## Rate Limiting

- **Anonymous**: 60 requests per hour
- **Authenticated**: 600 requests per hour
- **Search endpoints**: 30 requests per minute

Rate limit information is included in response headers:
```
X-RateLimit-Limit: 600
X-RateLimit-Remaining: 599
X-RateLimit-Reset: 1640995200
```

---

## Webhooks (Future)

Webhooks can be configured for events:
- `collection.updated` - When collection changes
- `price.alert` - When card price meets threshold
- `deck.invalid` - When deck becomes illegal in format

**Webhook Payload:**
```json
{
  "event": "collection.updated",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": {
    // Event-specific data
  }
}
```