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
