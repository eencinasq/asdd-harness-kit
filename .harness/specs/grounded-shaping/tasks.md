# grounded-shaping — Tasks

Single wave, serial (lite). Each task writes its `skill-eval` fixture first (RED), then the skill change (GREEN).

| Task | Requirements | Scope |
|------|--------------|-------|
| TASK-001 Grounding step in shape-up (table + reference slices) | REQ-001, REQ-002, REQ-005 | `cli/skills/shape-up/SKILL.md`, `cli/skills/product-delivery/references/grounding.md`, `cli/skills/shape-up/references/pitch-template.md`, `cli/eval/skills/shape-up/grounding-before-pitch.json` |
| TASK-002 Per-scope grounding in product-delivery (merge or cut duplicates) | REQ-003, REQ-005 | `cli/skills/product-delivery/SKILL.md`, `cli/eval/skills/product-delivery/scope-grounding.json` |
| TASK-003 PO mode in both skills (tracker output only) | REQ-004, REQ-005 | `cli/skills/shape-up/SKILL.md`, `cli/skills/product-delivery/SKILL.md`, `cli/skills/product-delivery/references/po-mode-tracker-output.md`, `cli/eval/skills/shape-up/po-mode-pitch.json`, `cli/eval/skills/product-delivery/po-mode-intents.json` |
| TASK-004 Ship: copies, versions, full verification | REQ-001…REQ-005 | `.agents/skills/shape-up`, `.agents/skills/product-delivery`, `cli/versions.json`, `.harness/config/versions.json`, `.harness/config/installed-versions.json` |
