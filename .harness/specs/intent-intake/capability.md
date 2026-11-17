# intent-intake — Capability (backfilled on escalation from lite)

**Capability:** An engineer imports a PO/PM's tracker Intent item into the harness as a slice, offline, with its
grounding re-checked against the current code; the harness keeps that grounding honest while the slice is open.

- **Actor:** engineer (with any coding agent), on their machine; the PO/PM indirectly (they fix rejected or stale items).
- **Outcome:** `asdd intake --from <file|-> --ref <url>` validates the item against
  `cli/skills/external-trackers/references/intent-format.md`, refuses invalid or already-imported items and (unless
  `--accept-stale`) stale grounding, writes `.harness/specs/<slice>/intent.md` with a generated `## Source`, and inits
  the slice in its suggested mode with a `source` block on the `001` session. `asdd check` reports `INTENT-EVIDENCE`
  for unresolvable grounding refs of in-progress slices (`drift.intent_evidence`: `warn` default, `fail`).
- **Out of scope:** reading the tracker (the agent does it through the tracker MCP; the CLI stays offline); writing
  Intent items (slice `grounded-shaping`); progress back to the tracker (existing `tracker-sync` / external-trackers Step 4).
- **Escalation:** E1 only — registration spans `cli/`, `package.json`, and `README.md`; no new domain terms, no dissent.
