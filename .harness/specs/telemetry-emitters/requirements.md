# Requirements: Fail-open telemetry emitters, guidance activation records, and the `asdd profile` readout

**Author:** asdd-spec-agent
**Model/Tool:** claude-opus-5-5 (Claude Code sub-agent)

Spec version: 1.1.0
Status: READY
Scope: ad-hoc (P5 roadmap, gap G15) / no scope ID (must_have: MH-01…MH-05)
Governance Mode: TECH-LEAD-REVIEW (raised from PEER-REVIEW-ONLY by validation, §11)
Spec confidence score: 0.88
Uncertainty Factors:
1. Hook payload shapes A-01 (Claude Code `PostToolUse` for `Read`/`Skill`) and A-02 (Cursor `beforeReadFile`), and the
   runtimes' reaction to a hook's exit code, are vendor-documented and unverified in the repo. REQ-016 pins the
   absent-field behavior and REQ-018 requires captured fixtures with provenance, so the field names are a Design risk
   (R-3, RSK-004), not a spec gap.
2. Six slice terms are not yet in `docs/architecture/domain-model.md`: the entities **Span**, **Activation record**,
   **Profile report**, **Phase marker**, **Trace**, and the actor **Runtime hook host** (all defined in
   `glossary.md`). The Domain phase (mode `full`) rules on them (`QG-DMN-02`; validation DOM-001…DOM-008).
3. Open items OI-1…OI-7 (end of file) are delegated to Design or noted for the PO. None changes a MUST outcome or the
   schema.

Last updated: 2026-11-16
Owner: Tech Lead (squad; PO decisions by eencinas, 2026-11-16)

**Sources:** [`capability.md`](capability.md) (B-01…B-09, PO decision 2026-11-16 on Q-1…Q-15),
[`intent.md`](intent.md) (MH-01…MH-05, no-gos, Mapped files including both 2026-11-16 widenings),
[`spec-validation-report.md`](spec-validation-report.md) v1.0 and the PO resolutions of 2026-11-16 on it,
`docs/knowledge-base/profiling-proposals/v2.md` §7–§10 (guardrails AR-1…AR-10 are binding unless deferred below),
`.harness/state/telemetry/telemetry.schema.json` (fixed contract, `schema_version "1.0"`).
**Glossary:** [`glossary.md`](glossary.md). **Anti-pattern gate:** [`anti-patterns.md`](anti-patterns.md).

## Changelog

### 1.1.0 (2026-11-16): validation revision

Applies the PO's approval ("approve recommendations", eencinas, 2026-11-16, relayed by the orchestrator) of the
resolutions for `spec-validation-report.md` v1.0.

- **CON-001 (HIGH):** REQ-005 now sets `parent_span_id: null` on the root span of each invocation only. Child spans
  reference their run span (REQ-010).
- **NFR-002 (HIGH):** REQ-002 requires producers to load telemetry so that a load failure is caught. REQ-009, REQ-010
  and REQ-019 gain the load-failure / failed-emit clause. Verify-on-Stop's own pre-existing crash behavior is out of
  scope (KPI-1).
- **NFR-003 (HIGH):** REQ-025 requires the installed load-hook entry to exit 0 with an allow answer when `asdd` cannot
  be resolved, asserted in `cli/test/install.sh`.
- **AMB-001 (HIGH; PO answer to Q-14):** REQ-018 measures in-process handler time (handler entry to response
  written), with at least 200 samples per fixture class, gated at p99 ≤ 50 ms. Whole-process wall time is recorded in
  the test output and is not gated.
- **TRC-001 (HIGH):** AR-3 stream rotation, the `profiling.json` rollup, and H-* findings in `--slice` output are
  explicitly deferred (PO decision). The matrix shows AR-3 as partial plus deferred.
- **RSK-001 / AP-7 (HIGH):** accepted by TL/PO override; the slice is not split. Recorded in `anti-patterns.md`.
- **MEDIUM:**
  - CON-002: absent payload fields are left out; the profile renders them `unknown` (REQ-016, REQ-021).
  - CON-003: the report prints a three-state legend (REQ-021).
  - CON-004: exit `3` only when there are neither spans nor session events for the target (REQ-023).
  - AMB-002: the emit latency test uses a writable stream (REQ-003).
  - AMB-003: closed `command_label` set (REQ-007).
  - AMB-004: skill names not installed under `.agents/skills/` give no record (REQ-013).
  - AMB-005: surface share defined (REQ-020).
  - ACT-001: attribution env var contract (REQ-017; the name stays OI-1).
  - TRC-004: AR-10 pinned for `asdd profile` (REQ-020).
  - Applied as wording fixes within the spec agent's decision rights: AMB-006 (runtime source and one column per
    runtime, REQ-021) and AMB-007 (fixture provenance, REQ-018).
- **LOW:**
  - AMB-008: token-based check (REQ-004).
  - DUP-001: one normative criterion each; cross-references in REQ-022 and REQ-025.
  - DOM-008: header counts corrected.
  - EARS-001: ubiquitous form for the artifact criteria of REQ-011, REQ-012 and REQ-024.
- **Mapped files (TRC-003):** test locations now name the PO-widened paths: `command-gate.test.mjs`,
  `sync-state.test.mjs`, `verify-on-stop.test.mjs`, `cli/test/install.sh`, and `cli/test/fixtures/telemetry/**`.
- **Noted, not applied:** TRC-002 (AR-5 sensor) is OI-7 and needs a PO decision. TRC-005, ACT-002, NFR-001,
  DOM-001…DOM-007, RSK-002…RSK-004 stay with the Domain phase or Design (see Open items).

### 1.0.0 (2026-11-16)

Initial spec: REQ-001…REQ-025.

---

**Conventions used in the criteria:**
- "the telemetry location" is `.harness/state/telemetry/`; "the stream" is `.harness/state/telemetry/spans.jsonl`.
- "the tail" is the last 500 lines or the last 262,144 bytes (256 KB) of the stream, whichever is smaller (Q-10).
- "telemetry state" is one of: location absent; location present and stream absent; stream present and writable;
  stream or location unwritable.
- Attribute names not declared in the schema (verdict, outcome, runtime session id, agent id) live in `attributes`,
  which allows additional properties; Design fixes the key names (OI-4). No requirement needs a schema change.
- The ubiquitous EARS form ("The <artifact> shall …") is used for criteria about a delivered artifact; each names the
  check that verifies it.

---

## Feature: Fail-open emit library (MH-01)

### REQ-001: One span is one append-mode line

**Category:** FEATURE
**Source:** MH-01
**Description:** The telemetry library writes each accepted span as one LF-terminated JSON line of at most 4,096 bytes
in a single append-mode write to the stream.
**Actor:** Any kit process that hands a span to the telemetry library (command gate, Verify-on-Stop, `asdd sync`,
`asdd observe`)

**Acceptance Criteria (EARS):**
- When a kit process calls `emit()` with a span whose serialized line is at most 4,096 bytes including the LF, and the
  telemetry location exists and is writable, the telemetry library shall append exactly that one line to the stream
  with a single write call opened in append mode and shall return `true`.
