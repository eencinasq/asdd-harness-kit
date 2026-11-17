# claude-hook-cwd — Capability (backfilled on escalation from hotfix)

**Capability:** Claude Code hooks run asdd at the project root regardless of the session's current directory.

- **Actor:** any engineer or agent session in Claude Code (kit repo or installed project).
- **Outcome:** gate, verify and observe work from subfolders; blocking hooks still block when the root is unreachable.
- **Escalation:** E1 only (cli/ + .claude/); no new domain terms, no dissent.
