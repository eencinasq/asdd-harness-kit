# Spec drift, codebase audit, and MCP App — design

> Status: **implemented** in kit 3.4.0, except rollout step 6 (runner, still open) and step 8 (`DRIFT-06` to FAIL, next release).
> Decisions taken during implementation:
> - Severities are `fail`, `warn`, and `advisory`.
> - Unowned-code findings exclude test files.
> - `verify_architecture_rules` loads `domain-layer.md`, `domain-layer.project.md`, `product.md`, `structure.md`, and `tech.md` (paths from `project.json` bindings; kit stubs are unfilled), selects or generates Semgrep YAML, runs `semgrep scan --json`, and also runs the Gate command when it is bound.
> - Module adapters receive `readBinding`.
> - CI and CODEOWNERS examples install to `.harness/examples/`.
> - In installed projects, files the installer refreshes (`managed_files` in `.harness/config/installed-versions.json`) are exempt from `DRIFT-01` and the unowned-code audit, so a kit upgrade is not slice drift.
> - A glob in `scope_paths` satisfies `DRIFT-05` when at least one file matches it.
> Usage by role: [`spec-drift.md`](../../.harness/steering/spec-drift.md).
> Control model: [`controls.md`](../../.harness/steering/controls.md) · Gates: [`quality-gates.md`](../../.harness/steering/quality-gates.md) · Knowledge index: [`knowledge.md`](../../.harness/steering/knowledge.md)

## Problem

The harness has strong **guides** for scope and traceability, but weak **sensors**:

- The gold-plating rule in [`session-loop.md`](../../.harness/steering/session-loop.md) (edit only mapped files) is an instruction. Nothing checks the diff against the map.
- A feature marked `passing` stays `passing` after its files change. Its evidence goes stale silently.
- REQ → feature → test coverage is claimed in `tasks.md` and by QA, but no computational check recomputes it.
- Nobody looks at the whole codebase between slices. Drift accumulates in code that no active slice owns.
- Layer rules live in `domain-layer.project.md`, but the IDE/LLM has no single place to ask "does this diff break the architecture or the spec?" and see the answer.

The knowledge index already holds the graph needed to detect most of this. `sync-knowledge.mjs` emits `IMPLEMENTS_REQ` (feature → REQ), `DEPENDS_ON` (feature → feature), and `OWNS` (feature → file, from `scope_paths`).

## Overview

Three pieces, each a sensor in the guides/sensors model:

| Piece | Kind | Runs | Cost | Output |
|---|---|---|---|---|
| Spec drift check | Computational | Verify-on-Stop, CI | Seconds | FAIL/WARN lines in `check-invariants` |
| Codebase auditor | Computational, then inferential | Scheduled (runner TBD) | Minutes, LLM tokens | `.harness/audits/<timestamp>.json` + findings |
| MCP server `spec-drift-auditor` + MCP App | Read-only projection of the two above | On demand from chat | Cheap | JSON text, resources, prompts, optional interactive UI |

Build order: spec drift check, then the MCP server, then the auditor, then the MCP App UI. Each later piece reuses the earlier one's output.

## Team roles (2 engineers + 1 TL)

The work splits by role. The engineers build through the ASDD pipeline, and the TL reviews through the auditor. Both use the same sensors, so what the TL sees in review is what the engineer's stop hook already checked, plus the judgement only a human or a model can make.

| | Engineers (2) | Tech Lead (1) |
|---|---|---|
| Main loop | ASDD pipeline per slice (Discovery through QA), lite by default | Pull request review, plus a weekly codebase health check |
| Uses | The full harness: steering, skills, feature tracker, Verify-on-Stop (which includes `DRIFT-01`…`06`) | `spec-drift-auditor`: the `pr-review` prompt, `audit_diff` in review mode, `verify_spec_compliance`, the dashboard, `audit_report` |
| Owns | Their slices' specs, features, `scope_paths`, and evidence | Project bindings (`domain-layer.project.md`, `quality-gates.project.md`), ADR exceptions, Design gate sign-off on full slices, lite-to-full escalation calls, triage of inferential findings |
| Writes | Product code inside mapped files; harness records of their own slices | Review comments, `.harness/audits/triage.json`, binding files. No product code during review |

