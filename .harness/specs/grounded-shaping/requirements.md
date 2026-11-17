# grounded-shaping — Requirements (backfilled from spec.md on escalation)

- **REQ-001.** `shape-up` shall run a grounding step before writing a pitch and record a Reuse / Extend / New table in which every row cites evidence (a `REQ-…`, a slice id, or a repo path).
- **REQ-002.** The pitch appetite shall cite at least one reference slice (DONE, similar scope) with its feature count, or state that none exists.
- **REQ-003.** `product-delivery` shall give each scope a Reuse / Extend / New breakdown and shall merge or cut a scope that duplicates an existing capability.
- **REQ-004.** In PO mode both skills shall write only to the tracker configured in `project.json` (pitch container and Intent items in the canonical format) and shall not write repository files.
- **REQ-005.** `asdd skill-eval` fixtures shall cover the grounding step and the PO-mode output contract for both skills.
