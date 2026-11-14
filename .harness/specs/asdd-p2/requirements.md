# asdd-p2 — Requirements

Backfilled from `spec.md` after lite → escalated (E1).

- **REQ-001 (MUST).** `asdd slice init <id> --hotfix` shall create a slice in mode `hotfix` that starts at `implementation` (no Discovery theatre), scaffolds `tasks.md` + a single stub feature (feature + evidence path only), and remains mutually exclusive with `--full`. Default without flags remains `lite`; `--full` remains `full`.
- **REQ-002 (MUST).** Mode `hotfix` shall be accepted by harness validators and treated as serial (at most one `in_progress` feature) with the same escalation-signal rules as `lite` (open signals block DONE until escalate).
- **REQ-003 (MUST).** `asdd slice amend <id> [--note "…"] [--by <owner>]` shall reopen a `DONE` slice: append a checkpoint that resumes `in_progress`, append an amendment note under `.harness/specs/<id>/amendments/`, and ensure `asdd sync` derives status `in_progress` (not `DONE`).
- **REQ-004 (MUST).** Features may declare optional `hill` of `uphill` or `downhill`. `asdd status` shall list in-progress / not-completed features that are still `uphill`. `asdd check` shall WARN when any `uphill` feature remains while the slice phase is `qa` or `knowledge`.
