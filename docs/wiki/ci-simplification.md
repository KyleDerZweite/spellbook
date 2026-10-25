# Weniger doppelte CI-Prüfungen

- Status: Historical
- Last Reviewed: 2026-10-24
- Source of Truth: datierte Quellenverweise; aktuelle Verträge bei den bestehenden Owners
- Update Triggers: CI-Aufrufketten, Routing, neue Laufzeitmessung
- Related Docs: [Index](./index.md), [uv](./python-tooling.md), [Prioritäten](./priorities.md)

Am 2026-10-24 entfernte `KyleDerZweite/spellbook@9cf73617979f84b81397201a07de338f3e2438aa` wiederholte Prüfungen und spröde Configuration-Assertions.
Vier Jobs, Path-Routing und Package-Checks blieben erhalten.
Quellen: [Workflow](https://github.com/KyleDerZweite/spellbook/blob/9cf73617979f84b81397201a07de338f3e2438aa/.github/workflows/ci.yml), [Scope-Tests](https://github.com/KyleDerZweite/spellbook/blob/9cf73617979f84b81397201a07de338f3e2438aa/scripts/ci-changes.test.mjs), [Root-Scripts](https://github.com/KyleDerZweite/spellbook/blob/9cf73617979f84b81397201a07de338f3e2438aa/package.json) und [Frontend-Scripts](https://github.com/KyleDerZweite/spellbook/blob/9cf73617979f84b81397201a07de338f3e2438aa/frontend/package.json).

Am 2026-10-24 ergab der statische Vergleich von `KyleDerZweite/spellbook@62c13b5c7a1c5a9a97f25f4e214271bea7ad4951` mit `KyleDerZweite/spellbook@9cf73617979f84b81397201a07de338f3e2438aa` bei vollständiger erfolgreicher Auswahl sieben Node-Testdatei-Ausführungen vor der Änderung und fünf danach.
Python-Boundary-Scan und Boundary-Unittest liefen vorher je zweimal, danach je einmal.
Quelle für die Herleitung: [CI-Audit](t3-thread://v1/thread:delegated-task:command%3Amcp%3A9e10a3f5-df85-461c-b846-8bcb828bdbf2%3Adelegate-task%3Aspellbook-strategy-ci-audit-20261024-r1), Codequellen wie oben.
Die tatsächliche Zeitersparnis war am 2026-10-24 ungemessen.

Am 2026-10-24 wurden [CI-Run 40092372176](https://github.com/KyleDerZweite/spellbook/actions/runs/40092372176) und [PR 276](https://github.com/KyleDerZweite/spellbook/pull/276) als Review-Evidence verknüpft.
Die mutable PR ersetzt keinen Commit-Beleg für Code und der Run keinen Nachweis aller Target-Journeys.
Für spätere Check-Auswahl [Repository Verification](../operations/github-automation.md) lesen.
