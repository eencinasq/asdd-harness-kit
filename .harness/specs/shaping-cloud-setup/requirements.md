# shaping-cloud-setup — Requirements (backfilled from spec.md on escalation)

- **REQ-001.** The kit shall ship a setup script for Claude Code cloud environments that resolves the `asdd` CLI, builds `tools/knowledge` and `tools/spec-drift` when they exist (kit checkout; projects have no `tools/`), installs and indexes codegraph, syncs the knowledge index, and exits non-zero on any failed step.
- **REQ-002.** `docs/PLAYBOOK.md` shall have a play for PO/PM shaping (agent, tracker, grounding, bet) and one for engineer intake (`asdd intake`, slice, progress back).
- **REQ-003.** The README shall describe the PO → tracker → engineer flow and link both plays.
- **REQ-004.** The script shall offer a `--plan` mode that prints its steps and a `--check` mode that reports each prerequisite and exits non-zero when a required one is missing; neither mode installs, builds, or writes anything.