### Review flow

1. **Engineer finishes the slice.** Verify-on-Stop passes, then they open a PR linked to the slice. The link is a branch named `slice/<slice-id>/…` or a `Slice: <slice-id>` line in the PR body; `DRIFT-07` enforces it.
2. **CI runs `check-invariants.mjs`.** A red PR goes back to the engineer, and the TL does not review it. This keeps quality left: machines catch mechanical drift, and the TL's time goes to what machines cannot judge.
3. **TL runs the `pr-review` prompt.** It runs `audit_diff` on base..PR branch in `review` mode, `verify_spec_compliance` on the linked slices, and the inferential `architecture-review` on the changed files. The dashboard shows the result.
4. **TL triages each 🔵 finding.**
   - **Confirm:** draft a review comment, which becomes a task in the engineer's slice.
   - **Dismiss with a reason:** recorded in `triage.json`, and the finding is suppressed while the code it points to is unchanged.
5. **TL posts the review** with the host's GitHub tooling (for example `gh`), explicitly. The MCP server has no GitHub token and never posts.
6. **Engineer fixes it** in their own session through the normal loop: mapped files, feature, Verify-on-Stop.

### Parallel work

The two engineers work in separate slices (preferred) or in one slice with disjoint `scope_paths`, following [`session-loop.md`](../../.harness/steering/session-loop.md). `DRIFT-01` catches edits outside the owner's scope before the PR exists, so the TL does not have to.

### TL owns the steering loop

- **Weekly health check:** the TL reads `audit_report`. A finding with three or more occurrences triggers `QG-DEB-06`, and the TL changes the guide or sensor that let it through: steering, a binding, or the gate command.
- **Repeated dismissals:** if the same check is dismissed repeatedly, that sensor is producing false positives. The TL tunes or removes it instead of dismissing it again.
- **Protect the rules with CODEOWNERS:** make the TL the code owner of `.harness/steering/quality-gates*.md`, `.harness/steering/domain-layer.project.md`, `.harness/steering/controls.md`, and `.cursor/hooks.json`. An engineer's agent then cannot loosen a gate or a hook without TL review. This is a computational guard enforced by GitHub, not an instruction.

## Contract changes (accepted)

The drift check needs two fields to be mandatory. Without them there are no `OWNS` edges to compare and no point in time to compare evidence against.

1. **`scope_paths` is required on every feature**, not only on concurrent work. Today [`session-loop.md`](../../.harness/steering/session-loop.md) requires it only for parallel tasks. Task Planning fills it from `tasks.md`; Lite fills it from `spec.md`.
2. **`evidence_commit`** is recorded when a feature becomes `passing`. It is the `HEAD` SHA at the time the verification ran. `evidence` stays a free-text string.

```json
{
  "id": "F-02",
  "status": "passing",
  "req_ids": ["REQ-001"],
  "scope_paths": ["src/wallet/deposits.ts"],
  "verification": ["npm test -- deposits"],
  "evidence": "Tests passed: 12/12",
  "evidence_commit": "9897025"
}
```

Files to update when implementing: `session-loop.md` (feature fields and rules), `validators/features.mjs` (required-field checks), `knowledge-lib.mjs` (carry `evidence_commit` on the feature node), and the task-planning and implementation agents.

Migration: existing features without these fields produce WARN for one release, then FAIL. This matches how `QG-DEC` rules are introduced elsewhere.

## 1. Spec drift check (computational)

New script `.harness/scripts/check-spec-drift.mjs`, called from `check-invariants.mjs` the same way the skills-index check is (spawn, then turn its FAIL lines into `fail()` errors). Because `check-invariants` already runs in the Cursor stop hook and in CI, failures reach the agent's prompt with no new wiring.

