# grounded-shaping — Capability (backfilled on escalation from lite)

**Capability:** Shaping and product delivery are grounded in what the repository already has, and a PO/PM can run
them with output only to the project's tracker.

- **Actors:** PO/PM (shapes in PO mode through the `asdd-shaping-agent`), engineer (repo mode), Tech Lead (gates).
- **Outcome:** every pitch and every scope carries a Reuse / Extend / New table whose refs (`REQ:`, `slice:`, `path:`)
  exist today; the appetite cites DONE reference slices with their feature counts; a scope that duplicates an
  existing capability is merged or cut; in PO mode the pitch, review, betting decision, scope map, and one Intent item
  per fit scope go to the tracker in the canonical format, and no repository file is written.
- **Out of scope:** importing an Intent item (`intent-intake`), the cloud setup and plays (`shaping-cloud-setup`), and
  enforcing read-only at the command gate (open risk noted by the integrator for `asdd-shaping-agent`).
- **Escalation:** E1 only — skill sources (`cli/`), their installed copies (`.agents/`), and kit records
  (`.harness/config/`) move together by construction; no new domain terms, no dissent.
