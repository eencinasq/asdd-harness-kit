# shaping-cloud-setup — Spec (lite)

## Intent

P6.5 (gap G27). A PO/PM without a local clone shapes in claude.ai/code (or the Claude Desktop Code tab) against the
repository. The cloud environment needs the harness tools the grounding step uses: the built MCP servers (Node 24,
pnpm) and the codegraph CLI with an index. Ship a setup script for that environment and document the PO and engineer
plays end to end (shape → tracker → intake → slice → progress back to the tracker).

Mapped: `cli/runtimes/claude/README.md`, `cli/runtimes/claude/cloud-setup.sh` (new), `cli/test/cloud-setup.test.mjs` (new), `package.json` (`test` script entry), `docs/PLAYBOOK.md`, `README.md`, `cli/README.md`

## Requirements

- **REQ-001.** The kit shall ship a setup script for Claude Code cloud environments that resolves the `asdd` CLI, builds `tools/knowledge` and `tools/spec-drift` when they exist (kit checkout; projects have no `tools/`), installs and indexes codegraph, syncs the knowledge index, and exits non-zero on any failed step.
- **REQ-004.** The script shall offer a `--plan` mode that prints its steps and a `--check` mode that reports each prerequisite and exits non-zero when a required one is missing; neither mode installs, builds, or writes anything.
- **REQ-002.** `docs/PLAYBOOK.md` shall have a play for PO/PM shaping (agent, tracker, grounding, bet) and one for engineer intake (`asdd intake`, slice, progress back).
- **REQ-003.** The README shall describe the PO → tracker → engineer flow and link both plays.

## Depends on

`tracker-binding`, `shaping-agent`, `grounded-shaping`, `intent-intake`.
