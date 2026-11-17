# po-readonly-gate — Spec (lite)

## Intent

P6.6 (gap G28). The PO/PM shaping session must not change repository files: its output goes to the tracker. The
`asdd-shaping-agent` runtime denies `Write` and `Edit`, but `Bash` stays allowed for grounding (`asdd knowledge`,
`codegraph`, `git log`) and could still write (`echo > file`, `sed -i`, `git commit`). Add a read-only mode to the
command gate, enabled per session with `HARNESS_GATE_MODE=readonly`: only an allowlist of read commands passes,
file redirections and command substitution are denied, and the override flag does not apply. Engineers' sessions
(no variable) keep today's behavior.

Mapped: `cli/src/harness/command-gate.mjs`, `cli/src/harness/command-gate.test.mjs`, `tools/jev-gate/src/harness/command-gate.mjs` (vendored copy, `asdd kit vendor`), `cli/agents/asdd-shaping-agent.md` (source) and its copies `.agents/agents/asdd-shaping-agent.md`, `.cursor/agents/asdd-shaping-agent.md`, `.claude/agents/asdd-shaping-agent.md` (`asdd kit self`, `asdd install`), `docs/PLAYBOOK.md`, `cli/runtimes/claude/README.md`, `.harness/config/installed-versions.json` (hashes of refreshed copies)

## Requirements

- **REQ-001.** WHILE `HARNESS_GATE_MODE` is `readonly`, the command gate shall allow a command only when every segment (split on `&&`, `||`, `;`, `|`) matches the read-only allowlist, and shall deny it otherwise.
- **REQ-002.** WHILE in read-only mode, the gate shall deny any command with an output redirection to a file (other than `/dev/null` and descriptor duplication such as `2>&1`) and any command substitution (`$(`, backticks, process substitution).
- **REQ-003.** WHILE in read-only mode, the override flag in the hook payload shall not allow a denied command.
- **REQ-004.** WHEN `HARNESS_GATE_MODE` is unset, the gate shall decide exactly as before.
- **REQ-005.** The shaping agent, Play O, and the Claude runtime README shall tell the PO/PM session to set `HARNESS_GATE_MODE=readonly`.