- When `emit()` appends a line, the telemetry library shall leave every earlier byte of the stream unchanged.
- When 20 processes call `emit()` concurrently on the same stream, the telemetry library shall produce 20 complete
  lines, each of which parses as JSON.
- If the telemetry location does not exist, then the telemetry library shall not create it and shall return `false`.

**Domain Entities:** Span (new, flagged)
**Non-Functional Classification:** RELIABILITY, PERFORMANCE
**Priority:** MUST
**Traceability:** capability.md B-01; intent MH-01; v2.md D-3, Invariant 4; assumption A-07 (opt-in by directory)

### REQ-002: Emit never changes the caller

**Category:** FEATURE
**Source:** MH-01
**Description:** A telemetry failure of any kind, including a failure to load the telemetry library, leaves the
calling process's return value, exit code, stdout, stderr, and verdict exactly as they would be without telemetry.
**Actor:** Any kit process that hands a span to the telemetry library

**Acceptance Criteria (EARS):**
- If the telemetry location is missing, then `emit()` shall return `false` without throwing and without writing to
  stdout or stderr.
- If the stream or the telemetry location is unwritable (read-only file or directory), then `emit()` shall return
  `false` without throwing and without writing to stdout or stderr.
- If the serialized span exceeds 4,096 bytes including the LF, then `emit()` shall write nothing and shall return
  `false` without throwing.
- If the span cannot be serialized (for example a circular reference or a non-object argument), then `emit()` shall
  write nothing and shall return `false` without throwing.
- If any internal step of `emit()` throws, then `emit()` shall catch the error, shall return `false`, and shall leave
  `process.exitCode` unchanged.
- When a kit process calls `emit()`, the telemetry library shall not return a promise that can reject and shall not
  register a listener, timer, or handle that outlives the call.
- If the telemetry library is missing or fails to load, then each producer shall catch the load failure and continue
  without telemetry: no producer loads the telemetry library through a static import whose failure can crash it
  (lazy-import precedent `cli/src/harness/check-invariants.mjs:106-115`).

**Domain Entities:** Span (new, flagged)
**Non-Functional Classification:** RELIABILITY
**Priority:** MUST
**Traceability:** capability.md B-01, NFR Performance; intent MH-01; v2.md AR-1 (Blocker), D-3, Invariants 1–2;
validation NFR-002

### REQ-003: Emit latency is proven by test

**Category:** FEATURE
**Source:** MH-01
**Description:** A conformance test proves that `emit()` adds at most 50 ms at the 99th percentile while it actually
appends.
**Actor:** Kit maintainer (runs `npm test`)

**Acceptance Criteria (EARS):**
- When `npm test` runs, the AR-1 conformance test shall call `emit()` at least 1,000 times with spans of up to
  4,096 bytes against a writable stream in a temporary telemetry location, every call appending a line and the stream
  growing across the run. The test shall fail when any call does not append or when the 99th-percentile wall time per
  call exceeds 50 ms.
- When `npm test` runs, the AR-1 conformance test shall exercise the missing-location, read-only, oversized-span, and
  load-failure cases of REQ-002 and shall fail when any of them throws, writes output, or changes `process.exitCode`.

**Domain Entities:** Span (new, flagged)
**Non-Functional Classification:** PERFORMANCE
**Priority:** MUST
**Traceability:** capability.md B-01, Success Metrics; intent MH-01; v2.md AR-1; validation AMB-002

### REQ-004: Spans carry labels and repo-relative paths only

**Category:** FEATURE
**Source:** MH-01, intent no-gos
**Description:** No span holds raw command text, file contents, absolute paths, transcript paths, tokens, or secrets,
and no telemetry code path performs network I/O. This is the normative criterion for "no network" across the slice.
**Actor:** Every telemetry producer (command gate, Verify-on-Stop, `asdd sync`, `asdd observe`) and reader (telemetry
validator, `asdd profile`)

**Acceptance Criteria (EARS):**
- When the command gate emits a span for a command containing the marker token `SECRET-MARKER-123`, the emitted line
  shall contain no whitespace-separated token of the command text, other than the tokens of `command_label`.
- When `asdd observe` receives a payload that carries `transcript_path` and `cwd`, the emitted activation record shall
  not contain either value.
- When a producer records a file path, the path in the span shall be relative to the repository root and shall not
  start with `/`, a drive letter, or `~`.
- If a path or skill name in a hook payload resolves outside the repository root, or contains a `..` segment, `:`, or
  `/` (skill names only), then `asdd observe` shall emit no activation record for it.
- When any telemetry code path runs (the telemetry library, the producer emitters, `asdd observe`, the telemetry
  validator, `asdd profile`), it shall open no network socket and shall make no HTTP request.

**Domain Entities:** Span (new, flagged), Command gate
**Non-Functional Classification:** SECURITY (SEC-05, data class Internal)
**Priority:** MUST
**Traceability:** capability.md Out of Scope, NFR Security; intent no-gos (network I/O, raw command text); v2.md
DOM-005, Invariant 3; assumption A-10; validation AMB-008, AMB-004, DUP-001

### REQ-005: Spans conform to the fixed schema and carry provenance

**Category:** FEATURE
**Source:** MH-01, MH-02
**Description:** Every span a producer emits validates against `telemetry.schema.json` 1.0, records how its ids were
obtained, and never sets an evaluator-reserved attribute.
**Actor:** Every telemetry producer

**Acceptance Criteria (EARS):**
- When a producer emits a span, the line shall validate against `.harness/state/telemetry/telemetry.schema.json`
  (`schema_version "1.0"`, top-level `additionalProperties: false`) without any change to that schema file.
- When a producer emits a span, the span shall carry `attributes.trace_source` with one of `env` or `self`, and shall
  carry `writer` naming the emitting process.
- When a producer invocation starts without `HARNESS_TRACE_ID` in its environment, its root span shall carry a
  self-minted `trace_id`, `parent_span_id: null`, and `attributes.trace_source: "self"`.
- When a producer invocation emits a child span (for example the `asdd sync` children of REQ-010), the child span
  shall carry the root span's `trace_id`, the same `attributes.trace_source` as the root span, and a `parent_span_id`
  equal to the root span's `span_id`.
- When a producer emits a span, the span shall not set `attributes.heuristic`, `attributes.trigger_span_id`, or
  `attributes.source`.
- When a producer emits a span, it shall not emit `kind` values `phase`, `turn`, `subagent`, or `test`.

**Domain Entities:** Span (new, flagged), Trace (new, flagged)
**Non-Functional Classification:** DATA INTEGRITY
**Priority:** MUST
**Traceability:** capability.md Domain Entities (Span), NFR Security (DOM-006), Out of Scope (Q-2, Q-4); v2.md D-1,
§2.1 span-tree shape, Invariant 9, RV2-IC-1; assumption A-06; validation CON-001

