# Capability: Fail-open telemetry emitters, guidance activation records, and the `asdd profile` readout

**Author:** asdd-discovery-agent
**Model/Tool:** claude-opus-5-5 (Claude Code sub-agent)
**Date:** 2026-11-16
**Status:** CONVERGED — discovery gate PASS (QG-DIS-04: confidence 0.87, anti-pattern score 1.0). The open questions
Q-1…Q-15 are resolved by **PO decision 2026-11-16**: eencinas, "approve recommendations", relayed by the orchestrator.
**Inputs:**
- `.harness/specs/telemetry-emitters/intent.md`, with Mapped files widened by the PO decision.
- `docs/knowledge-base/profiling-proposals/v2.md` and `v2.review.md` (CONVERGED; guardrails `AR-1`…`AR-10` are
  binding).
- `.harness/state/telemetry/telemetry.schema.json` and `README.md`: the Phase-1 contract, which this slice must not
  change.
- The working tree at `1b1fbae`.

**Companion files:**
- [`glossary.md`](glossary.md): the ubiquitous language of this slice.
- [`anti-patterns.md`](anti-patterns.md): the anti-pattern gate report.

## Category
FEATURE

## Scope
- Pitch ID: ad-hoc (P5 roadmap `docs/ASDD-ROADMAP.md:183`, gap G15 at `:88`).
- Scope ID: none. This is one slice: Phase 2 of `telemetry-contract`, which is DONE.
- Scope class: must_have (MH-01…MH-05). The intent marks nothing as a nice-to-have.
- One observable outcome: a maintainer runs one read-only command and sees which guidance documents agents loaded per
  slice and phase, plus gate and sync timings.
  - The spans behind that report come from fail-open emitters that cannot change any gate verdict.
  - No `SCOPE_SPLIT_REQUIRED`: MH-01…MH-05 are layers of that one outcome, and AR-5 requires them to land together.
- **Scope effects of the PO decision 2026-11-16:**
  - Added: a second command, `asdd observe` (hook-only, fail-open, never blocks), plus load hooks for Claude Code and
    Cursor (Q-1).
  - Deferred: agent self-report and the turn/subagent span write path (Q-2), test spans (Q-4), read-time
    session-window attribution (Q-3, moves to `ui-insights`), and token capture (Q-12).
  - Dropped: `project.json` `commands.profile`/`capabilities.telemetry` and the `lifecycle.sh` smoke row (Q-7).

## Problem Statement
The kit ships steering files and skills to every installed project, but nothing records:
- which of them an agent actually loaded;
- how long the command gate, Verify-on-Stop, and state sync take;
- where a session stalls.

The span contract exists (`.harness/state/telemetry/telemetry.schema.json`), but no process writes a span. The
directory holds only the schema and the README, and `cli/src` contains no `telemetry` code.

As a result, kit maintainers and adopting Tech Leads cannot tell installed guidance from used guidance (the activation
gap). The downstream slices `cost-metrics` and `ui-insights` have no data to read
(`.harness/specs/cost-metrics/spec.md:14`, `.harness/specs/ui-insights/spec.md:16`).

## Business Context
P5 wave A ("measure") starts here. `cost-metrics` (P5.4) and `ui-insights` (P5.7) depend on this slice
(`docs/ASDD-ROADMAP.md:183-189`).

Product principle: "Small context: every steering line an agent loads on each session must earn its place"
(`.harness/steering/product.md`). That principle can only be checked once loads are measured.

The proposal's P16 baseline was rebuilt by hand-diffing session timestamps (`v2.md` §1.1). This slice automates that
work.

## Actors
- **Coding agent (runtime-hosted ASDD agent):**
  - Runs a slice phase under Claude Code, Cursor, or Devin (the kit's own `project.json` →
    `runtimes: [cursor, claude, devin]`).
  - Loads guidance documents and thereby triggers hooks.
  - Writes no spans itself in this slice (PO decision 2026-11-16, Q-2).
- **Runtime hook host:** the Claude Code or Cursor process that starts the kit's hook commands (`asdd gate`,
  `asdd verify`, and the new `asdd observe`) with a JSON payload on stdin. It is not a human. Its payload is the only
  evidence a hook-side emitter sees.
- **Kit maintainer:** runs `asdd profile` on the kit's own slices, lands the registration, and runs `npm test`.
- **Tech Lead (adopter):** reads the `asdd profile` output to decide which guidance earns its place and where a slice
  stalls.
