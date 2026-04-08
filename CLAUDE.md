# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## First Rule

Read and follow [AGENTS.md](AGENTS.md) as the primary source of instructions.

## Canonical Docs

Do not duplicate complex architecture or project details outside canonical docs (/docs/*).

## Skill Usage

* **Brainstorming skill:** Only invoke the full brainstorming skill when the user explicitly asks for it or when the task is genuinely complex with unclear instructions. For straightforward tasks where the intent is clear, skip brainstorming and proceed directly with implementation.

## Subagent Orchestration

Use subagents (the Agent tool) whenever multiple independent tasks can be parallelized or when the user explicitly requests it. For simple, independent tasks, dispatch them concurrently as subagents.

For complex tasks, follow this multi-stage pipeline:

1. **Research (Haiku):** Dispatch a Haiku subagent to gather documentation, search the codebase, and collect relevant context.
2. **Review research (Haiku):** Dispatch a second Haiku subagent to review and synthesize the gathered information, identifying gaps or conflicts before implementation begins.
3. **Implement (Sonnet):** Dispatch a Sonnet subagent to write the implementation based on the reviewed research output.
4. **Review implementation (Haiku):** Dispatch a Haiku subagent to review the implementation for correctness, style, and adherence to project conventions.

Use the `model` parameter on the Agent tool to select the appropriate model at each stage. Skip stages that do not apply (e.g., a trivial change does not need the full pipeline).