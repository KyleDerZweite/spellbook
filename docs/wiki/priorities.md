# Prioritäten und Zusammenarbeit

- Status: Historical
- Last Reviewed: 2026-10-24
- Source of Truth: datierte Quellenverweise; aktuelle Verträge bei den bestehenden Owners
- Update Triggers: Prioritätswechsel, Agent-Zusammenarbeit, konkrete Environment-Reibung
- Related Docs: [Index](./index.md), [Wiki-Pflege](./wiki-maintenance.md), [Interface-Entfernung](./interface-removal.md)

Am 2026-10-24 bekräftigte Kyle die Reihenfolge Long Term Maintainable, Simplicity, Features.
Er beauftragte Root als DRI mit der Koordination von Background-Main-Agents und knapper Kommunikation über Context Pointers.
Environment-Verbesserungen sollten konkrete Reibung beheben; einmalige Workarounds waren unerwünscht.
Quelle: [Strategiedialog vom 2026-10-24](t3-thread://v1/6a511157-806c-4627-afee-58aaf9a7a759).
Für Modell- und Rollenregeln beim Wiedereinstieg [AGENTS.md](../../AGENTS.md) und die geltenden persönlichen Anweisungen lesen.

Am 2026-10-24 verwies der Stand `KyleDerZweite/spellbook@62c13b5c7a1c5a9a97f25f4e214271bea7ad4951` auf [ADR-0027](https://github.com/KyleDerZweite/spellbook/blob/62c13b5c7a1c5a9a97f25f4e214271bea7ad4951/docs/decisions/0027-python-functional-migration-acceptance.md) vom 2026-10-23.
Diese Entscheidung hatte strikte Ressourcen-, Collector- und Linux/Kernel-Proofs als Implementierungsvoraussetzungen abgelöst.
Die damaligen Proof-Gates dürfen aus historischen Verweisen nicht wieder als akzeptierte Anforderungen abgeleitet werden.
Funktionale Korrektheit und separate Production-Autorität behielten ihre eigenen Verträge.
