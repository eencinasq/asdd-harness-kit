# Domain Model — asdd-harness-kit

> Project binding for the kit itself. Never shipped: projects get the stub from `scripts/templates/docs/domain-model.md`.
> Ubiquitous Language of the harness. Seeded by the `kit-hygiene` slice (Domain phase); Module and Gate decision added by `jev-module`.

## Core Entities

| Entity | Definition | Key attributes | Relationships |
|---|---|---|---|
| **Slice** | A unit of work through the ASDD pipeline | `slice_id`, `mode` (lite/full/escalated), `phase`, `status` (in_progress/DONE/PARKED/ABANDONED) | has many Sessions; has one Feature tracker; has Spec documents |
| **Session** | An append-only event file; the only writer of slice state | `event_type`, `timestamp`, `phase`, `feature_id`, `scope_paths`, `status` (checkpoint only), `evidence`, `concerns` | belongs to a Slice |
| **Feature** | An executable projection of a task, tracked in `<slice>.features.json` | `id`, `status`, `owner`, `scope_paths`, `req_ids`, `verification`, `evidence`, `evidence_commit` | belongs to a Slice; traces to Requirements |
| **Requirement** | An EARS statement with a stable `REQ-*` ID and a priority | `id`, `priority` (MUST/SHOULD/COULD), `status` | belongs to a Slice; covered by Features and tests |
| **Gate rule** | A `QG-*` acceptance criterion in `quality-gates.md`; the only home of a numeric cutoff | `id`, gate, outcome (PASS/WARN/BLOCK) | evaluated per phase of a Slice |
| **Guidance document** | A file an agent reads: `AGENTS.md`, a steering file, an agent prompt, a skill, a runtime rule | path, `inclusion` (always/auto), tags | shipped to an Installed project unless kit-only |
| **Binding** | A project-specific steering file (`product`, `structure`, `tech`, `domain-layer.project`, `quality-gates.project`, `design-system`) | slots (`…` = unfilled) | one set per project; the kit has its own set |
| **Command gate** | The pattern allow/deny hook for shell commands | verdict (allow/deny), pattern label | called by Hook configs |
| **Hook config** | A runtime file naming hook scripts (`.cursor/hooks.json`, `.claude/settings.json`) | entries per event | project-owned; merged by the Installer |
| **Installer** | `scripts/install-into.sh` / `npx asdd-harness-kit` | policy per file: `refresh` (kit-owned) or `create` (project-owned seed) | writes an Installed project |
| **Installed project** | A repository the installer wrote into | `installed-versions.json` (managed and seeded files) | receives shipped Guidance documents, never kit-only artifacts |
| **Module** | An opt-in set of kit files the Installer copies only when enabled (`--modules=<id>`), recorded in `project.json` → `modules` (`true` on, `false` explicitly off) | id, files, config it adds | enabled per Installed project; `--remove-modules` deletes its files |
| **Gate decision** | The outcome of a Shape Up betting gate or a Product Delivery EARS/scope gate | decided by Jev (module) or by a human (`decided_by`) | belongs to a pitch or an intent |
| **Pattern / Proposal** | Learning loop: a repeated signal (`LP-*`) and the change that answers it (`SP-*`) | signature, occurrences, status; control, change, success | see README → Self-improving harness |

## Value Objects

- **Phase**: `discovery → spec → validation → domain → design → task_planning → implementation → qa → knowledge` (+ optional `refactor`).
- **Gate state**: PASS, WARN, BLOCK.
- **Scope path**: a repo-relative path or glob owned by a Feature.
- **Always-loaded steering**: the `inclusion: always` steering files plus `AGENTS.md`, measured in bytes against a budget.

## Domain Events

`phase_started`, `phase_completed`, `phase_blocked`, `feature_started`, `feature_completed`, `feature_blocked`, `dissent`, `override`, `checkpoint` (a checkpoint may carry `mode` or `status`).

## Bounded Contexts

- **Process (shipped)**: Guidance documents, Gate rules, Slice state machine, Feature tracker, sensors.
- **Distribution (kit-only)**: Installer, versions, npm package, kit tests, the kit's own Bindings and slices.

The boundary rule: anything in Distribution that describes the kit itself never crosses into an Installed project.