### REQ-006: Telemetry never writes slice state

**Category:** FEATURE
**Source:** intent no-gos (session-event forging)
**Description:** No telemetry code path writes or edits a session, manifest, registry, feature tracker, `mode` field,
or learning signal. This is the normative state-isolation criterion; REQ-022 adds the stricter "writes nothing" rule
for `asdd profile`.
**Actor:** Every telemetry producer and reader

**Acceptance Criteria (EARS):**
- When any telemetry code path runs (the telemetry library, the producer emitters, `asdd observe`, the telemetry
  validator, `asdd profile`), it shall create, modify, or delete no file under `.harness/state/slices/`, no
  `.harness/state/registry.json`, no `.harness/state/manifest.json`, no file under `.harness/features/`, and no file
  under `.harness/state/learning/`.
- When the telemetry library writes, it shall write only to `.harness/state/telemetry/spans.jsonl`.

**Domain Entities:** Session, Slice, Feature, Span (new, flagged)
**Non-Functional Classification:** DATA INTEGRITY
**Priority:** MUST
**Traceability:** capability.md Domain Entities (Session), Out of Scope (DOM-003, D-7); intent no-gos; v2.md D-7,
Invariants 5 and 7

---

## Feature: Producer spans beside the gate paths (MH-02)

### REQ-007: Command gate verdict span

**Category:** FEATURE
**Source:** MH-02 (wave 2)
**Description:** Each hook invocation of the command gate emits exactly one `kind:"command"` span with the verdict, the
gate's own duration, the runtime, and a label from a closed set.
**Actor:** Runtime hook host (Claude Code `PreToolUse`, Cursor `beforeShellExecution`)

**Acceptance Criteria (EARS):**
- When the runtime hook host invokes `asdd gate` and the telemetry location is writable, the command gate shall emit
  exactly one span with `kind:"command"` and `process_name:"command-gate"` for that invocation.
- When the command gate emits its span, the span shall carry the verdict (`allow` or `deny`), `duration_ms` measured
  from reading the payload to writing the verdict, `runtime` `claude` when the payload's `hook_event_name` is
  `PreToolUse` and `cursor` otherwise, and an `attributes.command_label`.
- When the command gate sets `attributes.command_label`, the value shall come from this closed set:
  - the gate's dangerous-pattern label for a denied command (the value `deniedLabel` returns);
  - `allowlist` for a command that matches an allow-list pattern;
  - `unmatched` for a command that matches no pattern;
  - `empty` for an empty or missing command.
  No allow span shall carry text taken from the command.
- If the gate's hook path throws before a verdict is computed, then the command gate shall emit its span with
  `status:"ERROR"` from the error path, and that emit shall follow REQ-002.
- When `checkCommandSafety` is called outside the hook path (for example by the jev-gate MCP server), the command gate
  shall emit no span.
- When the command gate processes a command that matches a test-runner pattern, it shall emit no `kind:"test"` span.

**Domain Entities:** Command gate, Hook config, Span (new, flagged)
**Non-Functional Classification:** OBSERVABILITY
**Priority:** MUST
**Traceability:** capability.md B-02, audit rows "Command gate", "MCP reuse of gate", "Gate fires before execution";
intent MH-02; PO decision Q-4; v2.md AR-2 wave 2, D-3 (label only); validation AMB-003

### REQ-008: Gate verdict is invariant and stays fail-closed

**Category:** FEATURE
**Source:** MH-01, MH-02
**Description:** The command gate's verdict output is byte-identical under every telemetry state, and a crash of the
gate itself still produces a deny.
**Actor:** Runtime hook host

**Acceptance Criteria (EARS):**
- When the command gate processes any payload of the gate test corpus in `cli/src/harness/command-gate.test.mjs`, its
  stdout and exit code shall be byte-identical across all four telemetry states (0 differences over the corpus).
- If `emit()` returns `false` or the telemetry library fails to load inside the command gate, then the command gate
  shall write the same verdict JSON it writes with telemetry working.
- If the command gate's own logic throws, then the command gate shall still write a `deny` verdict and exit 0, as it
  does without telemetry (`runHookCli` error path, `cli/src/harness/command-gate.mjs:145-159`).
- When the command gate runs with telemetry, its added wall time shall stay within the 30 s hook timeout of the
  shell-hook entry.

**Domain Entities:** Command gate, Hook config
**Non-Functional Classification:** RELIABILITY, SECURITY
**Priority:** MUST
**Traceability:** capability.md B-02, NFR Performance and Security ("command gate stays fail-closed"); v2.md AR-1
(byte-identical verdicts), D-3; intent Mapped files (widened 2026-11-16, TRC-003)

### REQ-009: Verify-on-Stop hook span

**Category:** FEATURE
**Source:** MH-02 (wave 3)
**Description:** Each invocation of Verify-on-Stop emits exactly one `kind:"hook"` span carrying its outcome, and its
block or allow behavior is unchanged, including when telemetry fails to load.
**Actor:** Runtime hook host (Claude Code `Stop`, Cursor `stop`)

**Acceptance Criteria (EARS):**
- When the runtime hook host invokes `asdd verify` and the telemetry location is writable, Verify-on-Stop shall emit
  exactly one span with `kind:"hook"` on every exit path.
- When Verify-on-Stop emits its span, the span shall carry an outcome from `pass`, `block`, `advisory`, `guard-skip`,
  or `could-not-run`:
  - `guard-skip` covers the Cursor `status` aborted/error exit and the Claude `stop_hook_active` exit;
  - `could-not-run` covers a missing `check-invariants.mjs` and a spawn error or null exit status.
- When `asdd check --live` ran to completion, the span shall carry `attributes.exit_code` with its exit status and
  `attributes.violations_count` with the number of `FAIL` lines it printed.
- If `asdd check --live` did not run to completion, then the span shall omit `attributes.exit_code` and
  `attributes.violations_count` rather than set them to `0`.
- When Verify-on-Stop runs under any of the four telemetry states, its stdout, stderr, and exit code shall be
  byte-identical to a run without telemetry.
- If the telemetry library fails to load, or `emit()` throws or returns `false`, then Verify-on-Stop shall leave its
  stdout, stderr, and exit code unchanged.
- While the stream is unwritable, a slice whose `asdd check` passes shall still pass Verify-on-Stop.
- When `npm test` runs, `cli/src/harness/verify-on-stop.test.mjs` shall exercise every outcome and the load-failure
  case above.

**Domain Entities:** Hook config, Span (new, flagged)
**Non-Functional Classification:** OBSERVABILITY, RELIABILITY
**Priority:** MUST
**Traceability:** capability.md B-03, audit row "Verify-on-Stop"; intent MH-02, Mapped files (widened 2026-11-16,
TRC-003); v2.md AR-1 scenario, AR-2 wave 3, D-8 (omit, never zero); validation NFR-002. Verify-on-Stop's own crash
behavior is out of scope: KPI-1.

### REQ-010: Sync spans

