# Spellbook - Product Requirements Document

## 1. Executive Summary

Spellbook is an open-source, self-hosted card collection management platform designed for trading card game enthusiasts who value data ownership, privacy, and community-driven development. Built under GPLv3 licensing, it addresses the market gap for a comprehensive solution combining modern web interfaces, mobile scanning capabilities, and multi-game support without subscription fees or platform lock-in.

### Key Differentiators
- **Self-hosted architecture** ensuring complete data ownership
- **Zero subscription fees** with one-time setup
- **Mobile-first scanning** with offline capability
- **Multi-game support** starting with MTG, expanding to Pokemon and Yu-Gi-Oh
- **Community-driven development** under GPLv3

## 2. Product Vision & Goals

### Vision Statement
"Empower card game enthusiasts with complete ownership of their collection data through a beautiful, fast, and extensible platform that respects privacy and fosters community collaboration."

### Primary Goals
1. **Data Sovereignty**: Users own and control their collection data
2. **Accessibility**: Simple one-command deployment for non-technical users
3. **Performance**: Sub-second response times for collections with 1M+ cards
4. **Extensibility**: Plugin architecture for community contributions
5. **Sustainability**: Minimal maintenance burden for solo developer

### Non-Goals
- Competing with specialized deck builders (focus on collection management)
- Building a trading marketplace (users handle trades externally)
- Creating a social network (minimal social features)
- Mobile-only experience (web-first with mobile companion)

## 3. Target Users

### Primary Persona: "The Digital Collector"
- **Demographics**: 25-40 years old, tech-comfortable but not necessarily developers
- **Behaviors**: 
  - Maintains 1,000-50,000 card collections
  - Values organization and data ownership
  - Frustrated by subscription services
  - Willing to self-host for privacy/control
- **Needs**: Reliable scanning, comprehensive organization, data portability

### Secondary Persona: "The Privacy-Conscious Player"
- **Demographics**: 20-35 years old, technically proficient
- **Behaviors**:
  - Distrusts cloud services with personal data
  - Runs home lab/personal servers
  - Contributes to open-source projects
- **Needs**: Self-hosted solution, open-source transparency, API access

### Tertiary Persona: "The Multi-Game Enthusiast"
- **Demographics**: 18-45 years old, plays multiple TCGs
- **Behaviors**:
  - Collects across MTG, Pokemon, Yu-Gi-Oh
  - Frustrated managing multiple platforms
  - Wants unified collection view
- **Needs**: Multi-game support, consistent interface, cross-game analytics

## 4. Core Features & Functionality

### Phase 1: Foundation (MVP)
1. **Collection Management**
   - Add/remove cards with quantity tracking
   - Bulk import via CSV/text lists
   - Advanced search and filtering
   - Collection statistics dashboard
   
2. **Card Database**
   - Scryfall API integration for MTG
   - Offline card data caching
   - High-resolution image management
   - Price tracking (TCGPlayer/CardMarket)

3. **User System**
   - JWT-based authentication
   - Role-based permissions (admin/user)
   - Password reset flow
   - Session management

4. **Data Portability**
   - Export to CSV/JSON
   - Import from Deckbox/Moxfield
   - Automated backups
   - API access

### Phase 2: Mobile & Scanning
1. **Mobile Application**
   - Flutter-based iOS/Android app
   - Camera-based card scanning
   - Offline mode with sync
   - Quick add via barcode

2. **Scanning Pipeline**
   - OpenCV image preprocessing
   - OCR for text recognition
   - ML-based card matching
   - Manual override interface

### Phase 3: Advanced Features
1. **Deck Building**
   - Collection-based deck creation
   - Format legality checking
   - Price optimization
   - Export to Arena/MTGO

2. **Multi-Game Support**
   - Pokemon TCG integration
   - Yu-Gi-Oh integration
   - Unified search interface
   - Cross-game collection value

3. **Analytics & Insights**
   - Collection value trends
   - Investment tracking
   - Want list management
   - Trade analysis tools

## 5. Technical Architecture

### Core Stack
- **Backend**: FastAPI (Python 3.11+)
  - Async-first architecture
  - Pydantic for data validation
  - SQLAlchemy ORM
  - Celery for background tasks

- **Database**: PostgreSQL 16
  - JSONB for flexible card metadata
  - Proper indexing for performance
  - Partitioning for large collections

- **Frontend**: Next.js 14
  - React 18 with TypeScript
  - Tailwind CSS + Shadcn/UI
  - Progressive Web App
  - Optimized image loading

- **Mobile**: Flutter
  - Cross-platform from single codebase
  - ML Kit integration
  - Hive for offline storage
  - Platform-specific optimizations