- **Adopting engineer:** installs or upgrades the kit. The install provisions the telemetry location, its gitignore
  lines, and the load hooks for the runtimes the engineer selects.

## Domain Entities Involved
The entities were checked against `docs/architecture/domain-model.md`. There are seven, which is the AP-7 limit. Terms
are defined in [`glossary.md`](glossary.md).

- **Guidance document** (existing): the steering file or skill body whose load is recorded. Activation records refer
  to it by repo-relative path.
- **Session** (existing, read-only here):
  - Its `phase_started` and `phase_completed` events bound the phase windows of the profile report.
  - Telemetry never writes sessions (DOM-003, `v2.md` Invariant 7).
- **Slice** (existing): supplies the `slice_id` and `phase` evidence keys, set only when attribution is unambiguous
  (AR-10, Q-3).
- **Command gate** (existing): emits one verdict span per hook invocation, beside its verdict and never inside it.
- **Hook config** (existing): the runtime files that decide which hook events exist, and so which loads can be
  observed. This slice adds load hooks to them.
- **Installer** (existing): provisions the telemetry location, the gitignore lines, the shipped contract files, and
  the load hooks (MH-05).
- **Span** (**new entity, flagged for the Domain phase**):
  - One JSONL line in `.harness/state/telemetry/spans.jsonl`, under `telemetry.schema.json`.
  - Sub-types: producer span and activation record. The synthesized `phase` marker is computed in memory by
    `asdd profile` and never written in this slice.

## Functional Scope (Behaviors)
Each behavior names its trigger, the actor, and the observable result. Mechanism details are in the evidence sections
below.

- **B-01 (MH-01): Fail-open emit.** WHEN any kit process hands a span to the telemetry library, the library:
  - appends it as one LF-terminated line of at most 4,096 bytes, in a single append-mode write;
  - returns without throwing;
  - never changes the caller's exit code, stdout, or verdict;
  - returns `false` silently when the telemetry location is missing or unwritable.

  A conformance test proves p99 latency ≤ 50 ms (AR-1).
- **B-02 (MH-02, wave 2): Command gate verdict span.** WHEN the runtime hook host invokes the command gate, the gate
  emits exactly one `kind:"command"` span for that invocation.
  - The span carries the verdict, the gate's own duration, the runtime (`claude` or `cursor`), and a pattern-class
    `command_label`. It never carries command text.
  - The verdict JSON is byte-identical with and without telemetry (AR-1).
  - No `kind:"test"` span is emitted (PO decision 2026-11-16, Q-4).
- **B-03 (MH-02, wave 3): Verify-on-Stop span.** WHEN the runtime hook host invokes Verify-on-Stop, the hook emits one
  `hook` span per invocation.
  - The span carries the outcome (pass, block, advisory, guard-skip, or could-not-run), the `check --live` exit code,
    and a FAIL-count `violations_count`.
  - The block or allow behavior is unchanged.
- **B-04 (MH-02, wave 5): Sync span.** WHEN `asdd sync` runs, it emits:
  - one `sync` span for the run;
  - one child span for the learning summary child;
  - one child span for the knowledge-index regeneration.

  This makes the sync cost at each checkpoint visible (G-TEL-9).
- **B-05 (MH-02, wave 6): Runtime contract for observable loads.** WHEN a coding agent follows the runtime template,
  the template tells it to load steering and skill bodies with the runtime's file-read or skill tool, not with a shell
  command, so the load hooks can observe the load.
  - PO decision 2026-11-16 (Q-2): the turn and subagent span emission that MH-02 names is **deferred**. No self-report
    write path exists in this slice, and spans are never synthesized from session files (D-8).
- **B-06 (MH-03): Activation records.** WHEN the runtime hook host reports that a coding agent read a guidance document
  under `.harness/steering/`, or read or invoked a skill under `.agents/skills/<name>/` (runtime aliases are normalized
  to that path), `asdd observe` emits one activation record. The record holds:
  - the repo-relative path;
  - the runtime;
  - the runtime session id;
  - the agent id, only when the payload carries one (otherwise `unknown`);
  - `slice_id` and `phase`, only when unambiguous, meaning exactly one `in_progress` slice or an explicit env var
    (otherwise unattributed).

  `asdd observe` always answers allow, never blocks, and never fails the host. Loads through shell commands, and
  every load on a runtime without load hooks, count as `unknown`, never as "not loaded" (Q-1, Q-3, Q-8, Q-13).