**Category:** FEATURE
**Source:** MH-02 (wave 5)
**Description:** Each `asdd sync` run emits one `kind:"sync"` root span for the run, one child span for the learning
summary child, and one child span for the knowledge-index regeneration.
**Actor:** Kit maintainer, coding agent (run `asdd sync`)

**Acceptance Criteria (EARS):**
- When `asdd sync` runs and the telemetry location is writable, the sync process shall emit exactly one root span with
  `kind:"sync"` for the run, whose `duration_ms` covers the whole run.
- When `asdd sync` regenerates the knowledge index, the sync process shall emit one child span (REQ-005 child rule)
  whose `parent_span_id` is the run span's `span_id`, with `status:"ERROR"` when the regeneration fails.
- When `asdd sync` runs the learning summary child, the sync process shall emit one child span whose
  `parent_span_id` is the run span's `span_id`, with `status:"ERROR"` when the child exits non-zero or prints
  unparseable output.
- If the learning script is absent, then the sync process shall emit no learning child span.
- When `asdd sync` runs under any of the four telemetry states, its stdout, exit code, and the generated manifests,
  registry, and `PROGRESS.md` shall be byte-identical to a run without telemetry.
- If the telemetry library fails to load, or `emit()` throws or returns `false`, then `asdd sync` shall leave its
  stdout, stderr, and exit code unchanged.
- When `npm test` runs, `cli/src/harness/sync-state.test.mjs` shall assert the span tree and the cases above.

**Domain Entities:** Session (read), Slice, Span (new, flagged)
**Non-Functional Classification:** OBSERVABILITY, PERFORMANCE
**Priority:** MUST
**Traceability:** capability.md B-04, audit row "State sync"; intent MH-02, Mapped files (widened 2026-11-16,
TRC-003); v2.md AR-2 wave 5, G-TEL-9; validation CON-001, NFR-002

### REQ-011: Runtime template tells agents to load guidance observably

**Category:** IMPROVEMENT
**Source:** MH-02 (wave 6, narrowed by PO decision Q-2)
**Description:** The runtime template instructs a coding agent to load steering and skill bodies with the runtime's
file-read or skill tool, not with a shell command, and adds no span write path.
**Actor:** Coding agent (follows the runtime template)

**Acceptance Criteria (EARS):**
- The runtime template `cli/agents/_runtime-template.md` shall state that steering files and skill bodies are loaded
  with the runtime's file-read or skill tool and not with a shell command; a test in the slice's test suite asserts
  the sentence.
- When `asdd kit self --check` runs, `.agents/agents/_runtime-template.md` shall be identical to
  `cli/agents/_runtime-template.md`.
- The runtime template shall contain no instruction to write a span, a `turn` span, or a `subagent` span, and no
  instruction to derive a span from session files; the same test asserts their absence.

**Domain Entities:** Guidance document, Session
**Non-Functional Classification:** OBSERVABILITY
**Priority:** MUST
**Traceability:** capability.md B-05, Out of Scope (Q-2), Risk R-7 (PO-approved reduction of MH-02); intent MH-02;
v2.md D-8; validation EARS-001

### REQ-012: Instrumentation lands in AR-2 wave order

**Category:** PRODUCT
**Source:** MH-02
**Description:** The slice's task plan orders the instrumentation waves telemetry library → command gate →
Verify-on-Stop → telemetry validator wiring → sync → runtime template rule, each wave behind green invariants. This
sequencing is the basis of the AP-7 override (see `anti-patterns.md`).
**Actor:** Kit maintainer (implements the waves)

**Acceptance Criteria (EARS):**
- The task plan `tasks.md` of this slice shall make each wave task depend on the task of the preceding wave in the
  order: telemetry library, command gate, Verify-on-Stop, telemetry validator wiring in `check-invariants`,
  `asdd sync`, runtime template rule. The Task Planning review checks this.
- The task plan shall place the hook payload fixture capture task (REQ-018) before the task that parses payload
  fields.
- When a wave's feature is marked passing, `asdd check` and `npm test` shall exit 0 on that feature's evidence.
- While a later wave is not passing, the slice's artifacts shall not claim telemetry coverage for that wave's
  process.

**Domain Entities:** Slice, Feature
**Non-Functional Classification:** DELIVERY
**Priority:** MUST
**Traceability:** intent MH-02 ("in AR-2 wave order"); capability.md B-02…B-05 (wave numbers); v2.md AR-2 (Blocker);
validation EARS-001, AMB-007, RSK-001

---

## Feature: Activation records via `asdd observe` (MH-03)

### REQ-013: Claude Code guidance loads produce activation records

**Category:** FEATURE
**Source:** MH-03
**Description:** When Claude Code reports a `Read` of a steering file, or a `Read` or `Skill` use of a skill installed
under `.agents/skills/`, `asdd observe` emits one activation record.
**Actor:** Runtime hook host (Claude Code `PostToolUse`, matcher `Read|Skill`)

**Acceptance Criteria (EARS):**
- When Claude Code invokes `asdd observe` with a `PostToolUse` payload whose `tool_name` is `Read` and whose file path
  is a guidance path under REQ-015's filter, `asdd observe` shall emit exactly one span with `kind:"tool"`,
  `writer:"runtime-hook"`, `runtime:"claude"`, `attributes.trace_source:"self"`, `attributes.tool_name:"Read"`, the
  repo-relative `attributes.target_path`, and the payload's runtime session id as an attribute when the payload
  carries one (REQ-016).
- When Claude Code invokes `asdd observe` with a `PostToolUse` payload whose `tool_name` is `Skill`, whose skill name
  is `<name>`, and where `.agents/skills/<name>/SKILL.md` exists, `asdd observe` shall emit exactly one activation
  record whose `attributes.target_path` is `.agents/skills/<name>/SKILL.md`.
- If the `Skill` payload names a skill for which `.agents/skills/<name>/SKILL.md` does not exist (a user-level,
  plugin, or namespaced skill), then `asdd observe` shall emit no activation record.
- When a coding agent loads a guidance document through a shell command (for example `cat` in `Bash`), the kit shall
  emit no activation record and shall not parse the command text to find the load.

**Domain Entities:** Guidance document, Hook config, Activation record (new, flagged)
**Non-Functional Classification:** OBSERVABILITY
**Priority:** MUST
**Traceability:** capability.md B-06, MH-03 evidence table (Claude Code row); intent MH-03; PO decisions Q-1, Q-8,
Q-13; assumptions A-01, A-05; validation AMB-004

### REQ-014: Cursor guidance reads produce activation records

**Category:** FEATURE
**Source:** MH-03
**Description:** When Cursor reports a read of a guidance path, `asdd observe` emits one activation record with the
same shape and `runtime:"cursor"`.
**Actor:** Runtime hook host (Cursor `beforeReadFile`)

**Acceptance Criteria (EARS):**
- When Cursor invokes `asdd observe` with a `beforeReadFile` payload whose file path is a guidance path under
  REQ-015's filter, `asdd observe` shall emit exactly one span with `kind:"tool"`, `writer:"runtime-hook"`,
  `runtime:"cursor"`, `attributes.trace_source:"self"`, the repo-relative `attributes.target_path`, and the payload's
  `conversation_id` as the runtime session id attribute when the payload carries one (REQ-016).
