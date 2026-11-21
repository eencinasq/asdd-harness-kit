# pipeline-e2e — Spec (lite)

## Requirements

- **REQ-001.** `npm test` shall walk a `--full` slice through discovery, spec, validation, domain, design,
  task_planning, implementation, qa, and knowledge, asserting the derived phase after each gate, a passing
  `asdd check` with no phase-chain warning, and DONE at the end.
- **REQ-002.** `npm test` shall run the gate, verify, and observe hooks through the command lines `asdd install`
  writes for Claude Code and Cursor: the gate allows a safe command and denies a destructive one, verify releases a
  clean session, observe exits 0.
- **REQ-003.** `npm test` shall run every registry command's `--help`, and each harness command once in an installed
  project with its expected exit codes and no stack trace.
- **REQ-004.** `npm test` shall show that a phase completed out of order is reported as QG-DEC-09.