- **B-07 (MH-04): Telemetry validator.** WHEN `asdd check` runs, the telemetry validator checks the schema file and the
  stream's tail: at most the last 500 lines or 256 KB.
  - Findings are WARN only: one WARN per malformed line, naming its line number.
  - An absent telemetry location is legal and produces no output.
  - `check-invariants` only wires this validator and emits no per-validator spans (Q-15).
  - The verdict of `asdd check` never changes because of telemetry (D-6).
- **B-08 (MH-04): `asdd profile` readout.** WHEN a kit maintainer or Tech Lead runs `asdd profile --slice <id>`,
  `--bottlenecks`, or `--json`, the command prints the following from the stream's tail (at most 500 lines or 256 KB)
  plus the session phase events:
  - phase durations;
  - gate, hook, and sync latency (p50 and p95);
  - for each phase, an activation table:
    - expected steering (from frontmatter tags) against observed loads;
    - skill bodies loaded against skills installed;
    - files loaded with no tool call (`CLAUDE.md`, `alwaysApply` rules, skill descriptions), shown as "configured,
      not observed" and computed from configuration when the report runs;
    - `unknown` for each runtime without load hooks.
  - a deterministic `bottleneck_score`.

  `--bottlenecks` computes in memory only (Q-11). The command writes nothing: no span, signal, session, manifest,
  registry, or feature file. It makes no network call. It exits `0` on a report, `2` on a usage error, and `3` when
  no spans exist for the target (D-5).
- **B-09 (MH-05): Atomic registration.** WHEN the slice lands, one change registers:
  - the `profile` and `observe` command entries;
  - the new test files in the `npm test` script;
  - the shipped source `cli/scaffold/state/telemetry/**` and one `HARNESS_FILES` row;
  - the gitignore lines for `spans.jsonl` and the rollups (kit `.gitignore` and consumer `ensureGitignore`);
  - the Claude Code and Cursor load-hook wiring (installer and runtime recipes);
  - the regenerated vendored copies `tools/*/src/harness/telemetry-lib.mjs`;
  - restamped versions;
  - the README command rows.

  An installed project gets no telemetry data file in git and no kit-only artifact (AR-5, product rule 2, Q-6).

## Out of Scope
- Network I/O of any kind (no-go; Invariant 3).
- Raw command text, file contents, or absolute paths in any span. Spans carry labels and repo-relative paths only, and
  the kit never parses command text to find loads (no-go DOM-005; Q-8).
- Forging or writing session events, the manifest, the registry, features, or `mode` (no-go DOM-003; D-7).
- Trace topology (`trace_id`/`parent_span_id`) as a detection or attribution key (no-go AR-10).
- Any UI (`ui-insights`), and any change to `telemetry.schema.json`.
- Deferred by PO decision 2026-11-16:
  - Agent self-report and turn/subagent spans (Q-2).
  - `kind:"test"` spans and `measureCommand` (Q-4).
  - Read-time correlation of runtime sessions to session-event windows (Q-3, moves to `ui-insights`).
  - Token and cost capture (Q-12; `cost-metrics` will report it as absent).
  - Detection spans and `telemetry:<H-*>` learning signals (Q-11).
- Dropped by PO decision 2026-11-16 (Q-7): `project.json` `commands.profile`/`capabilities.telemetry` and a
  `lifecycle.sh` smoke row.
- Load hooks for Devin, OpenCode, Kimi, Junie, and Kiro. They have no hooks wired (`cli/src/install/runtimes.mjs:230-275`),
  so their loads show as `unknown`.
- Writing spans for files loaded without a tool call (Q-9). These are computed at read time only.
- A steering or quality-gate rule for the tail bounds. They are code constants (Q-10).

## Non-Functional Requirements
### Performance
- `emit()`: p99 ≤ 50 ms per call, proven by a conformance test (AR-1). Each line is at most 4,096 bytes, written in one
  write per span.
- Command gate: the verdict output is byte-identical with and without telemetry. Added wall time stays inside the
  existing 30 s hook timeout (`cli/runtimes/cursor/hooks.json`, `timeout: 30`).
