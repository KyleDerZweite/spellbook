# Spellbook - Product Requirements Document

> **Note:** The codebase is the ultimate source of truth. This PRD provides a high-level product vision and requirements, but the implementation details, structure, and features may evolve. Always refer to the actual code for the most accurate and up-to-date information.

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
- **Backend**: FastAPI (Python 3.12+)
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

- **Storage**: Hierarchical file system managed via object storage or local volumes, categorizing files into high-res scans, optimized thumbnails, OCR metadata, and automated backups.

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

The codebase is the source of truth for all specific coding styles. We rely on standard tooling (like linters and formatters) configured in each project directory rather than documenting specific code examples here.

### General Principles
1. **Readability over cleverness** - Code should be immediately understandable
2. **Consistent naming** - Use descriptive names that reveal intent
3. **Small functions** - Each function does one thing well
4. **Early returns** - Reduce nesting by returning early
5. **Meaningful comments** - Explain why, not what

## 8. Development Principles

The following core principles are applied across the codebase where usable. They act as strong guidelines rather than strictly enforced rules. However, if they are violated, the reasoning **must be explicitly documented** in comments or commit messages.

1. **KISS (Keep It Simple, Stupid)**
   - Choose straightforward solutions that work.
   - Start with simplicity, evolve as needed.

2. **DRY (Don't Repeat Yourself)**
   - Extract common functionality.
   - Use shared components and centralize business logic.
   - Avoid over-abstraction.

3. **YAGNI (You Aren't Gonna Need It)**
   - Build only what's needed now.
   - Avoid speculative features.
   - Add complexity only when proven necessary.

4. **SOLID**
   - Follow Single Responsibility, Open-Closed, Liskov Substitution, Interface Segregation, and Dependency Inversion principles to build robust and maintainable software.

5. **Separation of Concerns (SoC)**
   - Keep distinct features and layers (e.g., UI, business logic, data access) separated to increase modularity and ease of maintenance.

6. **Avoid Premature Optimization**
   - Focus on correct and clear code first. Only optimize bottlenecks after measuring and profiling real-world performance.

7. **Law of Demeter**
   - Modules should only interact with their immediate friends. Minimize tight coupling between disparate components.

### Technical Practices

1. **Test What Matters**
   - Focus on critical paths. Test behavior, not implementation.
2. **Continuous Deployment**
   - Merge frequently. Automated tests on every commit.
3. **Observability First**
   - Structured logging, performance metrics, and error tracking.
4. **Progressive Enhancement**
   - Graceful degradation and offline-first where possible.

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