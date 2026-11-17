# po-readonly-gate — Requirements (backfilled from spec.md on escalation)

- **REQ-001.** WHILE `HARNESS_GATE_MODE` is `readonly`, the command gate shall allow a command only when every segment (split on `&&`, `||`, `;`, `|`) matches the read-only allowlist, and shall deny it otherwise.
- **REQ-002.** WHILE in read-only mode, the gate shall deny any command with an output redirection to a file (other than `/dev/null` and descriptor duplication such as `2>&1`) and any command substitution (`$(`, backticks, process substitution).
- **REQ-003.** WHILE in read-only mode, the override flag in the hook payload shall not allow a denied command.
- **REQ-004.** WHEN `HARNESS_GATE_MODE` is unset, the gate shall decide exactly as before.
- **REQ-005.** The shaping agent, Play O, and the Claude runtime README shall tell the PO/PM session to set `HARNESS_GATE_MODE=readonly`.