- When Cursor invokes `asdd observe` with a `beforeReadFile` payload, `asdd observe` shall answer with an allow
  decision for every payload, including payloads for non-guidance files.

**Domain Entities:** Guidance document, Hook config, Activation record (new, flagged)
**Non-Functional Classification:** OBSERVABILITY
**Priority:** MUST
**Traceability:** capability.md B-06, MH-03 evidence table (Cursor row); intent MH-03; PO decisions Q-1, Q-13;
assumption A-02

### REQ-015: Only guidance paths are recorded, normalized to their canonical path

**Category:** FEATURE
**Source:** MH-03
**Description:** `asdd observe` records only reads under `.harness/steering/` and `.agents/skills/<name>/` (aliases
normalized), and exits early without a record for any other file.
**Actor:** Runtime hook host

**Acceptance Criteria (EARS):**
- When the reported path is under `.harness/steering/` (including `.harness/steering/skills.md`), `asdd observe`
  shall record it as that repo-relative path.
- When the reported path is under `.agents/skills/<name>/` (`SKILL.md` or `references/**`), or under the
  `.claude/skills/`, `.cursor/skills/`, or `.devin/skills/` alias of it, `asdd observe` shall record it as the
  canonical `.agents/skills/<name>/…` path.
- When the reported path is absolute and inside the repository root, `asdd observe` shall convert it to the
  repo-relative path before filtering.
- If the reported path is outside both guidance trees, then `asdd observe` shall emit no span and shall exit 0.

**Domain Entities:** Guidance document, Activation record (new, flagged)
**Non-Functional Classification:** OBSERVABILITY, PERFORMANCE
**Priority:** MUST
**Traceability:** capability.md B-06, Risk R-8 (early exit); PO decision Q-1 (filter); assumption A-05

### REQ-016: Absent payload fields are left out, never guessed

**Category:** FEATURE
**Source:** MH-03
**Description:** When a hook payload lacks an expected field, `asdd observe` leaves the matching attribute out of the
activation record (AR-7), and emits no record when the path itself is missing; `asdd profile` renders a missing
attribute as `unknown` (REQ-021).
**Actor:** Runtime hook host

**Acceptance Criteria (EARS):**
- If the payload lacks a runtime session id (`session_id` on Claude Code, `conversation_id` on Cursor), then the
  activation record shall omit the runtime session id attribute, and shall not set it to an empty string, `0`, or a
  placeholder.
- If the payload lacks an agent id, then the activation record shall omit the agent id attribute.
- If the payload lacks the file path (for `Read` or `beforeReadFile`) or the skill name (for `Skill`), then `asdd
  observe` shall emit no activation record and shall exit 0 with its allow answer.
- If the payload is empty, is not valid JSON, or carries a hook event name `asdd observe` does not recognize, then
  `asdd observe` shall emit no span and shall exit 0 with its allow answer.
- When `asdd observe` fills a field, it shall take the value only from the payload or from the attribution rule of
  REQ-017, and shall never derive it from another field, the transcript, or the process environment of the agent.

