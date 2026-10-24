# uv statt vermutetem pip

- Status: Historical
- Last Reviewed: 2026-10-24
- Source of Truth: datierte Quellenverweise; aktuelle Verträge bei den bestehenden Owners
- Update Triggers: Package-Manager-Fragen, Änderung der uv-Pins oder Installationsbeispiele
- Related Docs: [Index](./index.md), [CI-Vereinfachung](./ci-simplification.md), [Prioritäten](./priorities.md)

Am 2026-10-24 fand der [uv-Audit](t3-thread://v1/thread:delegated-task:command%3Amcp%3A9e10a3f5-df85-461c-b846-8bcb828bdbf2%3Adelegate-task%3Aspellbook-strategy-uv-20261024-r1) bei `KyleDerZweite/spellbook@62c13b5c7a1c5a9a97f25f4e214271bea7ad4951` keine standalone `pip`-Commands und zwei `uv pip`-Installationsstellen.
`uv pip` gehörte dort zu uv.
Die [API-](https://github.com/KyleDerZweite/spellbook/blob/62c13b5c7a1c5a9a97f25f4e214271bea7ad4951/backend/api/tests/test_installed_wheel.py) und [State-Wheeltests](https://github.com/KyleDerZweite/spellbook/blob/62c13b5c7a1c5a9a97f25f4e214271bea7ad4951/backend/workers/state/tests/test_installed_wheel.py) prüften Installation gebauter Wheels in einer externen venv.
Der [Python-Wrapper](https://github.com/KyleDerZweite/spellbook/blob/62c13b5c7a1c5a9a97f25f4e214271bea7ad4951/scripts/python.mjs) wählte uv 0.12.23 über `uvx` und verwendete Frozen-Locks für das normale Setup.

Am 2026-10-24 glich `KyleDerZweite/spellbook@b48761fe1e991ccf458036ecfdb53956f1fbe2ca` vier Beispiele in den [Catalog-](https://github.com/KyleDerZweite/spellbook/blob/b48761fe1e991ccf458036ecfdb53956f1fbe2ca/backend/workers/catalog/README.md) und [Scan-READMEs](https://github.com/KyleDerZweite/spellbook/blob/b48761fe1e991ccf458036ecfdb53956f1fbe2ca/backend/workers/scan/README.md) an diesen Pin an.
Diese Änderung aktualisierte weder global uv noch den Package Manager.
Sie ersetzte die frühere Audit-Empfehlung eines Ambient-uv-Updates als gewählte Abhilfe für die README-Beispiele.
Für weitere Setup-Fragen die [Deployment-Anleitung](../operations/deployment.md) und [Verification](../operations/github-automation.md#local-checks) lesen.
