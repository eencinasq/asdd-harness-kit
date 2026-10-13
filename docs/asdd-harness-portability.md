# ASDD + Harness portability (kit)

How this template maps to product repos.

## Layers

| Layer | Here |
|-------|------|
| **A. Kit core** | This repository |
| **B. Modules** | Optional modules remain in the kit and are copied only when enabled |
| **C. Bindings** | `.harness/steering/{product,structure,tech,*.project}.md` stubs |
| **D. Runtimes** | Runtime adapters maintained in this kit under runtimes/ |

## Adopter checklist

1. Use this template (GitHub "Use this template" or clone).
2. Fill all required bindings.
3. Install the runtime links you use with scripts/install-into.sh. Runtime recipes stay in this kit and are not copied into product repos.
4. Enable modules with `scripts/install-into.sh --modules=<list>` from this kit, or with the GitHub `--from-git` form.
5. Validate the generated adapter: `node .harness/scripts/check-project-config.mjs`.
6. Validate Harness state: `node .harness/scripts/check-invariants.mjs`. This also checks that `.harness/steering/skills.md` lists only the name and description of each folder under `.agents/skills/`.
7. Fill `quality-gates.project.md` before Discovery: the full-suite command, the failure-log path, and `Active findings` (`none` or real rows). A stub blocks the gate that needs it.
8. With `--runtime=cursor`, confirm `.cursor/hooks.json` runs `node .harness/scripts/verify-on-stop.mjs` on `stop` and `node .harness/scripts/jev-command-gate.mjs` on `beforeShellExecution`. With `--runtime=claude`, confirm `.claude/settings.json` registers the same two scripts on `Stop` and `PreToolUse` (Bash).
9. For shape-up / product-delivery: set `JEV_API_KEY`, keep `capabilities.jev.apiKey` empty, prefer `jev-gate` MCP (`jev_status`), shell fallback `node .harness/scripts/jev-gates.mjs health`. Confirm `required: false` and `required_by: ["shape-up","product-delivery"]`.
10. Create the first slice via Discovery or ASDD-Lite. Read [asdd-and-harness-engineering.md](asdd-and-harness-engineering.md) and [jev-integration.md](jev-integration.md).

Optional: the knowledge index (spec/session/feature graph + searchable chunks)
regenerates automatically at the end of every `sync-state.mjs` run — or manually
with `node .harness/scripts/sync-knowledge.mjs`. The `knowledge` MCP server is
already registered in `.agents/mcp/mcp.json`; the index lives under
`.harness/knowledge/` (generated — keep it gitignored). Growth path:
[architecture/knowledge-scaling.md](architecture/knowledge-scaling.md).

## Enforcement coverage per runtime

Session-loop gates are **hook-enforced** on runtimes with a hook mechanism and
**advisory** (steering + `check-invariants.mjs`) everywhere else:

| Runtime | Command gate (pattern) | Verify-on-stop |
|---------|--------------------|----------------|
| Cursor | `beforeShellExecution` hook (fail-closed) | `stop` hook (fail-closed) |
| Claude Code | `PreToolUse`/`Bash` hook | `Stop` hook (loop-safe) |
| OpenCode, Kimi, Junie, Devin, Kiro | advisory — run `node .harness/scripts/jev-command-gate.mjs` before dangerous commands, or expose the `check_command_safety` MCP tool (no System One) | run `node .harness/scripts/check-invariants.mjs --live` before marking `passing` (no `JEV_API_KEY` required) |

## Do not copy from a product monorepo

Specs, PROGRESS history, filled product/structure/tech, or Nx-specific boundary scripts from another app.


## Install into an existing repo

```bash
./scripts/install-into.sh /path/to/existing-repo --modules=http-api --runtime=cursor
# or: curl …/install-into.sh | bash -s -- /path/to/repo --from-git …
```

See root README § *Add to an existing project*. Smoke: `./scripts/test-install-into.sh`.