- `asdd observe` load hook: one emit per event and p99 ≤ 50 ms of added latency per event (PO decision 2026-11-16,
  Q-14). It is fail-open: never `failClosed`, always allow, and it exits 0 even on internal errors.
- Reads by `asdd profile` and the validator: at most the last 500 lines or 256 KB of the stream, kept as code
  constants and never a full-stream scan (AR-3; PO decision 2026-11-16, Q-10).
### Security
- Data class: Internal. Spans are local-only and gitignored, and are never published or transmitted.
- SEC-05: spans hold no tokens, secrets, command text, file contents, or transcript paths.
  - `command_label` is a pattern class (`command-gate.mjs:61-71` precedent).
  - Paths are repo-relative.
  - Opaque runtime session ids and agent ids are allowed (A-10).
- Producers never set evaluator-reserved attributes (`heuristic`, `trigger_span_id`, `source`) (DOM-006).
- The command gate stays fail-closed for its verdict. Telemetry rides beside it, and its failure is silent. The load
  hook is the opposite: fail-open, because it guards nothing.

## Success Metrics
- The AR-1 conformance test is green:
  - p99 emit ≤ 50 ms;
  - fail-open on a missing directory, a read-only filesystem, and a malformed span;
  - gate verdicts byte-identical (0 differences over the gate test corpus).
- Span count: exactly 1 span per gate invocation, per Verify-on-Stop invocation, and per observed guidance load.
- `asdd observe` load-hook latency is p99 ≤ 50 ms, measured by a test over the captured-payload fixtures.
- On a full slice run under Claude Code, `asdd profile --slice <id>` lists at least one observed steering activation
  for every phase that has session events and an unambiguous attribution. Devin and the other hookless runtimes show
  `unknown` and never an observed value.
- `npm test` passes, including `asdd kit vendor --check` and `asdd kit self --check` (`package.json:36`).
  `cli/test/install.sh` shows no kit-only artifact in an installed project.
- `asdd check` has the same exit code with a corrupt `spans.jsonl` and with no file (WARN only).

---

## Current implementation audit (evidence; the working tree at `1b1fbae`)

