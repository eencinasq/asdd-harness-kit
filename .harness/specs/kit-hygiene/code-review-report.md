# Code Review Report: kit-hygiene

Mode: delegation (`ocr delegate preview` + `ocr delegate rule`, open-code-review v1.13.3); the host agent reviewed each diff against its rule group.

## Review 1 — TASK-001, TASK-002

### Review Scope
`f65a6f9..b0c6610` (15 reviewable files; 3 excluded by OCR as unsupported extensions: `.harness/PROGRESS.md`, `quality-gates.project.md`, `docs/agent-failure-log.md`). Code reviewed: `scripts/check-guidance.mjs`, `scripts/check-guidance.test.mjs`, `.harness/scripts/sync-state.mjs`, `.harness/scripts/sync-state.test.mjs`, `.harness/scripts/init-slice.mjs`, `scripts/test-install-into.sh`, `scripts/test-lifecycle.sh`, `package.json`. Skipped as generated state (no logic): `.harness/state/**`, `.harness/features/kit-hygiene.features.json`.

Late review: TASK-001 and TASK-002 were first marked `passing` without this review, against `asdd-implementation-agent.md`; both were re-evaluated here.

### Findings

#### CRITICAL
| ID | File | Line | Rule | Description |
|----|------|------|------|-------------|
| — | — | — | — | none |

#### HIGH
| ID | File | Line | Rule | Description |
|----|------|------|------|-------------|
| — | — | — | — | none |

#### MEDIUM
| ID | File | Line | Rule | Description |
|----|------|------|------|-------------|
| CR-001 | `scripts/check-guidance.mjs` | CUTOFFS[0] | Code quality (correctness) | The integer branch `1(?:\.0+)?` flagged counts such as "> 1 `in_progress` feature" as score cutoffs. **Fixed:** only `1.0` matches; test line added. TASK-001 reopened and re-verified. |

#### LOW / OBSERVATION
| ID | File | Line | Rule | Description |
|----|------|------|------|-------------|
| CR-002 | `scripts/check-guidance.mjs` | walk | Null checks | Symlinked runtime agent dirs in an installed project are skipped (not followed). Acceptable: they point at `.agents/agents`, which is scanned. |

### Verification
- [x] All CRITICAL findings resolved or accepted by TL (none)
- [x] All HIGH findings resolved or accepted by TL (none)

### Recommendation
PASS_WITH_NOTES (CR-001 fixed, CR-002 observation)

## Review 2 — TASK-003

### Review Scope
Workspace diff before the TASK-003 commit: `scripts/install-into.sh`, `scripts/test-install-into.sh`, `.harness/scripts/check-project-config.mjs`, `.harness/config/project.schema.json` (OCR-reviewable). Markdown guidance edits are outside OCR's rule set; they are checked by `check-guidance --only stale` instead.

### Findings
| ID | Severity | File | Description |
|----|----------|------|-------------|
| CR-003 | LOW | `scripts/install-into.sh` (`wire_runtime_claude`) | Existing projects keep their old `CLAUDE.md` ("INIT, locks, …"): the installer only creates it when missing. Acceptable; new installs are clean and the stale sensor covers them. |
| CR-004 | OBSERVATION | `.harness/config/project.json` (kit-only) | The kit's own config still declares `paths.progress`/`paths.locks`; now optional, so valid. Not shipped. |

No CRITICAL, HIGH, or MEDIUM findings.

### Recommendation
PASS_WITH_NOTES

## Review 3 — TASK-004

### Review Scope
Workspace diff before the TASK-004 commit: nine agent prompts (`.agents/agents/*.md`). OCR preview lists no reviewable code (Markdown only), so there is no OCR rule group to apply. The change is checked by `check-guidance --only cutoffs` (kit and installed project) and read by the host agent for meaning: every removed number either had no gate behind it (refactor safety score, validation auto-approval, dynamic targets) or now cites the gate that holds it (`QG-TPL-*`, `QG-VAL-03/04`, `QG-SPEC-03…08`, `QG-DOM-06`, `QG-GATE-04`).

### Findings
None.

### Recommendation
PASS

## Review 4 — TASK-005

### Review Scope
Workspace diff before the TASK-005 commit (OCR preview, code files): `.harness/scripts/command-gate.mjs` (renamed), `.harness/scripts/jev-command-gate.mjs` (shim), `.harness/scripts/command-gate.test.mjs`, `.agents/mcp/jev-gate-server.mjs`, `scripts/install-into.sh` (hook merge), `scripts/test-install-into.sh`, `scripts/generate-versions.mjs`, `.github/workflows/harness-invariants.yml`.

### Findings
| ID | Severity | File | Description |
|----|----------|------|-------------|
| CR-005 | MEDIUM | `scripts/install-into.sh` (Cursor and Claude merge) | The upgrade rewrite matched any command containing `jev-command-gate.mjs`, so a project-owned hook such as `tools/jev-command-gate.mjs` would be pointed at a file that does not exist. **Fixed:** only `.harness/scripts/jev-command-gate.mjs` is rewritten; the upgrade test now includes a similarly named project hook and asserts it is untouched. |
| CR-006 | MEDIUM | `.harness/scripts/command-gate.mjs` | The Cursor `agent_message` still named `jev-command-gate.mjs`. **Fixed** before review. |
| CR-007 | LOW | `scripts/install-into.sh` | The "gate already present" check is a substring match (`command-gate.mjs`); a project hook with that substring would suppress adding the kit gate. Pre-existing behavior, unchanged in kind. |

No CRITICAL or HIGH findings.

### Recommendation
PASS_WITH_NOTES (CR-005, CR-006 fixed; CR-007 noted)

## Review 5 — TASK-006

### Review Scope
Workspace diff before the TASK-006 commit: `scripts/install-into.sh` (domain-model source), `scripts/generate-versions.mjs`, `scripts/test-install-into.sh`, `package.json` (OCR-reviewable), plus the moved kit domain model.

### Findings
None. The stub is byte-identical to the previously shipped file (`cmp` in AC-008), so projects see no change; `generate-versions.mjs` still lists `architecture/knowledge-scaling.md`, which does not exist (pre-existing, outside this scope — OBSERVATION).

### Recommendation
PASS

## Review 6 — TASK-007

### Review Scope
`.harness/steering/session-loop.md` (Markdown; no OCR rule group) and the budget slot in the kit's `quality-gates.project.md`. Host-agent read for meaning: removed text is duplicated verbatim elsewhere in always-loaded files (`AGENTS.md` INIT; `manifest.md` session format and event types) or in `jev.md`; the Verify-on-Stop paragraph keeps every rule (automatic hooks, loop limit, FAIL means not passing, mandatory `--live` on other runtimes, learning signal).

### Findings
None.

### Recommendation
PASS
