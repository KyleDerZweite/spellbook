# AI Agent Instructions

This is the primary instruction file for coding agents. Follow it strictly.

## 1. Hard Constraints

* **Scope:** Keep edits surgical and limited strictly to the requested task. Do not introduce broad refactors during feature work.
* **Dependencies:** Do not add new packages or dependencies without documenting the rationale.
* **Structure:** Preserve existing project structure, naming conventions, and architectural boundaries.
* **Tone & Formatting:** Output short, technical responses. Exclude internal summaries or verbose feedback loops. Absolutely avoid em dashes (—) and en dashes (–). Use emojis only when they add functional value (e.g., a warning symbol for a disclaimer in a README), never for mere style or bullet points.

## 2. Canonical References

* **Codebase:** The running code, tests, and configuration are the ultimate source of truth. Do not hallucinate capabilities.
* **Documentation:** Check `docs/` for architecture, conventions, and intent.
* **Duplication:** Do not duplicate complex logic or architecture details in multiple places; reference the canonical files instead.

## 3. Required Workflow

1.  **Analyze:** Ingest context from the codebase and relevant documentation before planning or generating code.
2.  **Implement:** Apply targeted changes. Do not hardcode secrets.
3.  **Verify:** Run the standard project linting, formatting, and test commands.
4.  **Correct:** If checks fail, fix issues autonomously before concluding the task.
5.  **Document:** Update relevant documentation in the same PR or commit if system behavior is modified.

## 4. Coding Principles

* Keep code typed, modular, and minimal.
* Prefer small, targeted edits over large rewrites.
* Follow: KISS, YAGNI, DRY, SOLID, and Separation of Concerns.
* Keep comments and documentation concise.
* Do not add features beyond the requested scope.

---

# Project Specific Instructions

## Git

* **Default branch:** `v1` (not `main`). Use `v1` as the base for PRs and merges.

## Dependencies

* For any usage or integration of the BitsUI dependency, always check docs/bits-ui.md first, then follow the links there to the needed Bits UI documentation.
* For any MeiliSearch work, always check docs/meilisearch/README.md first for a Spellbook-specific overview and two-index architecture, then consult the specific file for the feature needed: search-api.md (frontend queries), indexes-and-settings.md (index configuration), documents.md (adding/updating cards), authentication.md (API keys), or tasks.md (async task polling for the Python worker).