| Area | Status | Evidence | Decision it informs |
|---|---|---|---|
| Span emission anywhere | missing | `.harness/state/telemetry/` holds only `README.md` and `telemetry.schema.json`; `cli/src` has no `telemetry` code | B-01…B-09 are all new |
| Command gate | implemented (verdict); telemetry missing | `cli/src/harness/command-gate.mjs:110-142` (`runHook`), `:145-159` (`runHookCli`, which denies on error). Allowed commands record nothing; denials go to learning by label only (`:74-83`, `:119`). Test-class patterns at `:47-49` | B-02 hooks into `runHook`. The label comes from the matched pattern class |
| Gate fires before execution | conflicts with v2 D-3; resolved (Q-4) | Claude `PreToolUse` and Cursor `beforeShellExecution` (`.claude/settings.json`, `.cursor/hooks.json`) run before the command, so the gate cannot see its duration, exit code, or test counts | The gate emits verdict spans only. Test spans are deferred |
| Verify-on-Stop | implemented; telemetry missing | `cli/src/harness/verify-on-stop.mjs`: `:46-50` (Cursor `status` aborted/error early exit), `:52-57` (Claude `stop_hook_active` guard), `:70-75` (`spawnSync check --live`, 30 s timeout, sets `HARNESS_RUNTIME`), `:92-97` (advisory), `:99-104` (block). A top-level script with several `process.exit(0)` calls | B-03 must emit before each exit path |
| Invariant gate | implemented | `cli/src/harness/check-invariants.mjs`: `:70-79` (10 validators, run serially), `:106-115` (lazy learning import, the fail-open precedent), `:116-119` (exit 1 on FAIL) | B-07 wiring point. No per-validator spans (Q-15) |
| State sync | implemented; telemetry missing | `cli/src/harness/sync-state.mjs`: `:365-376` (`syncSlice`), `:380-388` (knowledge, in-process dynamic import), `:393-403` (learning child, `spawnSync`, 60 s), `:450-507` (`main`) | B-04 span boundaries |
| Vendored copies | resolved (Q-5) | `cli/src/kit/vendor.mjs:20-24`: `command-gate.mjs` is a jev-gate entry, and `sync-state.mjs` is in all three tool closures. `closure()` (`:30-42`) follows static and dynamic relative imports | `tools/*/src/harness/telemetry-lib.mjs` copies are mapped; they are generated only, never hand-edited (R-1) |
| MCP reuse of gate | constraint | jev-gate vendors `command-gate.mjs` for `checkCommandSafety` (`vendor.mjs:22`) | Emit only on the hook CLI path (`runHook`), never in `checkCommandSafety` |
| Command registry | implemented | `cli/src/harness/commands.mjs:5-66`; neither `profile` nor `observe` exists | B-09 adds two entries. `skill-eval` and `asdd-ui` also edit this file (R-5) |
| Publish boundary | differs from v2 G-TEL-7; resolved (Q-6) | `package.json` `files[]` (`:9-30`) has no `.harness/**` entry | No `files[]` negation is needed |
| CLI shipping | differs from v2 G-TEL-6/8; resolved (Q-6) | `cli/src/kit/versions.mjs:70` ("The CLI itself is not copied into projects"); `cli/src/kit/build.mjs:1-4` | Scripts need no installer copy or stamp rows |
| Installer scaffold | implemented; no telemetry | `cli/src/install/phases.mjs:20-29` (`HARNESS_FILES`), `:166-190` (`installHarnessScaffold`); `cli/scaffold/**` is walked by `versions.mjs:73-75` | Add `cli/scaffold/state/telemetry/**` and one `HARNESS_FILES` row (Q-6) |
| Gitignore provisioning | implemented; no telemetry | `cli/src/install/index.mjs:105-121` (`ensureGitignore`); kit `.gitignore:14-17` | Add lines for `spans.jsonl` and the rollups, in the kit and for consumers |
| Hook wiring (installer) | implemented for gate and stop; no load hooks | `cli/src/install/runtimes.mjs:13-22` (`hookCmds`), `:122-160` (Cursor), `:163-195` (Claude); `cli/runtimes/cursor/hooks.json` | Add fail-open load hooks (Q-1). Both files are now mapped |
| Runtime contract | partial | `cli/agents/_runtime-template.md:17` (lists loaded skills in the final chat message; that list never reaches state), `:24-25` (session rule). The `.agents/` copy is identical (`diff`) | B-05 adds the read-tool rule. Self-report is deferred (Q-2) |
| Expected steering set | implemented (kit tooling) | `cli/src/kit/generate-runtime-steering.mjs:12,21` uses `parseSteeringFrontmatter` and `loadSteeringRegistry` (`cli/src/harness/validators/steering-tags.mjs`) | B-08 computes "expected" from the same frontmatter |
| Hook payload verification | partial | Repo tests pin only `hook_event_name`, `tool_name`, `tool_input.command` (`cli/test/install.sh:290-291`, `command-gate.test.mjs:48`), and `stop_hook_active` (`cli/test/lifecycle.sh:97-98`) | A-01 and A-02 stay risks; captured fixtures in Design (R-3) |
| Harness state | in progress | Slice manifest: `phase: discovery`, `mode: full`. `telemetry-contract` is DONE | Next agent: `asdd-spec-agent` |

## MH-03: Load-detection evidence per runtime (as decided)

Two kinds of evidence appear in this table:
- **Verified** means the repo's code or tests show it.
- **Vendor-documented** is not verified in this repo. It stays an explicit risk (A-01, A-02, R-3) until Design captures
  real payloads as test fixtures.

