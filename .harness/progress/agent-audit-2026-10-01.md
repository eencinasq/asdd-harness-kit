# Agent Audit: ASDD + Harness Kit — Gaps, Conflicts, and Improvements

**Auditor:** Kimi Code (runtime-agnostic agent perspective)
**Date:** 2026-10-01
**Scope:** All steering contracts, agent definitions, check scripts, installer, and runtime wiring
**Method:** Read every agent definition and steering file; trace cross-references; compare stated rules with check-script enforcement; identify contradictions, missing scaffolds, and friction points from an agent's operational perspective.

---

## Summary by Severity

| Severity | Count | Categories |
|----------|-------|------------|
| **Critical Conflict** | 6 | Tool instructions, thresholds, concurrency rules, file references |
| **Major Gap** | 12 | Missing templates, missing files, missing checks, missing CLI |
| **Ambiguity** | 8 | Undefined formats, vague sync instructions, unclear field semantics |
| **Friction** | 7 | Repetitive boilerplate, context-window bloat, manual ceremony |

---

## Critical Conflicts (will confuse or break agents)

### C1. Validation Agent uses wrong editing tools
- **Discovery/Spec/Design/Implementation/QA/Lite:** "Use `Write` / `StrReplace` / `Shell` (not Kiro `fsWrite`)"
- **Validation Agent:** "Use `fsWrite` (not Cursor `Write` / `StrReplace`)"
- **Impact:** An agent switching between phases may use the wrong tool and fail. The Validation Agent's instruction directly contradicts every other agent and the steering convention.
- **Fix:** Normalize to `Write` / `StrReplace` / `Shell` for all agents, or add a runtime-conditional note.

### C2. Validation Agent uses different sub-agent mechanism
- **All other agents:** "Prefer the `Task` tool for context-fresh sub-agents / waves (instead of Kiro `invokeSubAgent`)"
- **Validation Agent:** "Prefer `invokeSubAgent` for context-fresh sub-agents / waves"
- **Impact:** Same as C1 — runtime-specific divergence in a supposedly portable agent.
- **Fix:** Standardize on `Task` (the portable tool) and remove `invokeSubAgent` references.

### C3. QA Agent gate thresholds contradict `quality-gates.md`
- **QA Agent:** "PASSED: Test Coverage ≥ 80% AND Spec Coverage ≥ 95%"
- **quality-gates.md (QG-SPEC-08):** "spec coverage below 95% → WARN" (not BLOCK)
- **quality-gates.md:** No 80% test coverage threshold is defined anywhere
- **Impact:** QA Agent may BLOCK when quality-gates.md says WARN, or may pass on test coverage that has no defined gate.
- **Fix:** Remove the 80% test coverage line from QA Agent. Align QA Agent's PASS/PASSED_WITH_WARNINGS/BLOCKED language with QG-DEC-* and QG-SPEC-* criteria exactly.

### C4. Frontend `data-testid` rules are hidden in Implementation Agent only
- **Implementation Agent:** Extensive `data-testid` rules (lines 147-170) — mandatory attributes, naming convention, coverage requirements
- **Design Agent / QA Agent / Lite Agent:** No mention of `data-testid`
- **Steering:** No portable UI testing contract in any `.md`
- **Impact:** Design Agent won't design for testability; QA Agent won't verify testid coverage; Lite Agent won't know the rule. Only Implementation knows, creating a late-phase surprise.
- **Fix:** Move `data-testid` rules to a portable steering file (e.g., `design-system.md` or new `ui-testing-contract.md`) and have agents reference it.