**Domain Entities:** Activation record (new, flagged)
**Non-Functional Classification:** DATA INTEGRITY
**Priority:** MUST
**Traceability:** capability.md B-06, Assumptions A-01/A-02, Risk R-3 ("the record omits it and the profile shows
`unknown`"); PO decision Q-13; v2.md AR-7, D-8; validation CON-002

### REQ-017: Slice and phase are attributed only when unambiguous

**Category:** FEATURE
**Source:** MH-03
**Description:** A span carries `slice_id` and `phase` only when an explicit attribution env var names an existing
slice, or exactly one slice is `in_progress`; otherwise both are `null`.
**Actor:** Every telemetry producer (activation records and producer spans). The env var is set by the human who
launches the runtime (Claude Code, Cursor), directly or through a documented launch wrapper.

**Acceptance Criteria (EARS):**
- When the human who launches a runtime sets the explicit attribution env var (name: OI-1) in the runtime's
  environment, the hook and CLI processes that runtime starts shall inherit it, and the producer shall read it from
  its own process environment.
- When the explicit attribution env var names an existing slice, the producer shall set `slice_id` to that slice and
  `phase` to that slice's generated-manifest `phase` at the time of the emit.
- While one runtime session runs, a phase change of the attributed slice shall reach `phase` through the generated
  manifest, not through the env var.
- When the env var is absent and the registry lists exactly one slice with status `in_progress`, the producer shall
  set `slice_id` to that slice and `phase` to its generated-manifest `phase`.
- If the env var names no existing slice, or the env var is absent and zero or more than one slice is `in_progress`,
  or the slice's manifest cannot be read, then the producer shall set `slice_id` and `phase` to `null`.
- When a producer sets `slice_id` or `phase`, it shall not use `trace_id`, `parent_span_id`, or `HARNESS_TRACE_ID` to
  decide them.

**Domain Entities:** Slice, Span (new, flagged), Activation record (new, flagged)
**Non-Functional Classification:** DATA INTEGRITY
**Priority:** MUST
**Traceability:** capability.md B-06, Domain Entities (Slice); PO decision Q-3 (a); v2.md AR-10; assumption A-06;
validation ACT-001, RSK-002

### REQ-018: `asdd observe` is fail-open and within budget

**Category:** FEATURE
**Source:** MH-03
**Description:** `asdd observe` always allows, never blocks, and exits 0 even on internal errors. Its in-process
handler time is at most 50 ms at the 99th percentile, proven over captured payload fixtures.
**Actor:** Runtime hook host

**Acceptance Criteria (EARS):**
- When `asdd observe` runs on any payload under any of the four telemetry states, it shall exit 0 and shall write
  only its allow answer (or nothing, where the runtime expects no output) to stdout.
- If any internal step of `asdd observe` throws, then `asdd observe` shall exit 0 with its allow answer.
- When the installer or the kit writes a load-hook entry for `asdd observe`, the entry shall not set `failClosed`.
  This is the normative `failClosed` criterion; REQ-025 refers to it.
- When `npm test` runs on the `npm test` host, a latency test shall measure the in-process handler time of `asdd
  observe`, from handler entry to the response written, over at least 200 samples per fixture class. The four classes
  are Claude Code `Read` of a guidance path, Claude Code `Read` of a non-guidance path, Claude Code `Skill`, and Cursor
  `beforeReadFile`. Guidance classes run against a writable stream. The test shall fail when the 99th percentile of
  any class exceeds 50 ms.
- When the latency test runs, it shall also measure whole-process wall time (including Node startup and CLI dispatch)
  and print it in the test output, without gating on it.
- The payload fixtures under `cli/test/fixtures/telemetry/**` shall each carry provenance (runtime name, runtime
  version, capture date). A test asserts the provenance is present.

**Domain Entities:** Hook config, Activation record (new, flagged)
**Non-Functional Classification:** RELIABILITY, PERFORMANCE
**Priority:** MUST
**Traceability:** capability.md B-06, NFR Performance, Success Metrics, Risk R-3, R-8; PO decisions Q-1, Q-14 (answer
of 2026-11-16: in-process handler time); intent Mapped files (widened 2026-11-16, TRC-003); validation AMB-001,
AMB-007, DUP-001

---

## Feature: Telemetry validator and the `asdd profile` readout (MH-04)

### REQ-019: Telemetry validator is WARN-only and bounded

**Category:** FEATURE
**Source:** MH-04
**Description:** Inside `asdd check`, the telemetry validator checks the schema file and the tail of the stream and
reports findings as WARN only.
**Actor:** Kit maintainer, coding agent, Verify-on-Stop (run `asdd check`)

**Acceptance Criteria (EARS):**
- If the telemetry location is absent, then the telemetry validator shall print nothing and shall add no finding.
- If the telemetry location exists and the schema file is absent or does not parse as JSON, then the telemetry
  validator shall add one WARN naming the schema file.
- When a line in the tail does not parse as JSON, fails the schema, exceeds 4,096 bytes, or lacks
  `attributes.trace_source`, the telemetry validator shall add one WARN for that line naming its line number (OI-5).
- When the telemetry validator reads the stream, it shall read at most the tail.
- When `asdd check` runs, its exit code shall be the same with a valid stream, a stream of malformed lines, and no
  telemetry location.
- If the telemetry validator throws, then `asdd check` shall continue with its other validators and shall add no FAIL
  for it.
- If the telemetry validator or the telemetry library fails to load, or an `emit()` throws or returns `false`, then
  `asdd check` shall leave its stdout, stderr, and exit code unchanged.
- When `asdd check` runs, `check-invariants` shall emit no per-validator span.

**Domain Entities:** Span (new, flagged), Gate rule
**Non-Functional Classification:** RELIABILITY
**Priority:** MUST
**Traceability:** capability.md B-07, Success Metrics; intent MH-04; PO decisions Q-10, Q-15; v2.md D-6, AR-3
(bounded read), RV2-IC-1; validation NFR-002

### REQ-020: Profile reports phase durations, latencies, and a deterministic score

**Category:** FEATURE
**Source:** MH-04
**Description:** `asdd profile --slice <id>` prints the slice's phase durations from session phase events, the p50
and p95 latency of gate, hook, and sync spans, and a deterministic `bottleneck_score` per surface. It groups spans by
evidence fields, never by trace topology.
**Actor:** Kit maintainer, Tech Lead (adopter)

**Acceptance Criteria (EARS):**
- When a kit maintainer or Tech Lead runs `asdd profile --slice <id>`, the profile report shall list, for each phase
  with a `phase_started` event, its window and duration. The values are computed from the slice's session
  `phase_started` and `phase_completed` events, and no `phase` span is written.
- When the tail holds `command`, `hook`, or `sync` spans for the target, the profile report shall show p50 and p95 of
  their `duration_ms`, per kind, matching the values precomputed for a fixture stream.
- When `asdd profile` computes `bottleneck_score`, it shall compute one score per surface, where a surface is a span
  `kind` in {`command`, `hook`, `sync`}. It shall apply the v2.md §4 formula
  Σ(severity weight × hits) + ⌊surface share of slice time / 10%⌋, where:
  - surface share of slice time = the sum of that surface's `duration_ms` attributed to the slice, divided by the sum
    of the slice's phase durations from session events;
  - the hits term is `0` while no H-* heuristic is evaluated (OI-2).
  Two runs over the same stream and sessions shall print the same scores.
- When `asdd profile` groups spans or computes `bottleneck_score`, it shall key only on `slice_id`, `phase`, `kind`,
  and `failure_signature`. Two fixture streams that differ only in `trace_id` and `parent_span_id` shall produce the
  same report, apart from `generated_at`.
- When `asdd profile` prints a report, it shall state that test thrash (H-BOOT, H-LOOP inputs) is not measured and
  that H-* findings are not reported in this version (TRC-001 deferral).
- When `asdd profile --bottlenecks` runs, the profile report shall rank all slices with spans in the tail by
  `bottleneck_score`, computed in memory.

**Domain Entities:** Profile report (new, flagged), Phase marker (new, flagged), Session (read), Slice, Span
**Non-Functional Classification:** OBSERVABILITY
**Priority:** MUST
**Traceability:** capability.md B-08, Risk R-2, R-6; intent MH-04; PO decision Q-11; v2.md §4, §5, D-4, A-6, AR-10;
validation AMB-005, TRC-004, TRC-001

### REQ-021: Profile shows the activation table per phase, with a three-state legend

**Category:** FEATURE
**Source:** MH-03, MH-04
**Description:** For each phase, the profile report compares expected steering and installed skills against observed
activation records. It shows one column per configured runtime, lists configured-not-observed files, and prints a
legend that separates `not observed`, `unknown`, and `configured, not observed`; it never prints `not loaded`.
**Actor:** Kit maintainer, Tech Lead (adopter)

**Acceptance Criteria (EARS):**
- When `asdd profile --slice <id>` runs, the profile report shall list for each phase the expected steering set
  against the activation records attributed to that slice and phase. The expected set is the files with
  `inclusion: always` plus the `inclusion: auto` files whose `tags` contain that phase, read with the same frontmatter
  parser as `validators/steering-tags.mjs`.
- When `asdd profile --slice <id>` runs, the profile report shall list for each phase the skill bodies observed in
  activation records against the skills installed under `.agents/skills/`.
- When `asdd profile` renders a phase table, it shall show one column per runtime listed in
  `.harness/config/project.json` → `runtimes`. Design confirms the key.
- When an expected steering file or an installed skill has no activation record for a phase, the profile report shall
  show it as `not observed` in the column of a runtime with load hooks (`claude`, `cursor`).
- When a configured runtime has no load hooks (Devin, OpenCode, Kimi, Junie, Kiro), the profile report shall show
  `unknown` in that runtime's column for every row.
- When the report runs, the profile report shall list as `configured, not observed` the files that enter context
  without a tool call: `CLAUDE.md`, Cursor rules with `alwaysApply: true`, and skill descriptions in `skills.md`. These
  are computed from configuration present at that time, and no span shall be written for them.
- When an activation record omits the runtime session id or the agent id, the profile report shall render that value
  as `unknown`.
- When `asdd profile` prints an activation table, it shall print a legend stating:
  - `not observed`: a runtime with load hooks reported no load;
  - `unknown`: the load is not visible to the kit (loads through shell commands, and every load on a runtime without
    load hooks);
  - `configured, not observed`: the file enters context without a tool call.
  A test asserts the legend.
- When `asdd profile` prints any report, it shall never print the words `not loaded`.
- When activation records in the tail carry `slice_id: null`, the profile report shall list them as unattributed, with
  their count, and shall not assign them to a slice or phase.

**Domain Entities:** Guidance document, Hook config, Activation record (new, flagged), Profile report (new, flagged)
**Non-Functional Classification:** OBSERVABILITY
**Priority:** MUST
**Traceability:** capability.md B-08, MH-03 evidence table, Success Metrics; intent MH-03, MH-04; PO decisions Q-2,
Q-3, Q-8, Q-9; assumptions A-03, A-04; glossary "Unknown is not absent"; validation CON-002, CON-003, AMB-006

### REQ-022: Profile is read-only and reads only the tail

**Category:** FEATURE
**Source:** MH-04
**Description:** `asdd profile` writes no file and reads at most the tail of the stream. "No network" is REQ-004, and
"no slice state" is REQ-006; this criterion is the stricter whole-tree rule for `asdd profile`.
**Actor:** Kit maintainer, Tech Lead (adopter)

**Acceptance Criteria (EARS):**
- When `asdd profile` runs in any mode, the content hash of every file in the repository working tree shall be the
  same before and after the run (no span, signal, session, manifest, registry, feature, or rollup file is written).
- When `asdd profile` reads the stream, it shall read at most the tail, with the 500-line and 262,144-byte bounds held
  as code constants.
- If the byte bound cuts the first line of the tail, then `asdd profile` shall skip that partial line.
- If a line in the tail is malformed, then `asdd profile` shall skip it and shall continue the report.

**Domain Entities:** Profile report (new, flagged), Span
**Non-Functional Classification:** PERFORMANCE, DATA INTEGRITY
**Priority:** MUST
**Traceability:** capability.md B-08, NFR Performance; PO decisions Q-10, Q-11; assumption A-09; v2.md AR-3 (bounded
read), D-5, Invariant 3; validation DUP-001

### REQ-023: Profile modes and exit codes

**Category:** FEATURE
**Source:** MH-04
**Description:** `asdd profile` provides `--slice <id>`, `--bottlenecks`, and `--json`. It exits `0` on a report, `2`
on a usage error, and `3` only when there are neither spans nor session events for the target.
**Actor:** Kit maintainer, Tech Lead (adopter)

**Acceptance Criteria (EARS):**
- When `asdd profile` prints a report, it shall exit `0`.
- If `asdd profile` receives an unknown option, or `--slice` without a slice id, then it shall print a usage message
  to stderr and shall exit `2`.
- If the tail holds no span for the target and the target has no session `phase_started` event (for `--bottlenecks`
  and `--json`: no slice has either), then `asdd profile` shall exit `3` and shall print that no telemetry exists for
  the target.
- When the target has session phase events but the stream is absent, empty, or holds no span attributed to the
  target, `asdd profile` shall print the session-derived phase table. It shall also print the line "no attributed spans
  for <slice>" with the count of unattributed spans in the tail, and shall exit `0`.
- When `asdd profile --json` runs, it shall print one JSON document with `schema_version`, `generated_at`, and
  `slices[]` entries holding `slice_id`, `phase_durations`, latencies, activation rows, and `scores`. It shall
  represent dimensions it does not measure (turn latency, boot tax, tokens) as absent, never as `0` (OI-3).

**Domain Entities:** Profile report (new, flagged)
**Non-Functional Classification:** USABILITY
**Priority:** MUST
**Traceability:** capability.md B-08; intent MH-04; v2.md §5, D-5, D-8; PO decision Q-12; validation CON-004

---

## Feature: Atomic registration (MH-05)

### REQ-024: One change registers every telemetry surface

**Category:** MODULE
**Source:** MH-05
**Description:** The change that lands this slice registers the `profile` and `observe` commands, the tests, the
shipped contract source, the gitignore lines, the load hooks, the vendored copies, the version stamps, and the README
rows together.
**Actor:** Kit maintainer (lands the change)

**Acceptance Criteria (EARS):**
- The merge that lands this slice shall add all of the following in one merge (checked by the merge checklist in
  `tasks.md` and by the review of the PR):
  - the `profile` and `observe` entries in `cli/src/harness/commands.mjs`;
  - every new `*.test.mjs` in the `npm test` script;
  - `cli/scaffold/state/telemetry/**` with one `HARNESS_FILES` row;
  - the `spans.jsonl` and rollup lines in the kit `.gitignore` and in `ensureGitignore`;
  - the Claude Code `PostToolUse` (matcher `Read|Skill`) and Cursor `beforeReadFile` load hooks in the installer, the
    runtime recipes, `.claude/settings.json`, and `.cursor/hooks.json`;
  - the regenerated `tools/*/src/harness/telemetry-lib.mjs` copies;
  - restamped versions;
  - the README command rows.
- When `npm test` runs on the merged change, it shall exit 0, including `asdd kit vendor --check` and
  `asdd kit self --check`.
- When a kit maintainer edits a `tools/*/src/harness/telemetry-lib.mjs` copy by hand, `asdd kit vendor --check` shall
  fail.
- When `npm pack --dry-run` runs on the merged change, its file list shall contain no `spans.jsonl` and no rollup
  file.

**Domain Entities:** Installer, Hook config, Guidance document
**Non-Functional Classification:** DELIVERY
**Priority:** MUST
**Traceability:** capability.md B-09, audit rows "Command registry", "Publish boundary", "Installer scaffold",
"Gitignore provisioning", "Hook wiring", "Vendored copies"; intent MH-05; PO decisions Q-5, Q-6, Q-7; v2.md AR-5
(registration list; the sensor clause is OI-7); validation EARS-001

### REQ-025: An installed project gets telemetry provisioned, fail-open load hooks, and no data in git

**Category:** MODULE
**Source:** MH-05
**Description:** Installing or upgrading the kit provisions the telemetry location with the shipped contract files and
adds the gitignore lines. It wires load hooks only for the selected Claude Code and Cursor runtimes, and those hooks
stay fail-open even when `asdd` cannot be resolved.
**Actor:** Adopting engineer (runs `asdd install`)

**Acceptance Criteria (EARS):**
- When an adopting engineer installs the kit into a project, the installer shall create `.harness/state/telemetry/`
  with `telemetry.schema.json` and `README.md` and shall create no `spans.jsonl`.
- When the installer runs, the project's `.gitignore` shall contain the `spans.jsonl` and rollup lines exactly once,
  also after a second install run.
- Where the adopting engineer selects the Claude Code runtime, the installer shall wire the `PostToolUse` load hook
  (matcher `Read|Skill`) running `asdd observe`.
- Where the adopting engineer selects the Cursor runtime, the installer shall wire the `beforeReadFile` load hook
  running `asdd observe`, under REQ-018's `failClosed` rule.
- Where the adopting engineer selects only runtimes without hooks (Devin, OpenCode, Kimi, Junie, Kiro), the installer
  shall wire no load hook.
- If `asdd` cannot be resolved in the installed project (no `node_modules/.bin/asdd` and no `asdd` on the `PATH`), then
  the installed load-hook command shall exit 0 and print the runtime's allow answer, or nothing where the runtime
  expects no output. The command-gate and Verify-on-Stop entries keep their current resolver behavior (exit 2,
  `cli/src/install/phases.mjs:86-87`).
- When `cli/test/install.sh` runs, it shall assert:
  - the installed project contains no kit-only artifact and no telemetry data file;
  - the load-hook command exits 0 with the allow answer when `asdd` cannot be resolved.

**Domain Entities:** Installer, Installed project, Hook config
**Non-Functional Classification:** DELIVERY, SECURITY, RELIABILITY
**Priority:** MUST
**Traceability:** capability.md B-09, Actors (adopting engineer), Success Metrics; intent MH-05, Mapped files
(widened 2026-11-16, TRC-003); PO decisions Q-1, Q-6, Q-7, Q-14; assumptions A-07, A-08; product rule 2; validation
NFR-003, DUP-001

---

## Traceability matrix

| Capability behavior | Must-have | Requirements | Guardrails |
|---|---|---|---|
| B-01 Fail-open emit | MH-01 | REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-006 | AR-1 |
| B-02 Command gate verdict span | MH-02 | REQ-007, REQ-008, REQ-012 | AR-1, AR-2 |
| B-03 Verify-on-Stop span | MH-02 | REQ-009, REQ-012 | AR-1, AR-2 |
| B-04 Sync span | MH-02 | REQ-010, REQ-012 | AR-1, AR-2 |
| B-05 Runtime contract for observable loads | MH-02 | REQ-011, REQ-012 | AR-2 |
| B-06 Activation records | MH-03 | REQ-013, REQ-014, REQ-015, REQ-016, REQ-017, REQ-018 | AR-1 (observe fail-open), AR-7, AR-10 |
| B-07 Telemetry validator | MH-04 | REQ-019 | AR-1, AR-3 (partial: bounded read) |
| B-08 `asdd profile` readout | MH-03, MH-04 | REQ-020, REQ-021, REQ-022, REQ-023 | AR-3 (partial: bounded read), AR-10 |
| B-09 Atomic registration | MH-05 | REQ-024, REQ-025 | AR-5 (partial: registration list) |

### Guardrail coverage

| Guardrail | Coverage | Basis |
|---|---|---|
| AR-1 | Full | REQ-002, REQ-003, REQ-008, REQ-009, REQ-010, REQ-018, REQ-019, REQ-025 |
| AR-2 | Full | REQ-012 |
| AR-3 | **Partial + deferred** | The bounded tail read (500 lines / 256 KB) is pinned (REQ-019, REQ-022). **Deferred by PO decision 2026-11-16 (TRC-001):** stream rotation to `spans.<seq>.jsonl` or compaction, the per-slice `profiling.json` rollup, and H-* findings in `--slice` output. Risk accepted: the stream grows without a bound on disk, but every read stays bounded by the tail, so reads remain safe on an unrotated file. |
| AR-4 | Not applicable | No detection or checkpoint emission (Q-11) |
| AR-5 | Partial | The registration list is pinned (REQ-024, REQ-025, narrowed by Q-6/Q-7). The "flag a missing registration" sensor clause is OI-7 (validation TRC-002), awaiting a PO decision |
| AR-6 | Not applicable | CI latency thresholds need two slices of baseline data |
| AR-7 | Full | REQ-016 (omit absent fields) |
| AR-8 | Not applicable | No heuristic evaluator writes spans (Q-11); in-memory evaluation is OI-2 (validation TRC-005 noted) |
| AR-9 | Not applicable | No `kind:"test"` spans (Q-4); REQ-005 and REQ-007 forbid them |
| AR-10 | Full | REQ-017 (producers), REQ-020 (profile) |

**Traceability gaps:** none against capability.md. Deviations from intent or guardrail wording, each approved by a PO
decision of 2026-11-16:
- MH-02's runtime-template turn/subagent emitter is deferred (R-7, REQ-011).
- MH-05 needs no `files[]` negations, because `package.json` `files[]` has no `.harness/**` entry (Q-6). REQ-024 pins
  the `npm pack` check instead.
- MH-04/D-5 `project.json` `commands.profile` and the smoke row are dropped (Q-7).
- AR-3 rotation, rollup, and H-* findings are deferred (TRC-001).

## Known pre-existing issues (not requirements)

- **KPI-1 (from validation NFR-002; PO decision 2026-11-16: out of scope, follow-up):** Verify-on-Stop is a top-level
  script with static imports and no top-level catch (`cli/src/harness/verify-on-stop.mjs:1-105`). If it crashes for a
  reason unrelated to telemetry, it exits non-zero, and a Claude Code `Stop` hook does not block on that exit.
  Telemetry must not add to this (REQ-002, REQ-009). Making Verify-on-Stop fail-closed on its own crash is a separate
  follow-up slice.

## Priority matrix

| ID | Priority | Status |
|---|---|---|
| REQ-001 … REQ-025 | MUST | READY |

No SHOULD or COULD requirement: the intent marks no nice-to-have.

## Open items

Design owns OI-1…OI-6. OI-7 needs the PO. None blocks the spec gate.

- **OI-1:** The name of the explicit attribution env var. Its contract is fixed in REQ-017 (set by the human at runtime
  launch, inherited by hooks).
- **OI-2:** Whether `asdd profile` evaluates H-SURGE, H-STALL, and H-PHANTOM in memory, and where the v2.md §4 severity
  weights live. Until then the hits term is `0` (REQ-020). If evaluation is added, AR-8 input exclusion applies
  (validation TRC-005).
- **OI-3:** In `--json`, whether an unmeasured dimension is omitted or `null` (REQ-023). Either form satisfies "absent,
  never 0".
- **OI-4:** The `attributes` key names for the verdict, the Verify-on-Stop outcome, the runtime session id, and the
  agent id. They are additional properties of the existing `attributes` bag; no schema change.
- **OI-5:** Whether a validator WARN numbers lines from the start of the file or from the start of the tail when the
  byte bound applies (REQ-019); the WARN must state which.
- **OI-6:** The exact allow answer each runtime expects from `asdd observe`, and each runtime's reaction to a non-zero
  hook exit. Claude Code `PostToolUse` needs no decision; Cursor `beforeReadFile` expects a permission answer. These
  are settled with the captured fixtures (REQ-018, R-3, RSK-004).
- **OI-7 (PO decision needed; validation TRC-002):** whether the telemetry validator WARNs when
  `.harness/state/telemetry/` exists but its gitignore line is missing (the AR-5 sensor clause), or Q-6 also waives
  that clause.
- **Noted LOW findings, left for Design:**
  - ACT-002: a direct CLI or CI `asdd gate` run is labeled `cursor` by REQ-007's runtime rule.
  - NFR-001: the 30 s bound in REQ-008 is loose.
- **Carried risks:**
  - R-1: the MCP servers may need a rebuild after vendoring.
  - R-5: registration files are shared with `skill-eval` and `asdd-ui`; merge order matters.
  - RSK-002: attribution yield in multi-slice repos.