### Infrastructure
- **Containerization**: Docker + Docker Compose
  - Multi-stage builds for size optimization
  - Health checks and auto-restart
  - Volume management for data persistence

- **Reverse Proxy**: Traefik
  - Automatic SSL via Let's Encrypt
  - Load balancing
  - Service discovery

- **Storage**: Hierarchical file system
  ```
  /data/
  ├── cards/
  │   ├── original/    # High-res scans
  │   ├── thumbnail/   # WebP optimized
  │   └── metadata/    # OCR results
  └── backups/         # Automated backups
  ```

### API Design
- RESTful principles with consistent patterns
- Pagination for large datasets
- Comprehensive error handling
- Rate limiting for public instances
- OpenAPI documentation

## 6. Design Principles

### Visual Design
1. **Card-First Interface**: Every view optimized for displaying cards
2. **Information Density**: Show maximum useful data without clutter
3. **Dark Mode Default**: Reduces eye strain during long sessions
4. **Responsive Grid**: Adapts from mobile to 4K displays
5. **Fast Perceived Performance**: Optimistic updates, skeleton screens

### UX Principles
1. **Keyboard Navigation**: Power users can navigate entirely via keyboard
2. **Bulk Operations**: Select multiple cards for actions
3. **Smart Defaults**: Sensible presets that can be customized
4. **Progressive Disclosure**: Advanced features don't overwhelm beginners
5. **Contextual Help**: Inline documentation where needed

## 7. Coding Style Guidelines

### General Principles
1. **Readability over cleverness** - Code should be immediately understandable
2. **Consistent naming** - Use descriptive names that reveal intent
3. **Small functions** - Each function does one thing well
4. **Early returns** - Reduce nesting by returning early
5. **Meaningful comments** - Explain why, not what

### Python (Backend)
```python
# Use type hints for all functions
def calculate_collection_value(
    cards: List[Card], 
    prices: Dict[str, Decimal]
) -> Decimal:
    """Calculate total collection value using current market prices."""
    
# Prefer list comprehensions for simple transformations
valid_cards = [card for card in cards if card.is_valid()]

# Use descriptive variable names
collection_stats = CollectionStats()  # Good
cs = CollectionStats()  # Bad

# Constants in UPPER_CASE
MAX_CARDS_PER_REQUEST = 100

# Early returns for guard clauses
def process_card(card: Card) -> Optional[ProcessedCard]:
    if not card:
        return None
    if card.is_processed():
        return card.processed_data
    # Main logic here
```

### TypeScript (Frontend)
```typescript
// Use interfaces for type safety
interface Card {
  id: string;
  name: string;
  set: string;
  price?: number;
}

// Prefer const and destructuring
const { id, name } = card;

// Use async/await over promises
const fetchCards = async (): Promise<Card[]> => {
  try {
    const response = await api.get('/cards');
    return response.data;
  } catch (error) {
    handleError(error);
    return [];
  }
};

// Component naming: PascalCase
const CardGallery: React.FC<Props> = ({ cards }) => {
  // Implementation
};
```

### Flutter (Mobile)
```dart
// Use strong typing
class Card {
  final String id;
  final String name;
  final String imageUrl;
  
  const Card({
    required this.id,
    required this.name,
    required this.imageUrl,
  });
}

// Prefer const constructors
const padding = EdgeInsets.all(16.0);

// Meaningful widget names
class CardScanButton extends StatelessWidget {
  // Implementation
}

// Extract complex widgets
Widget _buildCardGrid(List<Card> cards) {
  // Implementation
}
```

### SQL Guidelines
```sql
-- Use clear table aliases
SELECT 
    c.id,
    c.name,
    cs.name AS set_name,
    p.market_price
FROM cards c
JOIN card_sets cs ON c.set_id = cs.id
LEFT JOIN prices p ON c.id = p.card_id
WHERE c.user_id = $1;

-- Index naming convention
CREATE INDEX idx_cards_user_id ON cards(user_id);
CREATE INDEX idx_cards_name_search ON cards USING gin(name gin_trgm_ops);
```

## 8. Development Principles

### Core Principles

1. **KISS (Keep It Simple, Stupid)**
   - Choose boring technology that works
   - Avoid premature optimization
   - Start with monolith, evolve as needed
   - Prefer standard solutions over custom

2. **Focus on Outcomes, Not Plan Perfection**
   - Ship working features quickly
   - Get user feedback early
   - Iterate based on real usage
   - Perfect is the enemy of done

