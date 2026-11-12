# Intent: agents-spec

## Source

- **Pitch ID:** ad-hoc (kit maintenance)
- **Scope ID:** none — one slice
- **Betting state:** n/a (Tech Lead request: "start slice from P1 to P5, and apply option proyectada")

## Problem

The 13 subagents the kit ships score 3–5/10 against `agent.spec`: six tell agents to write the generated manifest
(contradicting `AGENTS.md`), QA and Knowledge mix authoring with auditing, no agent restricts its tools, none has a
routing boundary, an escalation gate, or a negative mutation check, and `asdd-e2e-tester` is 38 KB.

## Desired Outcome

Every shipped agent follows the agent grammar, holds one role, and runs with the tool envelope its tier allows on the
runtimes that can enforce it (Claude Code, Cursor, OpenCode); a kit sensor keeps it that way.

## Must-have outcomes

- MH-01 (P1) No agent contradicts an `AGENTS.md` rule or carries another project's identifiers.
- MH-02 (P2) One role per agent; only the implementation agent spawns subagents.
- MH-03 (P3) The agent grammar in every agent.
- MH-04 (projection) Capabilities projected to Claude Code, Cursor, and OpenCode agent files at install.
- MH-05 (P4) No agent over its size cap; the Playwright runbook is a module skill.
- MH-06 (P5) `asdd kit agents-lint` in `npm test`.

## No-gos

Renaming the pipeline agents; changing gate numbers; model-in-the-loop canaries; projecting to kimi, junie, devin, kiro
(no documented per-agent tool fields there).
