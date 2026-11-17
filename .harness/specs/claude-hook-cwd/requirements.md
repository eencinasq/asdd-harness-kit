# claude-hook-cwd — Requirements (backfilled from spec.md on escalation)

- **REQ-001.** Every Claude Code hook the installer writes (gate, verify, observe) shall change to `${CLAUDE_PROJECT_DIR:-.}` before running asdd; when that change fails, gate and verify shall exit 2 (blocking) and observe shall exit 0 (fail-open).
- **REQ-002.** Re-running the installer on an existing install shall upgrade unwrapped Claude Code hook commands to the wrapped form, exactly once, and leave already wrapped commands unchanged.
- **REQ-003.** A Claude Code hook run from a subfolder of the project shall run asdd at the project root.