3. **YAGNI (You Ain't Gonna Need It)**
   - Build only what's needed now
   - Avoid speculative features
   - Add complexity only when proven necessary
   - Delete unused code aggressively

4. **DRY (Don't Repeat Yourself)**
   - Extract common functionality
   - Use shared components
   - Centralize business logic
   - But don't over-abstract

5. **Boy Scout Rule**
   - Leave code better than you found it
   - Fix small issues immediately
   - Refactor opportunistically
   - Maintain consistent quality

6. **Fail Fast**
   - Validate inputs early
   - Surface errors immediately
   - Provide clear error messages
   - Make debugging easy

### Technical Practices

1. **Test What Matters**
   - Focus on critical paths
   - Test behavior, not implementation
   - Prefer integration tests over unit tests
   - Use snapshot tests for UI

2. **Continuous Deployment**
   - Merge to main frequently
   - Automated tests on every commit
   - Deploy on green builds
   - Feature flags for gradual rollout

3. **Observability First**
   - Structured logging
   - Performance metrics
   - Error tracking (Sentry)
   - User behavior analytics

4. **Progressive Enhancement**
   - Core features work without JavaScript
   - Enhanced experience with modern browsers
   - Graceful degradation
   - Offline-first where possible

## 9. Project Management Principles

### Agile Implementation

1. **Working Software Over Comprehensive Documentation**
   - Demo beats presentation
   - Code is the source of truth
   - Document only what's necessary
   - Automate documentation where possible

2. **Customer Collaboration Over Contract Negotiation**
   - Regular user feedback sessions
   - Public roadmap with voting
   - Open GitHub discussions
   - Community-driven feature requests

3. **Responding to Change Over Following a Plan**
   - Flexible roadmap
   - Pivot based on user needs
   - Kill features that don't work
   - Embrace emerging requirements

4. **Individuals and Interactions Over Processes and Tools**
   - Direct communication
   - Minimal meetings
   - Async-first collaboration
   - Trust over control

### Execution Principles

1. **Ship Early and Often**
   - Weekly releases minimum
   - Feature flags for gradual rollout
   - Beta channel for early adopters
   - Rollback capability

2. **One Thing at a Time**
   - Single focus per sprint
   - Complete before starting new
   - Avoid context switching
   - Deep work blocks

3. **Measure What Matters**
   - User activation rate
   - Feature adoption
   - Performance metrics
   - Error rates

4. **Sustainable Pace**
   - No crunch time
   - Regular breaks
   - Automation over manual work
   - Documentation as you go

## 10. Quality Standards

### Code Quality
- **Test Coverage**: 80% for critical paths
- **Code Review**: All PRs reviewed
- **Linting**: Automated style checks
- **Type Safety**: 100% typed code
- **Performance**: <200ms API response time

### Security Standards
- **Authentication**: JWT with refresh tokens
- **Authorization**: Role-based access control
- **Data Encryption**: TLS 1.3+ only
- **Input Validation**: All user inputs sanitized
- **Dependency Scanning**: Weekly vulnerability checks

### Accessibility Standards
- **WCAG 2.1 AA Compliance**
- **Keyboard Navigation**: All features accessible
- **Screen Reader Support**: Proper ARIA labels
- **Color Contrast**: 4.5:1 minimum
- **Responsive Design**: 320px to 4K support

### Documentation Standards
- **README**: Getting started in <5 minutes
- **API Docs**: OpenAPI specification
- **Code Comments**: Complex logic explained
- **User Guides**: Video tutorials available
- **Troubleshooting**: Common issues documented

## 11. Success Metrics

### User Metrics
- **Monthly Active Users**: 1,000+ within 6 months
- **User Retention**: 60% 30-day retention
- **Collection Size**: Average 5,000+ cards
- **Scan Success Rate**: 90%+ accuracy

### Technical Metrics
- **Uptime**: 99.9% availability
- **Performance**: <200ms page load
- **Mobile App Rating**: 4.5+ stars
- **API Response Time**: <100ms p95

### Community Metrics
- **GitHub Stars**: 1,000+ in first year
- **Contributors**: 20+ active contributors
- **Docker Pulls**: 10,000+ pulls
- **Discord Members**: 500+ active members

### Business Metrics
- **Support Requests**: <5% of users
- **Feature Adoption**: 50%+ use scanning
- **Platform Distribution**: 40% self-hosted
- **Multi-game Users**: 30%+ use 2+ games

## 12. Constraints & Assumptions

### Technical Constraints
- Single developer for initial 6 months
- $200/month infrastructure budget
- No proprietary dependencies
- Must run on Raspberry Pi 4

### Market Assumptions
- Users will self-host for privacy
- Open-source attracts contributors
- Multi-game support drives adoption
- Mobile scanning is critical feature

### Resource Constraints
- Limited marketing budget
- No full-time support staff
- Community-driven documentation
- Volunteer translators

---

*This PRD is a living document. Updates will be made based on user feedback, technical discoveries, and market changes. All changes will be tracked in version control with clear rationale.*