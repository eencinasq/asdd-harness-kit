# tracker-binding — Capability (backfilled on escalation from lite)

**Capability:** A project declares the tracker that holds the PO/PM's pitches and Intent items, and the kit defines
one Intent item format that both sides (PO shaping, engineer intake) share.

- **Actors:** PO/PM (writes pitches and Intent items), engineer (imports Intent items), Tech Lead (configures the project).
- **Outcome:** `asdd check-config` rejects a malformed `tracker` block; `intent-format.md` fixes the intent block keys,
  the required headings, the grounding table and its evidence-ref grammar, and the per-tracker mapping and read-back.
- **Out of scope:** writing to or reading from a tracker (P6.3 `grounded-shaping`, P6.4 `intent-intake`).
- **Escalation:** E1 only — the `package.json` test-script entry; no new domain terms, no dissent.