### C5. CCS thresholds create impossible multiplicative outcomes
- **Discovery:** score < 0.85 → DRAFT
- **Spec:** score < 0.85 → DRAFT/BLOCKED
- **Design:** QG-DES-01 requires ≥ 0.85
- **Implementation:** score < 0.95 → must document uncertainty; if Design was < 0.85, target raised to 0.90
- **CCS formula:** `Spec * Validation * Design * Implementation`
- **Impact:** If all phases meet their minimum (0.85 × 0.85 × 0.85 × 0.90), CCS = **0.55** — which is WARN (0.50–0.65) per QG-CCS-02. So a slice can pass every phase gate and still get CCS WARN. The thresholds are not internally consistent.
- **Fix:** Either lower the Implementation threshold, or raise the CCS WARN band, or use a different aggregation (e.g., minimum instead of product).

### C6. `mode: "escalated"` is undefined outside `asdd-lite.md`
- **asdd-lite.md:** "Set `mode: "escalated"` in the per-slice manifest" when scope grows
- **manifest.md:** Only documents `mode: "full"` and `mode: "lite"`
- **check-invariants.mjs:** Does not validate `mode: "escalated"`
- **Impact:** Agent sets a mode the system doesn't recognize. No guidance on what gates/confidence_chain behavior changes.
- **Fix:** Define escalated mode behavior in manifest.md and add invariant check.

---

## Major Gaps (missing scaffolds, templates, checks)

### G1. Missing templates for every ASDD artifact
The agents are expected to produce these files, but **no templates exist** in `.harness/steering/templates/`:

| Artifact | Producing Agent | Template Exists? |
|----------|-----------------|------------------|
| `intent.md` | Human / Discovery | ❌ |
| `capability.md` | Discovery | ❌ |
| `requirements.md` | Spec | ❌ |
| `spec-validation-report.md` | Validation | ❌ |
| `design.md` | Design | ❌ |
| `tasks.md` | Task Planning | ❌ |
| `spec-coverage-report.md` | QA (Mode B) | ❌ |
| `code-review-report.md` | QA / Implementation | ❌ |
| `spec-peer-review.md` | QA (Mode C) | ❌ |

The only template that exists is `slice-manifest.stub.json`.
- **Impact:** Every agent invents its own format. Cross-agent handoffs are inconsistent. check-invariants can't validate structure.
- **Fix:** Create all nine templates in `.harness/steering/templates/`.

### G2. Missing `docs/architecture/` directory
- **domain-layer.md:** Expects `docs/architecture/domain-model.md` as "Ubiquitous Language"
- **Installer:** Does not create `docs/architecture/`
- **Impact:** Agent reads fail on first access. Domain model has no home.
- **Fix:** Installer should scaffold `docs/architecture/` with a `domain-model.md` stub.

### G3. Missing `docs/agent-failure-log.md`
- **session-loop.md:** "On repeated failure, set `blocked` and append `docs/agent-failure-log.md`"
- **QA Agent:** "append `docs/agent-failure-log.md`"
- **File:** Does not exist. Installer does not create it.
- **Impact:** Agent cannot comply with the failure-logging rule.
- **Fix:** Create `docs/agent-failure-log.md` stub during install.

### G4. Missing `docs/dissent-log.md`
- **Validation Agent:** Lists `docs/dissent-log.md` as optional input
- **File:** Does not exist
- **Impact:** Architectural dissent has no recorded home.
- **Fix:** Create stub or remove the reference if dissent logging is not required.

### G5. `features.json` has no JSON schema
- **session-loop.md:** Describes feature item shape textually
- **check-invariants.mjs:** Validates fields programmatically
- **No `.json` or `.schema.json` file:** Agents can't validate before writing
- **Impact:** Agents may write malformed features.json that only fails at invariant check time.
- **Fix:** Create `.harness/features/feature.schema.json` (or similar) and validate against it.

### G6. `bindings_complete` is never checked by invariants
- **project.json:** Has `"bindings_complete": false`
- **check-project-config.mjs:** Warns when bindings are unfilled
- **check-invariants.mjs:** Never checks this flag
- **Impact:** An agent can proceed with implementation even though bindings are known to be stubs.
- **Fix:** If `bindings_complete === false`, check-invariants should WARN (or BLOCK if in implementation phase).

