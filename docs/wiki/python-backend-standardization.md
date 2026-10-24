# Python-Backend gezielt standardisieren

- Status: Historical
- Last Reviewed: 2026-10-25
- Source of Truth: datierte Nutzerentscheidungen, verlinkte Designbewertungen und vier unabhängige statische Audits bei `KyleDerZweite/spellbook@740b4d4c434234d19b1b87f928552d069860a604`
- Update Triggers: Stack-Bestätigung, ausgewählter Vereinfachungsschnitt, geänderte Modulverantwortung, neue Audit-Evidenz, native FastAPI-Freigabe, Admin-/ML-Neubewertung
- Related Docs: [Index](./index.md), [Datenbankoptionen](./database-options.md), [Prioritäten](./priorities.md), [Python-Vertrag](../architecture/python-backend-migration.md), [Verification](../operations/github-automation.md)

## Bestätigung vom 2026-10-25

Am 2026-10-25 bestätigte Kyle ausdrücklich Python und PostgreSQL, lehnte Django als bevorzugte Richtung ab und beauftragte eine Vereinfachungsbewertung anhand eines externen modularen Stack-Vorschlags.
Quelle: [Nutzerauftrag](t3-thread://v1/6a511157-806c-4627-afee-58aaf9a7a759).
Damit ist der bevorzugte Stack geklärt.
Litestar, SQLAlchemy, Alembic, Authlib und SQLAdmin sind dadurch weder ausgewählt noch sind Code-Rewrites freigegeben.
Die Bestätigung entspricht dem bestehenden Python-/PostgreSQL-Vertrag und benötigt hier keine neue ADR.

## Befunde und Vorschläge vom 2026-10-25

Root empfahl FastAPI, Psycopg und PostgreSQL mit frameworkfreiem Core sowie bestehenden Mypy- und Boundary-Prüfungen beizubehalten.
Reife Bibliotheksfunktionen sollen eigene Mechanik tatsächlich löschen.
Ein generisches Repository, ein eigenes Framework oder zusätzliche CI-Policy-Werkzeuge sind keine ausgewählten Ziele.
Alle folgenden Änderungen bleiben Vorschläge.
Diese anfängliche Einordnung wurde später am selben Tag durch die [ausgewählte Umsetzung](#ausgewählte-umsetzung-und-neubewertung-vom-2026-10-25) teilweise überholt.

Am untersuchten Commit hostete [FastAPI einen Starlette-Catch-all](https://github.com/KyleDerZweite/spellbook/blob/740b4d4c434234d19b1b87f928552d069860a604/backend/api/src/spellbook_api/http/application.py#L44).
Die eigene [RouteRegistry](https://github.com/KyleDerZweite/spellbook/blob/740b4d4c434234d19b1b87f928552d069860a604/backend/api/src/spellbook_api/http/router.py#L73) übernahm weiterhin Routing, Methoden, Parsing und Fehlerbehandlung.
Der größte mögliche Vereinfachungsschritt wäre native FastAPI-Nutzung mit APIRouter, Pydantic und zentraler Fehlerbehandlung.
Ein Litestar-Wechsel hat dafür keinen belegten Zusatznutzen.
[FastAPI dokumentiert APIRouter](https://fastapi.tiangolo.com/tutorial/bigger-applications/), abgerufen am 2026-10-25.

Als erster begrenzter HTTP-Schnitt könnten doppelte Deck-/Category-Error-Mapper im vorhandenen [error_response](https://github.com/KyleDerZweite/spellbook/blob/740b4d4c434234d19b1b87f928552d069860a604/backend/api/src/spellbook_api/http/errors.py#L49) zusammenlaufen.
Danach könnten explizite Pydantic-Modelle den [FIELDS-Interpreter für neun geschlossene Commands](https://github.com/KyleDerZweite/spellbook/blob/740b4d4c434234d19b1b87f928552d069860a604/backend/api/src/spellbook_api/http/mtg/routes_commands.py#L17) ersetzen.
Dabei sind strikte Typprüfung, `extra="forbid"`, die Unterscheidung zwischen Abwesenheit und `null` sowie Authority-Validierung erforderlich.
Die am 2026-10-25 geprüften Pydantic-Dokumente beschreiben [Strict Mode](https://docs.pydantic.dev/latest/concepts/strict_mode/) und [Extra-Felder](https://docs.pydantic.dev/latest/api/config/#pydantic.config.ConfigDict.extra).

Native Router wären ein größerer späterer Schnitt mit ausdrücklich ausgewähltem einfacherem HTTP-Vertrag und gleichzeitigen Web-/Android-Caller- und Teständerungen.
Historische Node-Zahlen-/HTTP-Eigenheiten dürfen ausdrücklich entfallen.
Der vorhandene OpenAPI-Publikationsowner bleibt zunächst bestehen; generiertes OpenAPI wäre eine eigene Verantwortlichkeitsentscheidung.
Die Acceptance eines späteren Schnitts müsste sichere Fehlerantworten, Konfliktdaten, fehlende Felder und explizites `null` gegen die betroffenen Caller prüfen.
Auth, Account-Isolation, Receipts, Cookies und echte Multipart-Korrektheit brauchen weiterhin aussagekräftige Acceptance.
Der Core-Fingerprint-Serializer darf wegen persistierter Mutation-Fingerprints nicht pauschal verschwinden.

Die [Psycopg-Abstraktion](https://github.com/KyleDerZweite/spellbook/blob/740b4d4c434234d19b1b87f928552d069860a604/backend/core/src/spellbook_core/db.py#L15) war bereits klein.
Row-Typisierung mischte `class_row`-Dataclasses, `Any`-/Dict-Zugriffe und positionale Spaltenlisten.
Vorhandene typisierte Projektionen sollten nur dort wachsen, wo sie doppeltes Feldwissen entfernen.
SQLAlchemy Core oder ORM bräuchten geänderte Connection-/Transaction-Verantwortlichkeiten.
Alembic bleibt Kandidat bei konkreter Migration-Authoring-Reibung und müsste dann den alten Runner ersetzen.
Ein dauerhafter Parallelworkflow und SQLAdmin ohne tatsächlichen Admin-Anwendungsfall vereinfachen hier nichts.

[Passwords](https://github.com/KyleDerZweite/spellbook/blob/740b4d4c434234d19b1b87f928552d069860a604/backend/core/src/spellbook_core/passwords.py#L17) verwendete stdlib-scrypt, `secrets` und `compare_digest`; Sessions waren opaque und widerrufbar.
Eigene kryptografische Grundverfahren lagen damit nicht vor.
OAuth/OIDC und Authlib bleiben Optionen für eine spätere Federation-Anforderung.
Ein lokaler Auth-Rewrite, generisches RBAC oder Admin-Features sind nicht ausgewählt.
Kleine private Password-Helper-Duplikation ist Routinewartung.

Der Operations-Audit fand veraltete API-Zuständigkeit für `VALUE_HISTORY_ENABLED` in [Deployment](https://github.com/KyleDerZweite/spellbook/blob/740b4d4c434234d19b1b87f928552d069860a604/docs/operations/deployment.md#L569) und wirkungslose API-Environment-Weitergabe.
Vorschläge sind korrekte State-Ownership, Core-PostgreSQL-Tests im eigenen Environment mit der bereits verwendeten Pool-Bibliothek als Dev-Abhängigkeit und Entfernung dreier Frontend-Backend-Operator-Forwarder.
Root-/Python-Commands und sinnvolle installierte Wheeltests außerhalb des Checkouts sollen bleiben.
Die jüngste CI-Reduktion soll bestehen bleiben; weitere Prüf-Frameworks sind nicht begründet.

Roots vorgeschlagene Reihenfolge war Error-Owner-Bereinigung und Command-Modelle, opportunistische typisierte SQL-Rows sowie Operations-/Environment-Vereinfachung.
Der größere native HTTP-Vertrag folgt erst als entworfener und ausgewählter Schnitt.

Grundlage waren die unabhängigen statischen Audits [HTTP](t3-thread://v1/thread:delegated-task:command%3Amcp%3A9e10a3f5-df85-461c-b846-8bcb828bdbf2%3Adelegate-task%3Aspellbook-standardization-http-20261025-r1), [Persistence](t3-thread://v1/thread:delegated-task:command%3Amcp%3A9e10a3f5-df85-461c-b846-8bcb828bdbf2%3Adelegate-task%3Aspellbook-standardization-persistence-20261025-r1), [Auth](t3-thread://v1/thread:delegated-task:command%3Amcp%3A9e10a3f5-df85-461c-b846-8bcb828bdbf2%3Adelegate-task%3Aspellbook-standardization-auth-20261025-r1) und [Operations](t3-thread://v1/thread:delegated-task:command%3Amcp%3A9e10a3f5-df85-461c-b846-8bcb828bdbf2%3Adelegate-task%3Aspellbook-standardization-operations-20261025-r1).
Sie belegten weder Runtime-/Deployment-Akzeptanz noch gemessene Einsparungen, Benchmarks oder risikofreien Aufwand.

## Ausgewählte Umsetzung und Neubewertung vom 2026-10-25

Später am 2026-10-25 akzeptierte Kyle native FastAPI-Router und Pydantic sowie die vorgeschlagenen Workflow-Vereinfachungen zur Umsetzung.
Python und PostgreSQL bleiben ausgewählt.
Quelle: [Nutzerentscheidungen](t3-thread://v1/6a511157-806c-4627-afee-58aaf9a7a759).
Der [native HTTP-Entwurf](t3-thread://v1/thread:delegated-task:command%3Amcp%3A9e10a3f5-df85-461c-b846-8bcb828bdbf2%3Adelegate-task%3Aspellbook-native-http-design-20261025-r1) und seine [Review-Korrektur](t3-thread://v1/thread:delegated-task:command%3Amcp%3A9e10a3f5-df85-461c-b846-8bcb828bdbf2%3Adelegate-task%3Aspellbook-native-http-design-review-20261025-r1) halten die ausgewählten Verantwortlichkeiten fest, einschließlich Valuation vor Inventory.
Bei `KyleDerZweite/spellbook@14d0b9b10b96f9975d332fc8b0df123979e79ddd` sind Pydantic für [neun Commands](https://github.com/KyleDerZweite/spellbook/blob/14d0b9b10b96f9975d332fc8b0df123979e79ddd/backend/api/src/spellbook_api/http/mtg/routes_commands.py) und die [zentrale Fehlerbehandlung](https://github.com/KyleDerZweite/spellbook/blob/14d0b9b10b96f9975d332fc8b0df123979e79ddd/backend/api/src/spellbook_api/http/errors.py) integriert.
Die vollständige native Router-Umstellung und Bereinigung öffentlicher Legacy-Typen liefen noch; dieser Eintrag bestätigt keinen Abschluss.

Kyle bekräftigte ein späteres AdminPanel für Benutzer, DB-Prüfungen und Worker sowie ein späteres MLPanel.
Das veranlasste eine Neubewertung von Persistence und Auth, keine Freigabe zur Implementierung von Panels, ORM oder Auth.
Die [Admin-/ML-Bewertung](t3-thread://v1/thread:delegated-task:command%3Amcp%3A9e10a3f5-df85-461c-b846-8bcb828bdbf2%3Adelegate-task%3Aspellbook-admin-ml-reevaluation-20261025-r1) enthält folgende Vorschläge, keinen neuen Vertrag.
Ein AdminPanel macht SQLAdmin und wenige Staff-Permissions zu konkreten Kandidaten.
Benutzerverwaltung und Worker-Operationen brauchen jedoch Core-Commands mit fachlichen Prüfungen.
Für ML betreffen Metadaten, Experimente und Review eigene Abläufe; generisches DB-CRUD beschreibt diese Aufgaben unvollständig.
Die vorläufige Empfehlung bleibt deshalb ein auf Aufgaben ausgerichtetes FastAPI-/Psycopg-Panel.
Ein Hybrid mit SQLAlchemy, Alembic und SQLAdmin kommt erst infrage, wenn tatsächliche CRUD-Anforderungen den zusätzlichen Persistence-Stack rechtfertigen.
Bei ausgewähltem Alembic-Cutover erlaubt die [Pre-release-Policy](./interface-removal.md#erweiterter-verzicht-vom-2026-10-25) eine neue Baseline ohne Adapter für das alte Migration-Ledger.
Das ist eine Option für einen späteren Schnitt, kein bereits ausgewählter Wechsel.
Auth sollte beim späteren Panel dieselbe Identity mit wenigen Staff-Permissions und auditierten Commands verwenden.
Authlib bleibt für künftige Federation denkbar.
Ein neues JWT-System, ein TypeScript-Service oder ein allgemeines Rollenframework sind dadurch nicht ausgewählt.
Die optionale Klärung des ML-Workflows blieb offen; Kyle wählte weder Training als Schwerpunkt noch MLflow.
Diese Empfehlungen brauchen vor Umsetzung einen ausgewählten Umfang und konkrete Panel-Anforderungen.
