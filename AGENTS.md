# AI Agent Instructions

This is the primary instruction file for coding agents. Follow it strictly.

## 1. Hard Constraints

* **Scope:** Keep edits surgical and limited strictly to the requested task. Do not introduce broad refactors during feature work.
* **Dependencies:** Do not add new packages or dependencies without documenting the rationale.
* **Structure:** Preserve existing project structure, naming conventions, and architectural boundaries.
* **Tone & Formatting:** Output short, technical responses. Exclude internal summaries or verbose feedback loops. Absolutely avoid em dashes and en dashes. Use emojis only when they add functional value, never for style or bullets.

## 2. Canonical References

* **Codebase:** The running code, tests, and configuration are the ultimate source of truth. Do not hallucinate capabilities.
* **Documentation:** Check `docs/README.md` first, then the relevant typed section under `docs/`.
* **Historical Docs:** Do not keep a parallel archive tree under `docs/`. Use git history for superseded documentation.
* **Duplication:** Do not duplicate complex logic or architecture details in multiple places. Reference the canonical files instead.

## 3. Required Workflow

1.  **Analyze:** Ingest context from the codebase and relevant documentation before planning or generating code.
2.  **Implement:** Apply targeted changes. Do not hardcode secrets.
3.  **Verify:** Run the standard project linting, formatting, and test commands.
4.  **Correct:** If checks fail, fix issues autonomously before concluding the task.
5.  **Document:** Apply this documentation decision tree in the same change:
    * If system behavior, route surface, schema, auth flow, env vars, or operator steps changed, update the relevant canonical doc.
    * If a significant architectural or product decision was made, create or update an ADR in `docs/decisions/`.
    * If a doc was replaced or became historical, remove it from the active docs surface and rely on git history for retention.
    * If no current doc fits, create one in the correct typed section and add it to that section index.

## 4. Coding Principles

* Keep code typed, modular, and minimal.
* Prefer small, targeted edits over large rewrites.
* Follow: KISS, YAGNI, DRY, SOLID, and Separation of Concerns.
* Keep comments and documentation concise.
* Do not add features beyond the requested scope.

## 5. Documentation Knowledge System

* `docs/README.md` is the canonical documentation entrypoint for both humans and agents.
* Active docs live under typed sections in `docs/`: `product/`, `architecture/`, `operations/`, `integrations/`, `decisions/`, and `reference/`.
* Use `docs/decisions/` for significant decisions and tradeoffs.
* Use plain markdown only. Do not introduce Obsidian-only syntax or workflow assumptions.
* Do not create ad hoc markdown in random repo locations for durable project knowledge.
* For any touched canonical doc, update `Last Reviewed`, confirm `Update Triggers`, verify `Related Docs`, and fix links affected by moves or renames.
* Do not document planned behavior as if it is implemented.
* Do not let code and canonical docs diverge intentionally for later cleanup.
* Do not duplicate the same system truth across multiple canonical docs unless one file is clearly an index.
* Do not leave durable project knowledge only in issue comments or commit messages when it belongs in docs or ADRs.
* Run a docs health check once per milestone or release, or monthly during active development.
* A docs health check should look for stale claims versus code, orphaned docs, missing index links, duplicate truths, planned-versus-implemented confusion, and ADRs that should be marked superseded.
* Do not keep a docs archive directory. Remove superseded docs and use git history when historical recovery is needed.
* Do not plan a separate `wiki/` unless the docs and ADR corpus outgrow this structure or raw research material becomes a first-class repo concern.

## 6. Skill Usage

* **Brainstorming skill:** Only invoke the full brainstorming skill when the user explicitly asks for it or when the task is genuinely complex with unclear instructions. For straightforward tasks where the intent is clear, skip brainstorming and proceed directly with implementation.

## 7. Subagent Orchestration

Use subagents when multiple independent tasks can be parallelized or when the user explicitly requests it.

For complex tasks:

1.  **Research:** Use a lightweight subagent to gather documentation and codebase context.
2.  **Review research:** Use a second lightweight subagent to synthesize findings and flag gaps or conflicts.
3.  **Implement:** Use an implementation-focused subagent when delegation is materially useful.
4.  **Review implementation:** Use a lightweight subagent to review correctness, style, and convention adherence.

Skip stages that do not apply.

---

# Project Specific Instructions

## Git

* **Default branch:** `v1` (not `main`). Use `v1` as the base for PRs and merges.

## Dependencies

* For any usage or integration of the BitsUI dependency, always check `docs/reference/bits-ui.md` first, then follow the links there to the needed Bits UI documentation.
* For any MeiliSearch work, always check `docs/integrations/meilisearch/README.md` first for a Spellbook-specific overview and two-index architecture, then consult the specific file for the feature needed: `search-api.md` (frontend queries), `indexes-and-settings.md` (index configuration), `documents.md` (adding or updating cards), `authentication.md` (API keys), or `tasks.md` (async task polling for the Python worker).
