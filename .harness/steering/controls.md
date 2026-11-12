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
| Verify-on-Stop invariants | Sensor | Computational, left (agent stop) | Harness state | `asdd check` |
| Spec drift (`DRIFT-01`…`07`) | Sensor | Computational, left (in invariants) and in CI; on demand via `asdd drift` | Behaviour scope, spec traceability | [spec-drift.md](./spec-drift.md), `asdd drift` |
| Codebase audit | Sensor | Computational (`asdd audit`) plus inferential (`codebase-audit` skill), scheduled | Drift and health outside the change lifecycle | [spec-drift.md](./spec-drift.md), `.harness/audits/` |
| Shape Up / Product Delivery gates | Sensor | Inferential (human decision, `decided_by`) | Betting, scope choice, EARS quality | `shape-up` and `product-delivery` skills when the module is installed |
| Command pattern gate | Sensor | Pattern allow/deny before dangerous bash | Safety | `asdd gate` |
| CI invariants | Sensor | Computational, after integration; repeats the left check | Harness state | `.github/workflows/harness-invariants.yml` |
| Full suite (SP-002) | Sensor | Computational, before a new spec enters Task Planning | Behaviour | [quality-gates.project.md](./quality-gates.project.md) |
| Learning loop (`QG-LEARN-*`) | Sensor on the controls themselves | Computational (`asdd learn`, `validators/learning.mjs`), every sync and stop; proposals inferential, decided by the Tech Lead | The guides and sensors in this table | [quality-gates.md](./quality-gates.md#learning-gate), `docs/knowledge-base/steering-proposals/` |
| Human review | Sensor | Inferential, after the agent loop | Intent the sensors cannot see | Tech Lead, dissent log |

Fast sensors run before the session ends. The pipeline repeats the invariants check. The full suite stays at the Task Planning gate because it is the more expensive behaviour sensor.

ASDD-Lite skips the confidence scores and the numeric phase gates (`QG-DEC-07`, [asdd-lite.md](./asdd-lite.md)). It still uses feature evidence, invariants, and session close.

## Precedence

1. **Edits.** [session-loop.md](./session-loop.md) gold-plating decides which files may change.
2. **Numbers.** [quality-gates.md](./quality-gates.md) is the only cutoff. An agent prompt shall not invent a second confidence or coverage threshold, and shall not combine confidence scores across phases (`QG-DEC-10`).
3. **Skills.** [skills.md](./skills.md) decides when a skill body is read.
4. **Done.** A feature is `passing` only after its `verification` evidence is recorded and the left sensors for this session exit 0. A green narrative is not evidence.
5. **Repeat.** When a failure, override, or dismissal reaches the occurrence threshold, `asdd learn` opens a pattern; change the guide or sensor that missed it (escape) or that fires without cause (noise) through a steering proposal ([Learning Gate](./quality-gates.md#learning-gate)). Do not only patch the product code.

## Prohibitions

Never skip, waive, or widen a sensor to pass a gate; dismiss findings only through `asdd triage` with a reason.
When the precedence above does not settle a conflict: HALT and escalate to the Tech Lead.

## Session close

Leave a clean state before handoff:

1. `asdd check` exits 0.
2. No feature is `passing` without `evidence`.
3. The diff contains only files mapped to the active spec, plus the harness records [session-loop.md](./session-loop.md) allows.
4. `asdd sync` has run after the last session, so the manifest, registry, and `PROGRESS.md` are current.
