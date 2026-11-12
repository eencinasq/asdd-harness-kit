---
name: codebase-audit
description: >-
  Judges the code in the audit's churn hotspots against its requirements with file and line evidence. Use when running a
  scheduled audit or after `asdd audit` reports hotspots. Do NOT use for judging requirement text — use
  anti-pattern-detection; or for exploring code — use codegraph.
metadata:
  tier: leaf
---

# Codebase audit (inferential pass)

The computational pass (`asdd audit`) finds drift, unowned code, failing audit commands, Semgrep violations (with the
rule's fix), and churn hotspots. This skill adds judgment: does the code in the hottest files still do what its
requirements say? Semgrep findings (`SEMGREP`) are already computational; do not restate them as spec verdicts. Design:
[README → Codebase auditor](https://github.com/eencinasq/asdd-harness-kit#codebase-auditor). Runner: the Knowledge
agent, a scheduled agent, or the Tech Lead's session; consumer: the Tech Lead — engineers act only after the TL confirms
a finding and turns it into a slice or a task.

**Operational boundary:** reads code, requirements, features, and the knowledge index; writes only the `findings` of
the latest `.harness/audits/<timestamp>.json`. Findings only: never edits product code, specs, or features.

## Preconditions

- A report exists in `.harness/audits/` (newest `<timestamp>.json`, not `triage.json`); if not, run `asdd audit` first.
- `asdd knowledge status` exits 0 (for `asdd knowledge trace`).

## Input / Output Contract

- **Inputs:** `report` (`path`, `.harness/audits/<timestamp>.json`, required); `triage` (`path`,
  `.harness/audits/triage.json`, optional — findings the TL dismissed are skipped); `top_n` (`integer`, default 10).
- **Outputs:** `findings` (`json`, entries appended to `report.findings`, schema in Step 4); `summary` (`markdown`, the
  report path, counts, and each `violated` / `unclear` verdict, in the final message).

## Execution Protocol

### Step 1: Pick the hotspots

- **Action:** take the top `top_n` entries of `hotspots`, minus those dismissed in `triage`.
- **Target:** `report`.
- **Assertion:** the list has at most `top_n` files, each present on disk.

### Step 2: Trace to requirements

- **Action:** for each hotspot, `asdd knowledge trace file:<path>`, or the features whose `scope_paths` cover it and
  their `req_ids`; read those requirements (`requirements.md`, or `spec.md` for lite slices). A hotspot with no
  requirement link is itself a finding: high-churn code with no spec.
- **Target:** the knowledge index and `.harness/specs/`.
- **Assertion:** each hotspot has its REQ IDs or a no-spec finding.

### Step 3: Judge

- **Action:** judge each requirement against the code: `satisfied` (the file and line that show it), `violated` (the
  file and line, and what differs), or `unclear` (you cannot tell — never report it as `satisfied`). Before keeping
  `satisfied` or `violated`, state the strongest counter-case (a caller, a guard, a config, a later step) and check it;
  if you cannot rule it out, the verdict is `unclear`.
- **Target:** the hotspot files.
- **Assertion:** every verdict names the requirement ID, the file and line, and the counter-case checked.

### Step 4: Record

- **Action:** append one entry per `violated` or `unclear` verdict to `findings`:

  ```json
  { "id": "AUD-<8 hex>", "source": "inferential", "check": "SPEC-VERDICT", "verdict": "violated",
    "severity": "advisory", "slice_id": "wallet-deposits", "node": "req:wallet-deposits:REQ-004",
    "paths": ["src/wallet/deposits.ts"], "line": 88,
    "message": "Deposit above the limit is accepted; REQ-004 requires rejection (checked: the API guard)" }
  ```

  The ID is `AUD-` plus the first 8 hex characters of the sha256 of `SPEC-VERDICT|<slice_id>|<node>|<paths joined by |>`,
  so it stays stable across runs. Then present the summary to the TL (`asdd triage --list` shows what is triaged).
- **Target:** `report`.
- **Assertion:** the report still parses as JSON and each new entry has the ten fields.

Inferential findings are advisory and never fail a gate on their own (`QG-DRIFT-05`); they block only after the TL
confirms them (`asdd triage <id> --confirm`). A confirmed `violated` finding becomes a new lite slice (`asdd slice init`)
or a task in the owning slice. A finding listed in `recurring` triggers `QG-DEB-06`: name the guide or sensor in
`controls.md` that must change.

## Verification Gate

1. `node -e "JSON.parse(require('fs').readFileSync('<report>','utf8'))"` exits 0.
2. Every new finding matches `/^AUD-[0-9a-f]{8}$/` and has `"source": "inferential"`.
3. `asdd check` exits 0.
4. Negative check: `git status --porcelain` shows no change this run made outside `.harness/audits/`.

## Escalation Gate

HALT when the report is missing and `asdd audit` fails, when a hotspot's requirements contradict each other, or when a
`violated` verdict touches security or data loss (tell the TL now instead of waiting for triage). Escalate as Context →
Options → Recommendation → Decision Needed.

## Handoff & Convergence

- **redirect → `codegraph`:** when a hotspot's callers or guards are needed to check a counter-case.
- The Tech Lead triages; confirmed findings become slices or tasks.
