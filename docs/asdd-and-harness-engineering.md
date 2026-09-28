# ASDD and Harness Engineering

**ASDD** answers *which pipeline phase* and *which spec artifact*.  
**Harness** answers *which code feature* is under test *now* and with what evidence.

| Question | System | Artifact |
|----------|--------|----------|
| ASDD phase? | ASDD | `.harness/state/slices/<id>/manifest.json` |
| Which slices? | Harness index | `.harness/PROGRESS.md` + global `manifest.json` |
| Which TASK now? | Harness | `.harness/features/<id>.features.json` |
| Who may write? | Locks | `.harness/state/locks/<id>.lock` |

Pipeline: Discovery → Spec → Validation → Domain → Design → Task Planning → Implementation → QA → Knowledge  
(+ optional Bruno / Playwright modules).

**ASDD-Lite:** Spec → Design → Tasks → Implementation → QA-Lite — see `.harness/steering/asdd-lite.md`.

Operational contract: root [`AGENTS.md`](../AGENTS.md).
