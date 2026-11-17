# shaping-cloud-setup — Capability (backfilled on escalation from lite)

**Capability:** A PO/PM without a local clone can shape against the repository in a Claude Code cloud environment, and
both roles find their end-to-end play.

- **Actors:** PO/PM (shaping), engineer (intake), Tech Lead (tracker block, review).
- **Outcome:** `cloud-setup.sh` prepares the environment the grounding step needs (asdd CLI, MCP servers in a kit
  checkout, codegraph index, knowledge index); Plays O and P describe shaping into the tracker and intake from it.
- **Out of scope:** a read-only command-gate mode for the shaping agent (pending; noted in Play O); copying the script
  into projects (it ships in the npm package).
- **Escalation:** E1 only — script under `cli/`, test registered in `package.json`, docs in `docs/` and `README.md`.
