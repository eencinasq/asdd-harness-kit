---
inclusion: always
---

# Controls

Index of guides and sensors. This file does not restate their rules. On a conflict, use [Precedence](#precedence).

The repository under `.harness/` is the system of record. `AGENTS.md` stays a map. Skill bodies stay out of the initial index ([skills.md](./skills.md)). A feature is a harness primitive ([session-loop.md](./session-loop.md)). A session is not done when the story sounds finished.

Practice behind this layout: [Harness engineering for coding agent users](https://martinfowler.com/articles/harness-engineering.html) (guides, sensors, quality left, one coherent control system) and [Learn Harness Engineering](https://walkinglabs.github.io/learn-harness-engineering/en/) (system of record, feature lists, initialization, no early victory, clean session end).

## Guides and sensors

| Control | Direction | Execution | Regulates | Contract |
|---------|-----------|-----------|-----------|----------|
| INIT, steering, `AGENTS.md` | Guide | Inferential, before edits | All | `AGENTS.md` |
| Skills catalog | Guide | Inferential; body only when the task starts | Maintainability | [skills.md](./skills.md) |
| Gold-plating / mapped files | Guide | Inferential, before edits | Behaviour scope | [session-loop.md](./session-loop.md) |
| EARS quality gates | Guide for the decision; sensor when scored | Inferential thresholds, computational evidence | Behaviour, architecture | [quality-gates.md](./quality-gates.md) |
| Domain placement | Guide, plus the project boundary command | Computational when the binding supplies a command | Architecture fitness | [domain-layer.md](./domain-layer.md), [quality-gates.project.md](./quality-gates.project.md) |
| Feature `verification` + `evidence` | Sensor | Computational | Behaviour | [session-loop.md](./session-loop.md) |
| Verify-on-Stop invariants | Sensor | Computational, left (agent stop) | Harness state | `node .harness/scripts/check-invariants.mjs` |
| Spec drift (`DRIFT-01`…`07`) | Sensor | Computational, left (in invariants) and in CI; on demand via `spec-drift-auditor` MCP | Behaviour scope, spec traceability | [spec-drift.md](./spec-drift.md), `check-spec-drift.mjs` |
| Codebase audit | Sensor | Computational (`audit-codebase.mjs`) plus inferential (`codebase-audit` skill), scheduled | Drift and health outside the change lifecycle | [spec-drift.md](./spec-drift.md), `.harness/audits/` |
| Jev (shape-up / product-delivery only) | Sensor | Computational (System One) | Betting + EARS/slice quality | [jev.md](./jev.md), `jev-gates.mjs` |
| Command pattern gate | Sensor | Pattern allow/deny before dangerous bash (no Jev) | Safety | `jev-command-gate.mjs` |
| CI invariants | Sensor | Computational, after integration; repeats the left check | Harness state | `.github/workflows/harness-invariants.yml` |
| Full suite (SP-002) | Sensor | Computational, before a new spec enters Task Planning | Behaviour | [quality-gates.project.md](./quality-gates.project.md) |
| Human review | Sensor | Inferential, after the agent loop | Intent the sensors cannot see | Tech Lead, dissent log |

Fast sensors run before the session ends. The pipeline repeats the invariants check. The full suite stays at the Task Planning gate because it is the more expensive behaviour sensor.

ASDD-Lite skips the confidence scores and the numeric phase gates (`QG-DEC-07`, [asdd-lite.md](./asdd-lite.md)). It still uses feature evidence, invariants, and session close. Jev is not used in ASDD-Lite (skill-scoped to shape-up / product-delivery only).

## Precedence

1. **Edits.** [session-loop.md](./session-loop.md) gold-plating decides which files may change.
2. **Numbers.** [quality-gates.md](./quality-gates.md) is the only cutoff. An agent prompt shall not invent a second confidence or coverage threshold, and shall not combine confidence scores across phases (`QG-DEC-10`).
3. **Skills.** [skills.md](./skills.md) decides when a skill body is read.
4. **Done.** A feature is `passing` only after its `verification` evidence is recorded and the left sensors for this session exit 0. A green narrative is not evidence.
5. **Repeat.** When the same failure has three log entries, change the guide or sensor that missed it ([QG-DEB-06](./quality-gates.md)). Do not only patch the product code.

## Session close

Leave a clean state before handoff:

1. `node .harness/scripts/check-invariants.mjs` exits 0.
2. No feature is `passing` without `evidence`.
3. The diff contains only files mapped to the active spec, plus the harness records [session-loop.md](./session-loop.md) allows.
4. The `PROGRESS.md` row matches the per-slice manifest.