### Inputs

- Feature trackers under `.harness/features/` (the source of truth, not the knowledge index, so the check works even when the index is stale).
- Spec files: `intent.md`, `design.md`, `tasks.md`, or `spec.md` for Lite.
- `git diff --name-only <base>...HEAD` plus the working tree. `<base>` is the merge base with the default branch; locally it falls back to the working-tree diff.
- Test files, located by the project's test globs (new binding in `quality-gates.project.md`, see below).

### Checks

| ID | When | Detects | Result |
|---|---|---|---|
| `DRIFT-01` | A slice is `in_progress` | A changed file not covered by the slice's mapped files | FAIL |
| `DRIFT-02` | Always | A `passing` feature whose `scope_paths` changed after `evidence_commit` | FAIL; feature must go back to `in_progress` |
| `DRIFT-03` | Phase is `qa` or later | A MUST requirement with no feature listing it in `req_ids` | FAIL |
| `DRIFT-04` | Phase is `qa` or later | A requirement ID that no test file mentions | WARN (FAIL when `QG-SPEC-01` makes test traceability mandatory) |
| `DRIFT-05` | Always | A `scope_paths` entry that does not exist in the repo | FAIL |
| `DRIFT-06` | Always | A feature with no `scope_paths` or a `passing` feature with no `evidence_commit` | WARN during migration, then FAIL |
| `DRIFT-07` | CI on a pull request | Product files changed but the PR names no existing slice (branch `slice/<slice-id>/…` or `Slice: <slice-id>` in the body) | FAIL |

"Mapped files" for `DRIFT-01` uses the exact definition in `session-loop.md`: paths named by `intent.md`, `design.md`, `tasks.md` (or `spec.md`), plus `scope_paths` of the in-progress features, plus test files (per `Test file globs`) that name a REQ of the slice. Harness records (`.harness/state/`, `.harness/features/`, session files, generated `.harness/knowledge/`) are always exempt.

`DRIFT-02` uses `git log --format=%H <evidence_commit>..HEAD -- <scope_paths>`; any commit, or any uncommitted change under those paths, counts as drift.

`DRIFT-04` matches requirement IDs as literal tokens (for example `REQ-001`) in test names or comments. This makes "tag tests with the REQ they verify" a convention that the sensor enforces.

### Gate wiring

Add to `quality-gates.md` under a new `QG-DRIFT` group, written in EARS like the rest:

- `QG-DRIFT-01`: *If a changed product file is not mapped to the active slice, then the agent shall not mark any feature `passing` and shall either revert the change or add the path to the spec through the owning phase.*
- `QG-DRIFT-02`: *When a `passing` feature's owned files change after its `evidence_commit`, the agent shall set it back to `in_progress` and rerun its verification.*
- `QG-DRIFT-03`: *The QA gate shall block while any MUST requirement has no implementing feature.*

Add to `quality-gates.project.md`:

