# Design: agents-spec

## Traceability
- Requirements: [requirements.md](./requirements.md)
- Validation: [spec-validation-report.md](./spec-validation-report.md) — PASSED

## What Changes
| File/Module | Nature of Change |
|-------------|------------------|
| `cli/agents/asdd-{discovery,spec,validation,domain,design,task-planning}-agent.md` | Agent grammar; P1 fixes (no manifest writes, no ordinals) |
| `cli/agents/asdd-{implementation,qa,refactor,knowledge,lite}-agent.md` | Agent grammar; P1 fixes (parallel rule, foreign identifiers, ADR schema, manifest); P2 roles (QA audits only; Knowledge no state custody, no re-trigger) |
| `cli/agents/asdd-spike-researcher.md` (new) | Read-only researcher for low-confidence spikes (from Knowledge) |
| `cli/agents/_runtime-template.md`, `cli/agents/README.md` | Shared epistemic rules (working tree, `file:line`, anti-hedging, quarantine, provenance); capability schema; pipeline |
| `cli/steering/templates/spec-peer-review.md` | Removed (QA no longer peer-reviews specs; validation owns it) |
| `cli/scaffold/config/models.json` | Spike researcher tier; QA profile text |
| `cli/modules/bruno/asdd-integration-tester.md`, `cli/modules/playwright-e2e/asdd-e2e-tester.md` | Agent grammar; e2e runbook moved out |
| `cli/modules/playwright-e2e/skills/playwright-e2e-testing/**` (new) | The Playwright pipeline runbook as a module skill |
| `cli/src/install/modules.mjs` | playwright-e2e also installs its skill |
| `cli/src/install/agent-frontmatter.mjs` (new), `cli/src/install/runtimes.mjs`, `cli/src/install/context.mjs` | Parse canonical frontmatter; render Claude Code / Cursor / OpenCode agent files; `writeGenerated` |
| `cli/src/kit/agents-lint.mjs` (new), `cli/src/main.mjs`, `cli/test/agents-lint.test.mjs`, `package.json`, `cli/README.md` | The sensor |
| `cli/test/install.sh` | Projection and uninstall assertions |

## Domain Placement
- Owning domain: kit guidance and the installer; no product code.
- Integration boundaries: runtime agent folders (`.claude/agents`, `.cursor/agents`, `.opencode/agents`) are written by the installer; `.agents/agents` stays the single source.

## Domain Impact
- New terms added to Ubiquitous Language: none in a product domain. Kit vocabulary: tier (`executor`, `researcher`,
  `specialist`, `auditor`, `orchestrator`), capabilities, write_paths, projection.

## Canonical frontmatter

```yaml
name: asdd-validation-agent
description: >-
  <capability>. Use when <trigger>. Do NOT use <boundary> — use <sibling>.
model: inherit
mode: subagent
metadata: { tier: auditor, workspace_mode: inherit, model_profile: inherit }   # written as block maps
capabilities:
  write_tools: true          # false = writes nothing
  mcp_tools: false
  subagent_tools: false      # true only for the orchestrator
  allow: [read_file, run_command, write_file]
  deny: [edit_file]
  write_paths: [".harness/specs/*/spec-validation-report.md", ".harness/state/slices/*/sessions/*"]
  skills: [anti-pattern-detection, codegraph]
limits:
  max_turns: 40
```

## Projection (REQ-004)

| Canonical | Claude Code (`.claude/agents/`) | Cursor (`.cursor/agents/`) | OpenCode (`.opencode/agents/`) |
|---|---|---|---|
| `read_file` | `Read, Grep, Glob` | — | — |
| `run_command` | `Bash` | — | — |
| `write_file` / `edit_file` | `Write` / `Edit` | `readonly: true` when `write_tools: false` | `permissions` edit: deny `*`, allow each `write_paths` entry (last match wins), when `edit_file` is denied or `write_tools` false |
| `subagent_tools: true` | `Agent` in `tools` | — | no `subagent` deny |
| `subagent_tools: false` | no `Agent` | — | `subagent` deny `*` |
| `mcp_tools: true` | `disallowedTools` (inherit, MCP included) instead of a `tools` allowlist | — | — |
| `limits.max_turns` | `maxTurns` | — | `steps` |
| `model: inherit` | `model: inherit` | `model: inherit` | omitted (provider/model format) |

The rendered file keeps the canonical body and a header comment naming its source. Kimi, Junie, Devin, and Kiro keep the
link (no documented per-agent tool fields). Rendered files are kit-owned (`managed_files` + `kit_files` hash), so
uninstall removes them and a project edit is kept (SKIP) like any kit file.

## Architecture Decisions (ADRs)
- ADR-001: One canonical file, rendered per runtime. Strongest argument against: rendering duplicates the body three
  times and a project editing `.claude/agents/x.md` diverges; accepted, the runtimes need different keys under the same
  name (`tools` string vs OpenCode `permissions` list), and the installer already treats kit files as refreshable.
- ADR-002: Allowlist when the agent needs no MCP, denylist when it does. Against: a denylist is weaker; accepted because a
  Claude Code `tools` allowlist drops MCP tools the discovery and e2e agents need.
- ADR-003: QA audits only; tests are written by implementation's TDD RED step; requirement review is validation's.
  Against: QA test scaffolding sped up implementation; rejected, an auditor judging tests it wrote is the fatal defect of
  agent.spec Invariant 1.
- ADR-004: Spike research becomes `asdd-spike-researcher` (read-only, returns a cited table); the caller records the
  spike. Against: one more agent to route; accepted, a knowledge curator that also re-triggers agents needs subagent
  tools it must not have.
- ADR-005: Shared epistemic rules live in `_runtime-template.md` and each agent cites them in one line, since the
  always-loaded budget has 45 bytes left (skills-spec ADR-005).

## Sequence Diagram
```
asdd install → runtimes.mjs : wire claude|cursor|opencode
runtimes.mjs → agent-frontmatter.mjs : parse .agents/agents/<name>.md
runtimes.mjs → <runtime>/agents/<name>.md : writeGenerated(rendered)
Parent session → <runtime> : route by description → agent runs inside its tool envelope
npm test → asdd kit agents-lint : A-* / AL-* checks
```

## Component Map
```
cli/agents, cli/modules/*/asdd-*.md ──install──> .agents/agents ──render──> .claude|.cursor|.opencode/agents
                                                               └─link───> .junie|.devin|.kiro/agents, .kimi-code/agents
cli/src/kit/agents-lint.mjs ──reads──> agents + skills (mounted skills resolve)
```

## Risks and Mitigations
- OpenCode `edit` resource semantics (VAL-002): install.sh asserts structure; documented as unverified at runtime.
- Claude `Bash` still writes for auditors (VAL-001): the agent's negative mutation check and `asdd check` DRIFT-01.
- Legacy installs have symlinks where rendered files go: `writeGenerated` replaces a link with a file.

## Design Confidence Score
0.86
