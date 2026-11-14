# asdd-p2 — Spec (lite)

## Intent

Deliver ASDD-ROADMAP **P2.1–P2.3**: explicit size presets (`hotfix` / `lite` / `full`), post-DONE slice amend without a new pitch, and a hill-chart sensor (`uphill` / `downhill`) visible in `asdd status`. Does not include P3/P4.

## Requirements

- **REQ-001 (MUST).** `asdd slice init <id> --hotfix` shall create a slice in mode `hotfix` that starts at `implementation` (no Discovery theatre), scaffolds `tasks.md` + a single stub feature (feature + evidence path only), and remains mutually exclusive with `--full`. Default without flags remains `lite`; `--full` remains `full`.
- **REQ-002 (MUST).** Mode `hotfix` shall be accepted by harness validators and treated as serial (at most one `in_progress` feature) with the same escalation-signal rules as `lite` (open signals block DONE until escalate).
- **REQ-003 (MUST).** `asdd slice amend <id> [--note "…"] [--by <owner>]` shall reopen a `DONE` slice: append a checkpoint that resumes `in_progress`, append an amendment note under `.harness/specs/<id>/amendments/`, and ensure `asdd sync` derives status `in_progress` (not `DONE`).
- **REQ-004 (MUST).** Features may declare optional `hill` of `uphill` or `downhill`. `asdd status` shall list in-progress / not-completed features that are still `uphill`. `asdd check` shall WARN when any `uphill` feature remains while the slice phase is `qa` or `knowledge`.
