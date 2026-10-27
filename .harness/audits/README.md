# Audits

Output of the codebase auditor. Design: [`docs/architecture/spec-drift-and-audit.md`](../../docs/architecture/spec-drift-and-audit.md) section 2.

| File | Written by | Content |
|------|-----------|---------|
| `<timestamp>.json` | `node .harness/scripts/audit-codebase.mjs` (computational pass), then the `codebase-audit` skill (inferential pass) | Findings with stable `AUD-` IDs, `first_seen`, `occurrences`, hotspots, audit command results, and `unconfigured` steps |
| `triage.json` | `node .harness/scripts/audit-triage.mjs`, run by the Tech Lead's session | Dismissals and confirmations keyed by finding ID, with a content hash of the files |

- A dismissed finding stays hidden only while its files hash the same. Any change to that code brings it back.
- The `spec-drift-auditor` MCP server reads this folder (`audit_report`, `audit_finding`, `spec://drift/latest-report`) and never writes to it.
- The runner (CI cron or a scheduled agent) must commit or upload this folder so the next session can read it.
- This folder is a harness record: changes here never trigger `DRIFT-01`.
