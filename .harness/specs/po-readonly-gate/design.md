# po-readonly-gate — Design (lite)

## What changes

| File | Change |
|------|--------|
| `command-gate.mjs` | `isReadonlyMode(env)`, `readonlyVerdict(command)` (segment split, redirection and substitution checks, allowlist); `checkCommandSafety` and the hook use it when the mode is on; override ignored in that mode |
| `command-gate.test.mjs` | allow/deny tables, override, hook payloads (Claude and Cursor), unset mode unchanged |
| shaping agent, Play O, Claude runtime README | set `HARNESS_GATE_MODE=readonly` for the PO session |

## New domain terms

None.

## ADRs

None: same gate, one more mode; allowlist (deny by default) because a denylist cannot enumerate every way a shell writes.
