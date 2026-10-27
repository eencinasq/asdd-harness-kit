---
name: codebase-audit
description: >-
  Inferential pass of the codebase auditor. Reads the latest
  .harness/audits/ report, takes the top churn hotspots, traces each to its
  requirements, and judges every EARS criterion satisfied, violated, or unclear
  with file and line evidence. Use for scheduled health audits, when the Tech
  Lead asks "where has the code drifted from the spec?", or after
  audit-codebase.mjs reports hotspots. Produces findings only; never edits code.
---

# Codebase audit (inferential pass)

The computational pass (`node .harness/scripts/audit-codebase.mjs`) finds drift, unowned code, failing audit commands, Semgrep violations (with the rule's fix), and churn hotspots. This skill adds judgement: does the code in the hottest files still do what its requirements say? Semgrep findings (`SEMGREP`) are already computational; do not restate them as spec verdicts.

Design: [README → Codebase auditor](https://github.com/eencinasq/asdd-harness-kit#codebase-auditor).

## Who runs it

- **Runner:** the Knowledge Agent, a scheduled agent, or the Tech Lead's session.
- **Consumer:** the Tech Lead. Engineers act on findings only after the TL confirms them and turns them into a slice or a task.

## Inputs

1. The latest report in `.harness/audits/` (newest `<timestamp>.json`, not `triage.json`). If there is none, run `node .harness/scripts/audit-codebase.mjs` first.
2. `.harness/audits/triage.json`: skip findings the TL dismissed.
3. The knowledge index: `knowledge_trace` (MCP `knowledge`) or `audit_finding` (MCP `spec-drift-auditor`) for the requirement links of each file.

## Steps

1. Take the top **N** entries of `hotspots` (default 10; the TL may set another N).
2. For each hotspot file, trace it to requirements: `knowledge_trace` on `file:<path>`, or the features whose `scope_paths` cover it and their `req_ids`.
3. Read those requirements (`requirements.md`, or `spec.md` for lite slices) and the code.
4. Judge each requirement against the code:
   - `satisfied`: the code does what the requirement says, with the file and line that show it.
   - `violated`: the code contradicts the requirement, with the file and line, and what differs.
   - `unclear`: you cannot tell from the code. Never report `unclear` as `satisfied`.
5. A hotspot with no requirement links is itself a finding: high-churn code with no spec.
6. Append the judgements to the same report file under `findings`, one entry per `violated` or `unclear` verdict:

```json
{
  "id": "AUD-<8 hex>",
  "source": "inferential",
  "check": "SPEC-VERDICT",
  "verdict": "violated",
  "severity": "advisory",
  "slice_id": "wallet-deposits",
  "node": "req:wallet-deposits:REQ-004",
  "paths": ["src/wallet/deposits.ts"],
  "line": 88,
  "message": "Deposit above the limit is accepted; REQ-004 requires rejection"
}
```

   The ID is `AUD-` plus the first 8 hex characters of the sha256 of `SPEC-VERDICT|<slice_id>|<node>|<paths joined by |>`, so it stays stable across runs.
7. Call `audit_report` (MCP `spec-drift-auditor`) to present the report. Hosts with MCP Apps show it in the dashboard, with the inferential verdicts next to the computational findings.

## Rules

- **Findings only.** Never edit product code, specs, or features from this skill.
- **Advisory.** Inferential findings never fail a gate on their own (`QG-DRIFT-05`). They become blocking only after the TL confirms them: `node .harness/scripts/audit-triage.mjs <id> --confirm`.
- **Follow-up, not fix.** A confirmed `violated` finding becomes a new lite slice (`init-slice.mjs`) or a task in the owning slice.
- **Recurring.** A finding listed in `recurring` (three or more occurrences) triggers `QG-DEB-06`: name the guide or sensor in `controls.md` that must change.
- **Cite, don't paraphrase.** Every verdict names the requirement ID and the file and line.