### G7. No `harness status` CLI
- **Impact:** To understand project state, an agent must read 5+ files. Humans have no quick overview.
- **Fix:** Add `node .harness/scripts/harness-status.mjs` that prints: active slices, locks held, features in progress, phases, stale locks.

### G8. No `harness init-slice <id>` CLI
- **Impact:** Creating a new slice requires manually creating: per-slice manifest, progress file, spec directory, features file, and updating global manifest + PROGRESS.md.
- **Fix:** Add `node .harness/scripts/init-slice.mjs <slice-id>` that scaffolds all required files from templates.

### G9. `.DS_Store` files are copied into target projects
- **Evidence:** Test output shows `.agents/skills/.DS_Store` being copied
- **Impact:** macOS metadata pollution in every installed project.
- **Fix:** Add `.DS_Store` exclusion to `copy_tree()` in `install-into.sh`.

### G10. No unified CCS calculator
- **Implementation Agent:** States a manual formula
- **No script exists:** Agents must compute CCS by hand
- **Impact:** Inconsistent CCS calculation across agents.
- **Fix:** Add `node .harness/scripts/compute-ccs.mjs` that takes phase confidence scores and returns gate decision.

### G11. No `check-slice-manifest.mjs` standalone validator
- **check-invariants.mjs:** Validates all slices together
- **No per-slice validator:** Can't quickly check one slice during development
- **Fix:** Extract slice manifest validation into a reusable module + CLI.

### G12. `source_tasks` field in features.json is validated but never documented
- **check-invariants.mjs:** Validates `source_tasks` as a required path field
- **session-loop.md:** Never mentions `source_tasks`
- **Impact:** Agents don't know they need to set this field.
- **Fix:** Document `source_tasks` in session-loop.md (or remove it from validation if not required).

---

## Ambiguities (will cause inconsistent agent behavior)

### A1. "Gold-plating" is non-standard jargon
- **session-loop.md:** Uses "gold-plating" as the technical term for out-of-scope work
- **No definition in glossary:** An agent may not know this term
- **Fix:** Use "out-of-scope work" or define "gold-plating" in the steering README.

### A2. `evidence` format is undefined
- **session-loop.md:** "filled only when passing (what ran + result)"
- **Is it:** a string? an object with `command` and `output`? an array?
- **check-invariants.mjs:** Only checks `String(f.evidence || '').trim()` — any non-empty string passes
- **Fix:** Define the evidence schema in session-loop.md and validate structure in invariants.

### A3. "Sync the global registry row" is vague
- **Manifest.md and every agent:** Say this is required
- **No specification of:** Which fields to sync, in what order, what to do if global row doesn't exist yet
- **Fix:** Add a "Registry row sync protocol" section to manifest.md with exact field mapping.

### A4. `agent_heartbeats` schema is undocumented
- **manifest.md:** Mentions the field exists
- **No schema:** What keys? What timestamp format?
- **Fix:** Document the heartbeat schema.

### A5. When does a non-Cursor session "end"?
- **session-loop.md:** "Before the session ends, run check-invariants"
- **Cursor:** Has `verify-on-stop.mjs` hook
- **Other runtimes:** No hook. When is "session end"? After last feature? Before human closes IDE?
- **Fix:** Define session-end criteria per runtime in session-loop.md.

### A6. `inclusion: always` frontmatter is unprocessed
- **Files with it:** `session-loop.md`, `controls.md`, `manifest.md`, `quality-gates.md`, `security-rules.md`, `asdd-lite.md`
- **No consumer:** No script reads or enforces this metadata
- **Fix:** Either parse it in check-invariants or remove it to reduce noise.

### A7. `scope_paths` semantics are unclear
- **session-loop.md:** "non-empty repo-relative files/directories"
- **check-invariants:** Rejects `..`, `.`, absolute paths, and empty components; allows only simple relative paths
- **Agents may use:** globs, wildcards, file patterns
- **Fix:** Document the exact `scope_paths` format and validation rules in session-loop.md.

