# ADR-0014: Public Landing und privater Workspace

- Status: Accepted
- Date: 2026-10-06
- Last Reviewed: 2026-10-06
- Source of Truth: accepted user requirements and implemented routes, shell and client search
- Update Triggers: home composition, dashboard ownership, default auth destination, shared layout, browser search boundaries
- Related Docs: [Specification](../product/specification.md#dashboard), [Routes](../product/routing-and-games.md), [Auth](../architecture/auth.md), [Frontend](../architecture/frontend.md), [Catalog](../architecture/catalog.md#browser-result-window), [Design direction](../product/ui-design-direction.md)

`/` zeigt für jede Session dieselbe Public Landing. Das private Dashboard liegt unter `/mtg/dashboard`; Login und Registrierung führen ohne sicheren expliziten `returnTo` zu Inventory. Dadurch bleiben öffentliche Präsentation, Bestandsarbeit und private Auswertung eigenständige Aufgaben. Eine explizite Rückkehr zu `/` oder einem Deck bleibt erhalten. Ein Development-Override für die Landing ist überflüssig.

Alle Workspaces nutzen denselben äußeren Layout-Rahmen und Header. Inventory bleibt in der Mitte der Navigation. Das Dashboard berechnet aktuelle Bestandsmengen und die vorhandene Deck Availability je Deck unabhängig. Diese Auswertung begründet weder eine Reservierung zwischen Decks noch Preis- oder Wachstumsverläufe.

Search startet ohne Filter und bildet die vollständige Trefferzahl als Virtual Grid ab. Der Client hält nur begrenzte, adressierbare Seiten und verwirft gemischte Catalog Generations. CatalogWindow besitzt Requests, Cache und Generation-Kohärenz; VirtualCardGrid besitzt Geometrie und sichtbare Indizes. Der vorhandene API-Vertrag bleibt erhalten. Die konkreten Grenzen stehen im Catalog-Dokument; die Umsetzung allein belegt keine Performance mit dem vollständigen Catalog.