- `Test file globs:` (for `DRIFT-04`), with an inactive placeholder like the other bindings.
- `Drift base branch:` (defaults to the repo's default branch).

### What it does not do

It does not judge whether code *satisfies* an EARS criterion. That is semantic drift, it needs a model, and it is too slow and nondeterministic for the stop hook. It belongs to the auditor.

## 2. Codebase auditor

Fowler calls these *continuous drift and health sensors*: they run outside the change lifecycle and look at code no one is currently touching.

### Pass 1 — computational

New script `.harness/scripts/audit-codebase.mjs`:

1. Runs `check-spec-drift.mjs` across **all** slices, not only the active one.
2. Lists **unowned code**: product files no feature in any slice owns. This is the backlog of code with no spec.
3. Runs the project's own audit commands, declared in `quality-gates.project.md` (`Audit commands:` binding): for example the boundary check from `domain-layer.project.md`, dependency audit, dead-code detection. Unfilled binding means the step is skipped and reported as `unconfigured`, never as a pass.
4. Ranks hotspots: files with high churn (`git log`), many requirement links, and any drift finding.
5. Writes `.harness/audits/<timestamp>.json`.

```json
{
  "generated_at": "2026-10-21T09:00:00Z",
  "commit": "9897025",
  "findings": [
    {
      "id": "AUD-0001",
      "source": "computational",
      "check": "DRIFT-02",
      "severity": "fail",
      "slice_id": "wallet-deposits",
      "node": "feature:wallet-deposits:F-02",
      "paths": ["src/wallet/deposits.ts"],
      "message": "Owned file changed after evidence_commit 9897025",
      "first_seen": "2026-10-14T09:00:00Z",
      "occurrences": 3
    }
  ],
  "unconfigured": ["dead-code"]
}
```

### Pass 2 — inferential

A new skill `.agents/skills/codebase-audit/SKILL.md`, listed in the skills index by name and description only, run by the Knowledge Agent:

1. Read the latest audit JSON. Take the top N hotspots (N configurable, default 10).
2. For each hotspot, call `knowledge_trace` on the file node to get the requirements it implements, then read those EARS criteria and the code.
3. Judge each criterion: `satisfied`, `violated`, or `unclear`, with file and line evidence. `unclear` is never reported as `satisfied`.
4. Append the judgements to the same audit file with `"source": "inferential"`.

### Rules

- The auditor never edits product code. It produces findings only.
- A `fail` finding, or an inferential one the TL confirmed, becomes a new slice (via `init-slice.mjs`, lite by default) or a task in the owning slice. The audit does not fix it in place.
- Findings carry a stable ID and `occurrences`. When the same finding reaches three occurrences, `QG-DEB-06` applies: record which guide or sensor in `controls.md` must change so it stops recurring.
- Inferential findings are advisory until the TL confirms them. They never fail a gate on their own.
- TL triage lives in `.harness/audits/triage.json`. It is written by the TL's agent session, never by the MCP server. The auditor reads it to suppress dismissed findings. A dismissal is keyed by finding ID plus a content hash of the files it points to, so any change to that code brings the finding back.

```json
{
  "AUD-0007": {
    "decision": "dismissed",
    "reason": "Event handler in REST module is intentional; see ADR-012",
    "by": "tl",
    "at": "2026-10-21T15:00:00Z",
    "paths_hash": "sha256:…"
  }
}
```

### Runner (open decision)

Not decided. Both options work because the auditor is a script plus a skill:

- **GitHub Actions cron:** runs the computational pass deterministically; the inferential pass needs an agent CLI and an API key in CI.
- **Cursor Automation:** runs both passes in an agent with repo access; less deterministic scheduling and output location.

Whichever runner is chosen must commit or upload `.harness/audits/` so the next session can read it.

## 3. MCP server `spec-drift-auditor` and MCP App

A governance layer between the developer's IDE/LLM and the project's specs and CI. It merges the external "Spec-Drift & Architecture Auditor" proposal with the harness rules; [What changed from the proposal](#what-changed-from-the-proposal) lists every adjustment.

```text
+-----------------------------------------------------------------------+
|            HOST (Cursor / Claude Code / VS Code / ChatGPT)            |
+-----------------------------------------------------------------------+
                                  | MCP JSON-RPC (stdio)
                                  v
+-----------------------------------------------------------------------+
|                 MCP SERVER: spec-drift-auditor                        |
|  [Tools]                   [Resources]                 [Prompts]      |
|  audit_diff                spec://manifest             architecture-  |
|  verify_architecture_rules spec://rules/architecture     review       |
|  verify_spec_compliance    spec://drift/latest-report  spec-alignment |
|  generate_ci_gate          ui://spec-drift/dashboard                  |
|  audit_report / _finding                                              |
+-----------------------------------------------------------------------+
      |                       |                        |
      v                       v                        v
+----------------+   +--------------------+   +----------------------+
| Harness checks |   | Project-bound      |   | Knowledge index      |
| check-spec-    |   | commands           |   | (knowledge-store:    |
| drift.mjs,     |   | domain-layer gate, |   | REQ→feature→file     |
| audit-codebase |   | contract checks    |   | graph)               |
+----------------+   +--------------------+   +----------------------+
```

### Server placement

A **dedicated server**, `.agents/mcp/spec-drift-auditor.mjs`, registered in `.agents/mcp/mcp.json` next to `knowledge` and projected to every runtime by the installer. It is kept separate from `knowledge` because the concerns differ. `knowledge` is process memory: what exists, and how it is linked. `spec-drift-auditor` is governance: is this change allowed. Runtimes can also enable them independently.

The server is a **thin projection**. It computes nothing itself. It imports the harness libraries (`drift-lib.mjs`, `audit-lib.mjs`) that `check-spec-drift.mjs` and `audit-codebase.mjs` also use, runs project-bound commands, and reads the graph through `knowledge-store.mjs`. The same logic therefore runs identically in Verify-on-Stop, in CI, and from chat. It stays zero-dependency, using the same JSON-RPC plumbing as `knowledge-server.mjs`.

### Tools

| Tool | Arguments | Does |
|---|---|---|
| `audit_diff` | `base_branch?`, `target_branch?`, `mode?` (`author` \| `review`) | Runs `DRIFT-01`…`05` on the diff, plus `verify_architecture_rules` scoped to the changed files. Returns findings and a summary (below). Defaults: base = `Drift base branch` binding, target = `HEAD` plus the working tree, mode = `author`. `review` also runs `DRIFT-07`, applies `triage.json`, and switches the dashboard to review actions. |
| `verify_architecture_rules` | `paths?` | Loads the architecture rules the installing app fills in: `domain-layer.md` (kit contract), plus `domain-layer.project.md`, `product.md`, `structure.md`, and `tech.md` (default paths, or `project.json` `bindings` when remapped). A file whose title still says `(stub)` is returned as unfilled and is not product truth. Selects Semgrep YAML (`Semgrep rules` binding, else `.semgrep.yml`) or generates a temporary config from a `Paths \| Must not import` table and the `Language` row in `tech.md`, then runs `semgrep scan --json`. Findings carry Semgrep's fix when the rule has one. The dashboard renders violations and fixes. Also runs the **Gate command** from the domain-layer project binding when it is set. A missing binary, an unfilled command, and no rules are not a pass, and the generated YAML is not written into the repo. |
| `verify_spec_compliance` | `slice_id`, `adapter?` | Compares the slice's spec artifacts against the code. The core adapter `ears` (always available) runs `DRIFT-03`/`04`. Contract adapters come from modules: the `http-api` module adds an `openapi` adapter that runs a project-bound contract command (an OpenAPI diff or a contract test runner). |
| `generate_ci_gate` | `provider` (`github` \| `gitlab`) | Returns CI config **as text**. The job runs `node .harness/scripts/check-invariants.mjs`, which already includes the drift check, and fails on non-zero exit. The YAML carries no threshold of its own. |
| `audit_report` | `since?`, `severity?` | Latest `.harness/audits/` file, filtered. |
| `audit_finding` | `id` | One finding plus its `knowledge_trace` neighbourhood. |

Every tool is read-only and returns JSON as text content. That way every host gets the full result, whether or not it renders the UI. `generate_ci_gate` does not write the workflow file. The agent writes it only when a mapped task names that path, so the gold-plating rule still applies.

### Resources

Read views over harness files, which stay the system of record:

| URI | Backed by |
|---|---|
| `spec://manifest` | `.harness/state/registry.json` plus the active slice's `manifest.json` |
| `spec://rules/architecture` | `domain-layer.md` + `domain-layer.project.md` + `product.md` + `structure.md` + `tech.md` (layers, product rules, layout, stack; unfilled stubs are marked, not quoted) + the `QG-DOM` and `QG-DRIFT` rules from `quality-gates.md` |
| `spec://drift/latest-report` | The latest `audit_diff` result if one ran this session, else the latest `.harness/audits/` file |
| `ui://spec-drift/dashboard` | The MCP App HTML (below) |

DDD rules are not a separate resource. `spec://rules/architecture` exposes whatever the project bound in `domain-layer.project.md`, whether that is DDD, hexagonal, or layered, so the kit does not hard-code one style.

### Prompts

MCP prompts are thin pointers, not copies of rules. Each one tells the agent which skill and steering to `Read`, the same progressive-disclosure contract as [`skills.md`](../../.harness/steering/skills.md):

| Prompt | Arguments | Instructs the agent to |
|---|---|---|
| `architecture-review` | `paths?` | Call `verify_architecture_rules`, read `spec://rules/architecture`, then follow the `codebase-audit` skill's inferential pass for the given paths |
| `spec-alignment` | `slice_id` | Call `audit_diff` and `verify_spec_compliance`, read the slice's `intent.md`/`spec.md`, and report per-REQ `satisfied` / `violated` / `unclear` with evidence |
| `pr-review` (TL) | `base_branch`, `target_branch` | Resolve the linked slices from the branch name or PR body. Run `audit_diff` in `review` mode, `spec-alignment` for each linked slice, and `architecture-review` on the changed files. Skip findings dismissed in `triage.json`. Output draft review comments ordered 🔴, 🟡, 🔵, each with file, line, and the REQ or rule it cites. Do not post them |

### Summary metrics (defined, not invented)

The widget's headline numbers must be reproducible. They are derived from findings and carry no thresholds of their own:

- **Files analyzed**: the number of changed product files in the diff.
- **Spec compliance**: MUST requirements in scope that have an implementing feature (`DRIFT-03` clean) *and* a test mention (`DRIFT-04` clean), divided by all MUST requirements in scope. This is computational only.
- **Drift level**: `blocking` if any finding is FAIL, `warning` if there are only WARN findings, `clean` otherwise.

If the squad wants a numeric cutoff (for example "block the PR below 80% compliance"), it is added to `quality-gates.md` as an EARS rule (`QG-DRIFT-04`) and read from there by `check-spec-drift.mjs`. The CI YAML, the server, and the UI never define a second cutoff.

### Severity mapping

| Widget | Meaning | Source | Blocks? |
|---|---|---|---|
| 🔴 | FAIL: layer violation, unmapped change, stale evidence, orphan MUST REQ | Computational | Yes |
| 🟡 | WARN: REQ without a test mention, migration warnings, `unconfigured` checks | Computational | No |
| 🔵 | Advisory: style drift (for example mixed REST and event-driven handlers), `violated`/`unclear` judgements | Inferential | No, until the TL confirms it |

### MCP App (interactive view)

`audit_diff`, `verify_architecture_rules`, `verify_spec_compliance`, `audit_report`, `audit_finding`, and `generate_ci_gate` point to `ui://spec-drift/dashboard` through the tool's `_meta.ui.resourceUri`. Hosts that render MCP Apps show the widget inline; others show the JSON text.

```text
+-----------------------------------------------------------------------+
| SPEC-DRIFT & ARCHITECTURE AUDITOR                                     |
| Files analyzed: 14 | Spec compliance: 82% | Drift: warning            |
+-----------------------------------------------------------------------+
| 🔴 Layer violation: orders.service.ts imports pg-driver   [Trace]     |
| 🟡 REQ-014 (POST /refund validation) has no test mention  [Trace]     |
| 🔵 Style drift: REST controllers mixed with event handlers [Trace]    |
+-----------------------------------------------------------------------+
| author: [ View dependency graph ]  [ Send to agent as task ]          |
| review: [ View dependency graph ]  [ Draft comment ]  [ Dismiss… ]    |
+-----------------------------------------------------------------------+
```

Actions depend on the `mode` the tool ran in:

- **Trace** (both modes): the view calls `audit_finding` (REQ → feature → file from the knowledge graph). An import-level dependency graph from `codegraph` is not implemented.
- **Send to agent as task** (`author`, engineers): the view asks the host to post a message to the conversation, for example *"Open a task for AUD-0001 in slice orders: …"*. The agent then handles it through the normal loop: mapped files, a feature with `scope_paths`, and Verify-on-Stop.
- **Draft comment** (`review`, TL): posts a message asking the TL's agent to draft a review comment for the finding, with file, line, and cited REQ or rule. The TL edits it and posts it.
- **Dismiss…** (`review`, TL): asks for a reason, then posts a message asking the TL's agent to record the dismissal in `triage.json`.

In every case the UI and the server only post messages to the conversation. They never edit code, harness files, or the PR.

Implementation:

1. Declare the `resources` and `prompts` capabilities and implement `resources/list`, `resources/read`, `prompts/list`, and `prompts/get`.
2. The UI may be written in React, but it ships as **one prebuilt, self-contained HTML file** committed under `.agents/mcp/ui/`. React is a build-time dependency of the kit only. The server just reads the file, so installed projects need no bundler or `node_modules`.
3. Serve it with the MCP App MIME type and render only the data passed in the tool result or returned by the server's own tools. No network calls from the view.
4. The view shows every field of the payload: findings, checks, summary, report metadata, Gate command and output, architecture sources, audit commands, notes, recurring findings, dismissed findings, and report history.

Size budget (implementation decision): Cursor moves a tool result larger than about 13 KB into a file under `agent-tools/` and then does not mount the MCP App for it. For hosts that declare the extension, the server keeps dashboard results under 8 KB (`UI_RESULT_BUDGET`):

- `verify_architecture_rules` omits source texts and the generated Semgrep YAML (`include_text` restores them). The view loads one on request with `verify_architecture_rules { source: <id> | "semgrep" }`.
- A result with more findings than fit carries the first findings (paths capped at 5, with `paths_total`), and a `page` object with the full counts by severity and source, the tool name, and a token. The view loads the rest by calling the same tool with `page_token` and `offset`; each page also fits the budget.
- The view calls only tools that existed when the host first listed the server: Cursor lets an MCP App call only tools in its cached tool list, and that cache can predate new tools (`Tool not found`).
- Hosts without the extension get the full JSON unchanged.

Constraints:

- The text JSON result stays mandatory for hosts without MCP App support.
- MCP Apps spec `2026-01-26` (extension `io.modelcontextprotocol/ui`): the server links the dashboard only when the host declares the extension. The view uses a small `postMessage` bridge instead of the ext-apps SDK, so the server stays dependency-free. Cursor does not render widgets from servers in a project's `.cursor/mcp.json`; register the server globally with `HARNESS_ROOT` ([`.agents/mcp/README.md`](../../.agents/mcp/README.md)).
- Fallback in Cursor if MCP Apps are not rendered: the agent presents the same JSON in a canvas.

### Steering

- Add the server's tools and prompts to a short section in [`knowledge.md`](../../.harness/steering/knowledge.md), or to a new auto-loaded steering file tagged `implementation`, `qa`, `refactor`. Include per-role usage:
  - **Engineers:** Implementation calls `audit_diff` (`author`) before asking for `passing`; QA calls `spec-alignment`.
  - **TL:** `pr-review` on every green PR, and `audit_report` weekly.
  - **Refactor and the Knowledge Agent:** `architecture-review` and `audit_report`.
- Add a row to [`controls.md`](../../.harness/steering/controls.md): the computational sensor is `check-spec-drift.mjs` (stop + CI), and the MCP server is its on-demand view.

### What changed from the proposal

| Proposal | Adopted as | Why |
|---|---|---|
| A separate `spec-drift-auditor` server | Kept | Governance and memory are separate concerns |
| `audit_diff(target_branch, base_branch?)` | Kept, both optional | Defaults come from the `Drift base branch` binding |
| `verify_ddd_rules` | `verify_architecture_rules` | The kit binds any layer style in `domain-layer.project.md` and does not hard-code DDD |
| Static analyzer (AST parser, rulebook engine) | Delegated to the project's **Gate command** | A zero-dependency, language-agnostic kit cannot ship parsers for every stack. Projects already bind `dependency-cruiser`, ArchUnit, `import-linter`, and similar tools |
| `verify_spec_compliance(spec_path, code_path)` | `verify_spec_compliance(slice_id, adapter?)` | Specs are addressed by slice so traceability is preserved. EARS is the core adapter; OpenAPI is a module adapter |
| Spec parser for PlantUML | Dropped | Diagrams carry no testable EARS criteria; low signal for drift |
| `generate_architectural_gate()` with a drift threshold | `generate_ci_gate(provider)`, text only, runs `check-invariants` | One numeric source (`quality-gates.md`). File writes go through the session loop |
| `spec://rules/ddd` | Folded into `spec://rules/architecture` | Same reason as `verify_architecture_rules` |
| Prompts with embedded instructions | Thin pointers to skills and steering | Progressive disclosure; no duplicated rules |
| "Spec compliance 82%", "Drift: MODERATE" | Defined formulas, `blocking`/`warning`/`clean` | Reproducible numbers; no hidden cutoff |
| "Apply corrections with AI" button | "Send to agent as task" (engineers), "Draft comment" and "Dismiss…" (TL) | Auditors produce findings only. Fixes go through mapped files and Verify-on-Stop (gold-plating rule); the TL reviews and does not fix |
| Live React app embed | Prebuilt single HTML file | The server stays zero-dependency and installed projects need no build step |

## Rollout

| Step | Delivers | Verify with |
|---|---|---|
| 1 | Contract fields and `DRIFT-06` as WARN | `validators/features.mjs` tests, `check-invariants` |
| 2 | `check-spec-drift.mjs` (`DRIFT-01`…`05`, `--json`), `QG-DRIFT` gates, bindings (`Test file globs`, `Drift base branch`, `Audit commands`) | New `check-spec-drift.test.mjs` with fixture slices, Verify-on-Stop fail test |
| 3 | `spec-drift-auditor` server: `audit_diff` (both modes), `verify_architecture_rules`, `verify_spec_compliance` (`ears`), `generate_ci_gate`; resources; prompts including `pr-review`; `mcp.json` entry | JSON-RPC smoke test like the knowledge server tests; `unconfigured` when bindings are empty |
| 3b | `DRIFT-07` in CI, CODEOWNERS template for TL-owned rule files | PR fixture with and without a slice link |
| 4 | `audit-codebase.mjs`, the `codebase-audit` skill, `audit_report` / `audit_finding`, `triage.json` suppression | Fixture repo with known drift; a dismissed finding reappears after its file changes; skills index check |
| 5 | `openapi` adapter in the `http-api` module | Module test with a fixture spec and a mismatching endpoint |
| 6 | Runner (after the decision) | One scheduled run producing an audit file |
| 7 | MCP App dashboard (prebuilt HTML) | Manual check in a host that renders MCP Apps; text fallback in one that does not |
| 8 | `DRIFT-06` to FAIL | All existing slices migrated |

Each step also updates the installer (`scripts/install-into.sh`, `scripts/test-install-into.sh`) so new scripts reach installed projects, and the docs listed in the [portability checklist](../asdd-harness-portability.md).

Delivered in 3.4.0: steps 1–5, 3b, and 7. Step 2 shipped all of `DRIFT-01`…`07` in `drift-lib.mjs` (tests: `drift-lib.test.mjs`). Step 7 was verified in a headless sandboxed host; a manual check in Cursor, Claude, or VS Code is still pending. Steps 6 and 8 remain.