| Runtime | Signal available | Detection method (PO decision 2026-11-16) | Recorded as `unknown` |
|---|---|---|---|
| **Claude Code** | **Verified:**<br>• `PreToolUse` (matcher `Bash`) runs `asdd gate`, and `Stop` runs `asdd verify` (`.claude/settings.json`; `runtimes.mjs:163-195`).<br>• Payload fields `hook_event_name`, `tool_name`, `tool_input.command`, and `stop_hook_active`.<br>• `.claude/skills` links to `../.agents/skills`.<br>**Vendor-documented:** `PostToolUse` carries `tool_name` and `tool_input` (`file_path` for `Read`, the skill name for `Skill`), plus `session_id` | A new `PostToolUse` hook (matcher `Read\|Skill`) runs `asdd observe`.<br>• It filters reads to `.harness/steering/**` and `.agents/skills/**`, with aliases normalized.<br>• It emits one activation record: `kind:"tool"`, repo-relative `target_path`, `writer:"runtime-hook"`, `trace_source:"self"`, and `session_id` as an attribute | • Loads made through a shell command (Q-8).<br>• The agent id, when the payload lacks it (Q-13).<br>• `slice_id`/`phase`, when attribution is ambiguous (Q-3).<br>• `CLAUDE.md` and skill descriptions are shown as "configured, not observed" (Q-9) |
| **Cursor** | **Verified:**<br>• `beforeShellExecution` runs `asdd gate`, and `stop` runs `asdd verify` (`.cursor/hooks.json`, `cli/runtimes/cursor/hooks.json`).<br>• Payload `command` and stop `status`.<br>• `asdd-steering.mdc` has `alwaysApply: true`.<br>**Vendor-documented:** `beforeReadFile` (file path), `conversation_id` | A new `beforeReadFile` hook runs `asdd observe`. It always allows, is fail-open, and is never `failClosed`. It uses the same filter and record shape, with `runtime:"cursor"` and `conversation_id` as the session key | • Whether the agent's read tool triggers `beforeReadFile` (R-3).<br>• How skill bodies are loaded, when not through a read.<br>• Loads made through a shell command, the agent id, and ambiguous slice/phase.<br>• `alwaysApply` rules are shown as "configured, not observed" |
| **Devin** | **Verified:** no hooks are wired (`runtimes.mjs:264-268`; `cli/runtimes/devin/README.md`) | None. Self-report is deferred (Q-2) | All loads; never shown as "not loaded" |
| OpenCode, Kimi, Junie, Kiro | No hooks are wired (`runtimes.mjs:230-275`) | None | All loads |

**Schema fit:** verified against `telemetry.schema.json`, and no schema change is needed.
- An activation record is a `kind:"tool"` span. `tool_name`, `target_path`, `target_path_exists`, and
  `result_size_bytes` are declared attributes.
- The runtime session id, the agent id, and the provenance go in `attributes`, which allows additional properties.
- One record per load keeps every line under 4 KB (R-4 resolved by this choice).

## Assumptions
The PO accepted assumptions A-01…A-10 as stated (PO decision 2026-11-16). A-01 and A-02 stay explicit risks (R-3).

- **A-01:** The Claude Code `PostToolUse` payload for `Read` and `Skill` carries `tool_name` and `tool_input` (a file
  path or skill name) and `session_id`. **Risk:** this is unverified in the repo. Design settles it with captured
  fixtures.
- **A-02:** Cursor's `beforeReadFile` carries a file path and `conversation_id`, and the agent's read tool triggers it.
  **Risk:** this is unverified in the repo. Design settles it with captured fixtures.
- **A-03:** Devin exposes no hook the kit can use. Its loads are `unknown`.
- **A-04:** The expected steering set per phase comes from frontmatter `inclusion` and `tags`, read by
  `steering-tags.mjs`.
- **A-05:** Skill loads are recognized by path: `.agents/skills/<name>/SKILL.md`, its `references/`, and the
  `.claude`, `.cursor`, and `.devin` skill aliases, normalized. Reading `skills.md` counts as a steering load.
- **A-06:** Hook processes never inherit `HARNESS_TRACE_ID`. Their spans are self-rooted, and correlation uses
  evidence fields only (AR-10).
- **A-07:** Telemetry is opt-in by the directory existing. The installer creates the directory, and there is no
  capability switch (consistent with Q-7).
- **A-08:** The kit's own `.gitignore` gets the same telemetry lines as consumers.
- **A-09:** `asdd profile` writes nothing (confirmed by Q-11).
- **A-10:** Opaque runtime session ids and agent ids may be stored. Transcript paths and absolute paths may not.

## Risks
- **R-1: Vendored copies and MCP builds.** The generated `tools/*/src/harness/telemetry-lib.mjs` copies keep
  `asdd kit vendor --check` green.
  - Open: whether the MCP servers (`tools/{jev-gate,knowledge,spec-drift}`) need a rebuild so their `dist/` bundles
    pick up the new import. `dist/` is gitignored (`tech.md`), and servers that are not built exit with "not built".
    Design confirms this.
  - Emission must stay out of `checkCommandSafety`, so MCP chat calls never emit spans.
- **R-2: No test spans.** H-BOOT and H-LOOP inputs do not exist yet, because test spans are deferred (Q-4).
  `--bottlenecks` ranks gate, hook, sync, and phase durations only. The report must say that test thrash is not
  measured.