### A8. Active slice row schema in PROGRESS.md is undefined
- **PROGRESS.md:** Shows a table with columns Slice, Status, Phase, Lock, Progress
- **No schema:** What values are valid? How is the Lock column formatted?
- **Fix:** Document the PROGRESS.md row schema in session-loop.md.

---

## Friction Points (make the agent's job harder)

### F1. Massive repeated boilerplate across all agent files
Every agent has ~20 lines of identical "Agent runtime (mandatory)" instructions. Changing one convention (e.g., adding a new tool) requires editing 10+ files.
- **Fix:** Extract to `.agents/agents/_runtime-template.md` and have agents reference it.

### F2. Context-window exhaustion on INIT
Every agent must read: PROGRESS.md, global manifest, per-slice manifest, steering files (5-10), domain model, features, skills index, codegraph docs. That's ~15 files before any productive work.
- **Fix:** Create a condensed `.harness/steering/INIT-summary.md` that agents read first, with deep links to full files only when needed.

### F3. Manual manifest sync ceremony is error-prone
At the end of every phase, agents must: write per-slice manifest, sync global registry row, update PROGRESS.md, update progress file, update features evidence, delete lock. Missing any step breaks invariants.
- **Fix:** Provide `node .harness/scripts/sync-manifest.mjs --slice <id> --phase <phase>` that performs all sync steps atomically.

### F4. check-invariants.mjs is 400+ lines of monolithic code
Hard to extend, hard to debug, hard to test individual checks.
- **Fix:** Split into modules: `validators/manifest.mjs`, `validators/features.mjs`, `validators/locks.mjs`, `validators/skills.mjs`.

### F5. No guidance for `check-invariants.mjs` repeated failures
session-loop.md says "fix every FAIL" but doesn't say how to diagnose systematic failures (e.g., skills index drift after module install).
- **Fix:** Add a troubleshooting section to session-loop.md or AGENTS.md.

### F6. Quality gate thresholds are scattered across files
CCS in quality-gates.md section 3, Design in section 4, Task Planning in section 5. No single table shows all thresholds.
- **Fix:** Add a "Threshold Summary" table at the top of quality-gates.md.

### F7. `check-project-config.mjs` and `check-invariants.mjs` have overlapping concerns
Both check JSON validity, path existence, and schema versions. An error in one may be caught by both or neither, inconsistently.
- **Fix:** Define clear separation: project-config checks static scaffolding; invariants checks dynamic state.

---

## Recommended Priority Order

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | **C1, C2** — Normalize Validation Agent tools | Small | High — prevents runtime failures |
| P0 | **C3** — Align QA Agent thresholds with quality-gates.md | Small | High — prevents false BLOCK/WARN |
| P0 | **G1** — Create all missing templates | Medium | High — consistent artifacts |
| P1 | **C5** — Fix CCS threshold inconsistency | Small | High — mathematical impossibility |
| P1 | **G2, G3, G4** — Create missing doc scaffolds | Small | Medium — agent compliance |
| P1 | **G7** — Add `harness-status.mjs` | Small | Medium — operational visibility |
| P1 | **G8** — Add `init-slice.mjs` | Medium | Medium — reduces setup friction |
| P2 | **F1** — Extract agent runtime boilerplate | Medium | Low-Medium — maintainability |
| P2 | **G5** — Add features.json schema | Small | Medium — validation |
| P2 | **G9** — Exclude `.DS_Store` from install | Tiny | Low — cleanliness |
| P3 | **A6** — Resolve `inclusion: always` frontmatter | Tiny | Low — remove noise |
| P3 | **F4** — Modularize check-invariants.mjs | Medium | Low — code health |

---

## Files Touched by This Audit

All files in `.harness/steering/`, `.agents/agents/`, `.harness/scripts/`, `scripts/install-into.sh`, `AGENTS.md`, and runtime wiring were reviewed.
