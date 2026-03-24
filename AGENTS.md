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

## 5. Skill Usage

* **Brainstorming skill:** Only invoke the full brainstorming skill when the user explicitly asks for it or when the task is genuinely complex with unclear instructions. For straightforward tasks where the intent is clear, skip brainstorming and proceed directly with implementation.

## 6. Subagent Orchestration

Use subagents (the Agent tool) whenever multiple independent tasks can be parallelized or when the user explicitly requests it. For simple, independent tasks, dispatch them concurrently as subagents.

For complex tasks, follow this multi-stage pipeline:

1. **Research (Haiku):** Dispatch a Haiku subagent to gather documentation, search the codebase, and collect relevant context.
2. **Review research (Haiku):** Dispatch a second Haiku subagent to review and synthesize the gathered information, identifying gaps or conflicts before implementation begins.
3. **Implement (Sonnet):** Dispatch a Sonnet subagent to write the implementation based on the reviewed research output.
4. **Review implementation (Haiku):** Dispatch a Haiku subagent to review the implementation for correctness, style, and adherence to project conventions.

Use the `model` parameter on the Agent tool to select the appropriate model at each stage. Skip stages that do not apply (e.g., a trivial change does not need the full pipeline).

---

# Project Specific Instructions

## Git

* **Default branch:** `v1` (not `main`). Use `v1` as the base for PRs and merges.

## Dependencies

* For any usage or integration of the BitsUI dependency, always check docs/bits-ui.md first, then follow the links there to the needed Bits UI documentation.
* For any MeiliSearch work, always check docs/meilisearch/README.md first for a Spellbook-specific overview and two-index architecture, then consult the specific file for the feature needed: search-api.md (frontend queries), indexes-and-settings.md (index configuration), documents.md (adding/updating cards), authentication.md (API keys), or tasks.md (async task polling for the Python worker).