- **R-3: Unverified hook payloads (A-01, A-02).** Design captures real payloads into `*.test.mjs` fixtures before it
  commits to field names. If a field is missing, the record omits it and the profile shows `unknown`.
- **R-4: Resolved.** One record per load keeps every line under 4 KB.
- **R-5: Shared registration files.** `commands.mjs`, the `package.json` test script, `cli/versions.json`, and
  `README.md` are also mapped by `skill-eval` and `asdd-ui`. The order in which the worktrees merge matters.
- **R-6: Resolved (Q-10).** The tail bounds are code constants. The H-* thresholds are not applied in this slice
  (Q-11 computes in memory; Design decides whether the v2 §4 constants live in code).
- **R-7: Scope reduction of MH-02.** The intent's runtime-template turn/subagent emitter is deferred (Q-2). B-05
  keeps only the observable-load rule. This deviation from intent MH-02's wording is approved by the PO decision.
- **R-8: Hook firing volume.** A `PostToolUse` hook with matcher `Read` fires on every read, including non-guidance
  files. The filter must exit early, within the 50 ms p99 budget, without emitting.

## Open Questions
None blocking. All of Q-1…Q-15 are resolved by PO decision 2026-11-16:

| Question | Decision |
|---|---|
| Q-1 Load signal | Yes: fail-open load hooks. Claude Code `PostToolUse` (matcher `Read\|Skill`) and Cursor `beforeReadFile` (always allow) run `asdd observe`. Mapped files are widened to `.claude/settings.json`, `.cursor/hooks.json`, and `cli/runtimes/**` hook wiring |
| Q-2 Self-report | No write path in this slice. Hookless runtimes show `unknown`. Self-report is deferred |
| Q-3 Attribution | (a): set `slice_id`/`phase` only when unambiguous (one `in_progress` slice or an explicit env var); otherwise leave the record unattributed. Read-time correlation is deferred to `ui-insights` |
| Q-4 Test commands | (a): verdict spans only. `kind:"test"` is deferred |
| Q-5 Vendoring | Allow the generated `tools/*/src/harness/telemetry-lib.mjs` copies (mapped; never hand-edited). MCP rebuild is a risk (R-1) |
| Q-6 Registration | MH-05 is narrowed to: command entries, the test script entry, `cli/scaffold/state/telemetry/**`, one `HARNESS_FILES` row, gitignore lines, a versions restamp, and the README row |
| Q-7 Config and smoke row | Dropped |
| Q-8 Shell reads | `unknown`. Command text is never parsed |
| Q-9 Files loaded without a tool call | Shown as "configured, not observed", computed by `profile` when it runs; no spans |
| Q-10 Tail bounds | 500 lines / 256 KB, as code constants; no steering change |
| Q-11 `--bottlenecks` | Computes in memory only and writes nothing |
| Q-12 Tokens | Out of scope. `cost-metrics` reports them as absent |
| Q-13 Granularity | Per runtime session. The agent id is recorded when the payload carries it; otherwise `unknown` |
| Q-14 Load-hook budget | p99 ≤ 50 ms per event, fail-open |
| Q-15 Per-validator spans | None. `check-invariants` only wires the telemetry validator |

Left to Design (these do not block discovery):
- The name of the explicit attribution env var (Q-3).
- The file that hosts `asdd observe` (mapped as `cli/src/harness/telemetry-observe.mjs`; Design may fold it into
  `telemetry-lib.mjs`).
- Whether the MCP servers need a rebuild (R-1).
- The captured payload fixtures (R-3).

## Anti-pattern gate
Full report: [`anti-patterns.md`](anti-patterns.md). Score 1.0, with no unresolved finding. AP-4 ("bounded tail") is
resolved by the 500-line / 256 KB constants (Q-10).

## Confidence Score
0.87

Uncertainty factors (QG-DEC-10):
- A-01 and A-02: the hook payload shapes are vendor-documented and unverified in the repo. They are mitigated by
  captured fixtures in Design and by `unknown` for missing fields.
- R-1: whether the MCP servers need a rebuild.
- R-7: a deliberate, PO-approved reduction of the intent's MH-02 runtime-template emitter.
- Seven new domain terms are flagged for the Domain phase ([`glossary.md`](glossary.md)).

Grounding:
- Every behavior traces to a cited code path, the ratified contract, or the PO decision of 2026-11-16.
- The schema expresses every behavior without a change.
- The anti-pattern score is 1.0.
