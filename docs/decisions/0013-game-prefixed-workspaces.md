# ADR-0013: Game-prefixed workspaces

- Status: Accepted
- Date: 2026-10-05
- Last Reviewed: 2026-10-05
- Source of Truth: user requirement and implemented routes
- Update Triggers: game routes, supported games, selection behavior, compatibility redirects
- Supersedes: [ADR-0004](./0004-flat-routes-with-active-game-state.md) for page routing
- Related Docs: [Routes](../product/routing-and-games.md), [Design direction](../product/ui-design-direction.md), [Frontend](../architecture/frontend.md)

Use `/mtg/search`, `/mtg/inventory`, `/mtg/decks`, and `/mtg/scan` for game-specific work. Keep home, authentication, and legal pages shared. All pages inherit the same root shell, components, and design tokens; a game prefix does not introduce a separate theme.

The MTG route layout establishes the workspace game. Flat page links redirect permanently while preserving suffixes, queries, and methods. Public search stays public; inventory, deck, and scan work remains authenticated. API contracts are unchanged.

The header identifies the game with an icon and tooltip beside the theme control. Only implemented games may participate in cycling. Additional games need explicit route layouts, catalog mappings, filters, and domain tools before they are enabled. This creates room for distinct game workflows without claiming they exist today.
