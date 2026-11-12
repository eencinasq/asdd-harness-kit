# Spec Coverage Report: agents-spec

**Author:** asdd-pipeline (this session) · **Model/Tool:** claude-opus-5-5

## Gate Decision
PASSED

## Summary
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Spec-related test pass rate | 100% | 100% (`cli/test/agents-lint.test.mjs` 10/10; `install.sh` OK; `npm test` 131/131) | PASS |
| MUST requirement coverage | 100% | 100% (6/6) | PASS |
| EARS criteria coverage (MUST) | 100% | 100% (AC-001…006) | PASS |
| SHOULD requirement coverage | ≥ 95% | none in spec (100%, QG-SPEC-02) | PASS |
| Spec coverage | ≥ 95% | 100% | PASS |
| COULD requirement coverage | INFO | none in spec | INFO |

## Coverage by requirement
| Requirement | Criterion | Tests that name it |
|---|---|---|
| REQ-001 | AC-001 | `agents-spec REQ-001 AC-001: a manifest-write instruction and an absolute path fail`; `agents-spec REQ-001 REQ-002: the shipped agents carry no manifest writes, ordinals, foreign identifiers, or mixed QA roles` |
| REQ-002 | AC-002 | `agents-spec REQ-002 AC-002: sub-agents outside the orchestrator, an editing auditor, a writing researcher fail`; the shipped-content test above (QA auditor only, knowledge no re-trigger, only implementation spawns) |
| REQ-003 | AC-003 | `agents-spec REQ-003: each missing grammar slot fails with its rule`; kit-wide `REQ-006: the agents the kit ships pass agents-lint` |
| REQ-004 | AC-004 | `agents-spec REQ-004: the renderers project capabilities per runtime`; `cli/test/install.sh` (`agents-spec REQ-004` blocks: Claude tools, Cursor readonly, OpenCode permissions, rendered vs linked; uninstall removal checked manually, see TASK-004 evidence) |
| REQ-005 | AC-005 | `agents-spec REQ-005: an agent over 20 KB fails`; kit `skills-lint` passes the two new module skills |
| REQ-006 | AC-006 | `agents-spec REQ-006` tests (kit passes, valid agent passes, references/skills/cycles, project mode and `--only`); `npm test` runs `asdd kit agents-lint` |

## Uncovered Requirements
None.

## Domain Placement Findings
None: kit guidance and the installer only.

## Code Review Notes
Known limits, recorded in the validation report: Claude Code has no path-scoped write rule (auditors keep `Write` and
`Bash`; VAL-001); OpenCode `edit` resource globs are asserted structurally, not at OpenCode runtime (VAL-002).
Uninstall removal of rendered files was verified manually (install → reinstall → uninstall on a temp repo), not by an
automated assertion.

## Recommendation
PROCEED
