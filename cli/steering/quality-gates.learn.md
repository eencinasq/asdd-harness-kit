---
inclusion: auto
tags:
  - knowledge
classification: portable
---

# Quality Gates — learning gate

The self-improvement gate, applied at the Knowledge phase. Shared machinery lives in [quality-gates.md](quality-gates.md).

## Learning Gate

Computational sensor: `asdd learn` (also run by `asdd sync`; the gate runs inside `asdd check`, so Verify-on-Stop and CI apply it). It groups repeated signals into patterns (`LP-*`) in `.harness/state/learning/patterns.json` and links them to steering proposals (`SP-*`) in `docs/knowledge-base/steering-proposals/`. Details: [README → Self-improving harness](https://github.com/eencinasq/asdd-harness-kit#self-improving-harness).

### Acceptance criteria

- **QG-LEARN-01.** The harness shall record a signal for every failing `asdd check --live` or `--record` run (Verify-on-Stop, an agent on a runtime without hooks, or CI), every command the command gate denies (by pattern label, never the command text), every signed failure-log entry, every `phase_blocked`, `feature_blocked`, and `dissent` session, every gate `override` session, every Tech Lead dismissal in `.harness/audits/triage.json`, every recurring audit finding, every lite escalation signal, and every draft comment a human removed from a published spec-drift PR review (per checklist rule, `review:<rule>`; `asdd learn` records this project's reviews from the reviewer's local publish log, counts only, into the author's weekly summary). Repeated failing runs with the same signature within 30 minutes shall count as one occurrence. Raw run files stay local; `asdd learn` folds them into one committed summary per author and ISO week (`.harness/state/learning/summaries/<week>-<author>.json`), which only that author writes.
- **QG-LEARN-02.** When a signature reaches 3 occurrences, the harness shall mark its pattern `open`. A pattern whose signals all come from overrides or dismissals is `noise` (a sensor fires without catching a defect); any other pattern is an `escape` (a guide or sensor let the failure through).
- **QG-LEARN-03.** While a pattern is `open`, the invariants shall WARN, and the Knowledge agent shall add a steering proposal from `.harness/steering/templates/steering-proposal.md` that names the pattern, the control to change, the change type, a measurable success criterion, and a rollback. A malformed proposal shall FAIL the invariants.
- **QG-LEARN-04.** If a slice completes the Knowledge phase while a pattern it contributed to is `open`, then the invariants shall FAIL. A `rejected` proposal records a decision not to change the control and closes the pattern.
- **QG-LEARN-05.** Only the Tech Lead shall set a proposal to `accepted`, `rejected`, or `applied`, and shall fill `decided_by`; `applied` needs `applied_commit`, a commit that changes the `control` file (FAIL otherwise). Agents shall not merge steering changes. When the signature recurs after the change (`applied_at`, else the date of `applied_commit`), the proposal shall become `ineffective` and the pattern shall reopen.
- **QG-LEARN-06.** When 10 sessions have been recorded after the change with no recurrence — for a pattern with an area (`sensor:<code>:<area>`), only sessions whose `scope_paths` touch that area — the proposal shall become `verified`.
- **QG-LEARN-07.** For a `noise` pattern, the proposal shall loosen, tune, or remove the sensor. The agent shall not raise a threshold in an agent prompt instead (`controls.md` precedence 2).
- **QG-LEARN-08.** A recorded run shall also record its WARN lines, except learning and lite-escalation WARNs, which are signals of their own. When the same WARN signature appears on 5 distinct days, its pattern shall open as `noise`: a WARN that fires every day without action shall be fixed, made a FAIL, or removed.
- **QG-LEARN-09.** `asdd learn --export` shall include only verified or ineffective proposals on kit-owned controls, and only generic fields (signature, kind, counts, control, change, success, result). Nothing shall be sent upstream automatically.

## Negative space

- No phase or execution gate criteria — this file is the controls-on-controls gate only.
- No proposal template body — `.harness/steering/templates/steering-proposal.md` owns the shape; `QG-LEARN-03` names its required fields.
- No auto-merge — `QG-LEARN-05`: agents never apply steering changes; the Tech Lead decides.

## Enforcement

`asdd learn` + `validators/learning.mjs` record signals and fold runs into weekly summaries on every sync and stop; `asdd check` WARNs on open patterns and FAILs on malformed proposals or Knowledge-phase completion with an open contributed pattern.

## Escalation

An open pattern blocks Knowledge-phase completion (`QG-LEARN-04`) until the Tech Lead decides `accepted`/`rejected`/`applied`; `applied` without a `control`-file commit FAILs. `ineffective` proposals reopen the pattern — the loop does not close on intent, only on verified non-recurrence (`QG-LEARN-06`).
