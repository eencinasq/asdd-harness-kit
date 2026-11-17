# po-readonly-gate — Capability (backfilled on escalation from lite)

**Capability:** A PO/PM shaping session cannot change repository files through the shell.

- **Actor:** PO/PM using `asdd-shaping-agent` (Claude Desktop Code tab, claude.ai/code, or an IDE).
- **Outcome:** with `HARNESS_GATE_MODE=readonly`, the command gate allows only read commands; redirections, command substitution, and overrides are denied. Engineers' sessions are unchanged.
- **Escalation:** E1 only (cli/ + docs/); no new domain terms, no dissent.
