# Spec Validation Report: telemetry-emitters

**Author:** asdd-validation-agent
**Model/Tool:** claude-opus-5-5 (Claude Code sub-agent)

| Field | Value |
|---|---|
| Report version | 1.1 (re-validation). v1.0 findings are kept below as history |
| Date | 2026-11-16 |
| Requirements validated | `requirements.md` spec version **1.1.0**, status READY, REQ-001…REQ-025 (all MUST); v1.0 validated 1.0.0 |
| Slice | `telemetry-emitters` (mode `full`) |
| Gate decision | **PASSED** (gate PASS, `QG-VAL-04`) |
| Risk assessment | MEDIUM. All six v1.0 HIGH findings are fixed in the spec or deferred or overridden by a recorded PO/TL decision. The remaining risk is governance (GOV-001) and the open AR-5 sensor question (OI-7). |
| Validation confidence score | 0.86 |
| Uncertainty factors | (1) The PO/TL decisions behind TRC-001, RSK-001, AMB-001 and KPI-1 were relayed by the orchestrator and recorded by agents. No human-authored session exists yet (GOV-001). (2) Hook payload shapes and exit-code semantics are still vendor-documented only (A-01/A-02, RSK-004, OI-6). (3) OI-7 (the AR-5 sensor) is open. |
| Auto-approval eligible | No. The Domain phase is required, and GOV-001 recommends a human-authored TL session before Design. |
| Findings (v1.1) | BLOCKING 0 · HIGH 0 · MEDIUM 9 open (DOM-001…006 for the Domain phase, TRC-002/OI-7, GOV-001, plus DOM-007 as LOW) · LOW 8 open (4 carried, 4 new) |

## Gate Decision

**PASSED** (`QG-VAL-04`). No BLOCKING or HIGH finding remains in the MUST requirements of spec 1.1.0, and the
validation confidence is 0.86, at least 0.75. `QG-VAL-05` holds: v1.0 had no BLOCKING finding, and each of its HIGH
findings is fixed, explicitly deferred, or overridden (see the table below).

- **Next phase:** `asdd-domain-agent` is **required**. Six terms are still missing from
  `docs/architecture/domain-model.md` (DOM-001…DOM-006), and `QG-DMN-02` will BLOCK the Domain gate until they are
  added.
- **MEDIUM findings proceed with TL sign-off:**
  - **OI-7 / TRC-002:** this can go to Design. It must be decided before Task Planning freezes `tasks.md`.
  - **GOV-001:** a human-authored TL session should confirm the relayed decisions before Design.
- **Schema:** spec 1.1.0 still needs no change to `telemetry.schema.json`.
  - The child-span rule in REQ-005 uses the existing `parent_span_id`.
  - Omitting absent fields (REQ-016) needs no new key.
  - The closed `command_label` set uses the existing `attributes.command_label` string.

## Re-validation of spec 1.1.0

The code citations were re-checked at HEAD `f41a3ff`, which is after the two merges of the base branch. `git diff
1b1fbae HEAD` shows no change to `command-gate.mjs`, `verify-on-stop.mjs`, `phases.mjs`, `check-invariants.mjs`, or
`runtimes.mjs`.
- `runHookCli` is at `command-gate.mjs:145-159` (REQ-008: still valid).
- The `projectAsdd` resolver is at `phases.mjs:86-87` and still exits 2 (REQ-025: valid).
- Verify-on-Stop still has static imports and no top-level catch (`verify-on-stop.mjs:15-19`, `:1-105`; KPI-1: valid).
- The lazy-import precedent is now `check-invariants.mjs:108-114`. REQ-002 cites `:106-115`, which is close enough:
  LOW, no action.
- `.harness/config/project.json:45` has `runtimes` (REQ-021: verified).
- The intent's Mapped files carry the dated block "Widened 2026-11-16 by PO decision (validation TRC-003)" (verified).

### Resolution of the v1.0 findings

| v1.0 ID | Sev | Status | Evidence in spec 1.1.0 |
|---|---|---|---|
| AMB-001 | HIGH | **Resolved** (PO answer to Q-14) | REQ-018: in-process handler time from handler entry to response written; ≥ 200 samples for each of 4 fixture classes; on the `npm test` host; gated at p99 ≤ 50 ms. Whole-process time is printed but not gated. |
| CON-001 | HIGH | **Resolved** | REQ-005 criteria 3–4 split the rule: the root span has `parent_span_id: null`, and a child carries the root's `trace_id`, the root's `trace_source`, and `parent_span_id` = the root's `span_id`. This matches REQ-010. |
| NFR-002 | HIGH | **Resolved; own-crash part deferred** | Load failures: REQ-002 criterion 7 (no crashing static import), REQ-003 criterion 2 (a load-failure case in the AR-1 test), REQ-009 criteria 6 and 8 (with `verify-on-stop.test.mjs`), REQ-010 criterion 6, REQ-019 criterion 7. Verify-on-Stop's own crash is KPI-1: out of scope by PO decision, as a follow-up. That behavior predates this slice, and telemetry is now barred from adding to it. |
| NFR-003 | HIGH | **Resolved** | REQ-025 criteria 6–7: the load hook exits 0 with the allow answer when `asdd` cannot be resolved, asserted in `cli/test/install.sh`. The gate and stop entries keep exit 2. |
| TRC-001 | HIGH | **Deferred (explicit PO decision)** | The guardrail coverage table shows AR-3 as "Partial + deferred": rotation, the `profiling.json` rollup, and H-* in `--slice` output, with the risk stated. REQ-020 criterion 5 makes the report say that H-* findings are not reported. |
| RSK-001 (AP-7) | HIGH | **Overridden (TL/PO, Option B)** | `anti-patterns.md` records the AP-7 violation as accepted by override, and REQ-012 states that sequencing is the basis. See GOV-001 on how the decision is recorded. |
| AMB-002 | MED | Resolved | REQ-003: a writable temporary stream; every call must append. |
| AMB-003 | MED | Resolved (see new AMB-009) | REQ-007: a closed label set (denied label, `allowlist`, `unmatched`, `empty`). |
| AMB-004 | MED | Resolved | REQ-013 criteria 2–3: no record unless `.agents/skills/<name>/SKILL.md` exists. REQ-004 criterion 4 rejects `:` and `/`. |
| AMB-005 | MED | Resolved | REQ-020 criterion 3: a surface is one of `command`/`hook`/`sync`; the share is defined; the hits term is 0. |
| AMB-006 | MED | Resolved | REQ-021 criterion 3: one column per runtime in `.harness/config/project.json` → `runtimes` (key verified). |
| AMB-007 | MED | Resolved | REQ-018 criterion 6: fixture provenance is asserted. REQ-012 criterion 2 makes capture come before parsing. |
| CON-002 | MED | Resolved | REQ-016: absent fields are omitted. REQ-021 criterion 7: the profile renders them as `unknown`. |
| CON-003 | MED | Resolved | REQ-021 criteria 8–9: a three-state legend asserted by a test; `not loaded` is never printed. |
| CON-004 | MED | Resolved | REQ-023 criteria 3–4: exit 3 only when there are neither spans nor session events; otherwise a session-derived table plus "no attributed spans". |
| ACT-001 | MED | Resolved | REQ-017: the actor is the human who launches the runtime; the variable is inherited by hooks; phase comes from the manifest. |
| TRC-002 | MED | **Open: OI-7** (see below) | Guardrail table: AR-5 "Partial". |
| TRC-003 | MED | Resolved (PO widening) | Dated widening in intent.md; REQ-008/009/010/018/025 name the paths. |
| TRC-004 | MED | Resolved | REQ-020 criterion 4: keys are `slice_id`, `phase`, `kind`, and `failure_signature`; a fixture test shows `trace_id`/`parent_span_id` do not change the report. |
| DOM-001…006 | MED | **Open: Domain phase** | Header uncertainty factor 2. |
| AMB-008 | LOW | Resolved | REQ-004 criterion 1: token-based check. |
| DUP-001 | LOW | Resolved | Normative homes: REQ-004 (network), REQ-006 (state), REQ-018 (`failClosed`), with cross-references. |
| DOM-007 | LOW | Open: Domain phase | — |
| DOM-008 | LOW | Resolved | The header lists six terms and cites REQ-016. |
| ACT-002 | LOW | Open, delegated to Design (acceptable) | Open items. |
| EARS-001 | LOW | Resolved | Ubiquitous artifact form, each criterion naming its check (REQ-011, REQ-012, REQ-024). |
| NFR-001 | LOW | Open, delegated to Design (acceptable) | Open items. |
| TRC-005 | LOW | Resolved as a conditional | OI-2: AR-8 input exclusion applies if H-* evaluation is added. |
| RSK-002…004 | LOW | Carried | Open items (RSK-002) and OI-6 (RSK-004). RSK-003 is expected until Task Planning. |

### New findings on spec 1.1.0

#### GOV-001 — MEDIUM — Human decisions recorded only by agents
- **Evidence:** The decisions that close HIGH findings exist only in agent-authored files:
  - the AP-7 override, the AR-3 deferral, the Q-14 answer, KPI-1, and the TRC-003 widening;
  - the changelog of `requirements.md`, the AP-7 entry in `anti-patterns.md` ("accepted by TL/PO override"), and
    session `006-spec-revised.json`, whose evidence says "this is not a human-authored session".
  - No `override` session authored by a human exists under `.harness/state/slices/telemetry-emitters/sessions/`.
- **Problem:** I cannot verify a relayed decision as human approval. The content fixes the spec defects, so this does
  not hold the gate. But the waiver of a CRITICAL anti-pattern and the deferral of a guardrail clause rated Blocker
  should have a durable human record.
- **Correction:** Before Design, the Tech Lead writes a human-authored session, for example an `override` with `human`
  set. It confirms the AP-7 override, the AR-3 deferral, the Q-14 answer, KPI-1, and the OI-7 decision.

#### AMB-009 — LOW — REQ-007: no label for an override-allowed dangerous command
- **Evidence:** "the gate's dangerous-pattern label for a denied command …; `allowlist` …; `unmatched` for a command
  that matches no pattern".
- **Problem:** `runHook` passes `input.override` (`command-gate.mjs:117`), and `checkCommandSafety` then allows any
  command with `method: 'override'` (`:85-87`). A dangerous command allowed this way is not denied, not allow-listed,
  and not unmatched, so the closed set has no value for it.
- **Correction:** Add an `override` label, or "the dangerous-pattern label with verdict `allow`", to the closed set.
  Design can settle this.

#### AMB-010 — LOW — REQ-019 criterion 7: unclear baseline
- **Evidence:** "If the telemetry validator … fails to load …, then `asdd check` shall leave its stdout, stderr, and
  exit code unchanged."
- **Problem:** "Unchanged" compared with what? A failed load also removes the validator's own WARN lines.
- **Correction:** Use "the same exit code as with the validator working, and no output added by the failure".

#### TRC-006 — LOW — REQ-018: no Cursor non-guidance latency class
- **Evidence:** The four latency classes include Claude Code `Read` of a non-guidance path, but no Cursor
  `beforeReadFile` of a non-guidance path. That hook also fires on every read (R-8).
- **Correction:** Add a fifth class, or have the Cursor class mix guidance and non-guidance fixtures.

### OI-7 (AR-5 sensor clause): ruling
- **Severity:** MEDIUM, not blocking. It **can go to Design**.
- **Reason:**
  - It changes no MUST outcome already specified.
  - Its only possible addition is one WARN criterion in REQ-019, inside the already-mapped
    `cli/src/harness/validators/telemetry.mjs`.
  - It needs no schema change, and nothing in the Domain phase depends on it.
- **Constraint:** the PO must answer before Task Planning freezes `tasks.md`, so the wave-4 validator task includes or
  excludes the check.
- **Recommended answer:** add the WARN, with the check active only when `.harness/state/telemetry/` exists. It is cheap,
  matches AR-5's intent, and is WARN-only like the rest of B-07. Record the answer in the GOV-001 session.

---

# v1.0 report (2026-11-16, on spec 1.0.0): history

The v1.0 header: gate PASSED_WITH_WARNINGS, confidence 0.82, BLOCKING 0 · HIGH 6 · MEDIUM 19 · LOW 11.

### v1.0 gate decision (superseded)

**PASSED_WITH_WARNINGS.** No finding is BLOCKING, and six findings are HIGH: AMB-001, CON-001, NFR-002, NFR-003,
TRC-001, and RSK-001 (AP-7). `QG-VAL-02` applies, so the gate returns WARN and every HIGH finding is a concern in the
session. Before Domain or Design starts, the Tech Lead must do one of two things:
- record an `override` session that acknowledges the HIGH findings, or
- send the spec back to `asdd-spec-agent` to fix them.

The HIGH findings must be resolved before Design proceeds. The Domain phase is **required**: six terms used in the
requirements are missing from `docs/architecture/domain-model.md` (DOM-001…DOM-006; `QG-DMN-02`).

`telemetry.schema.json` does not need to change. I checked every criterion against the schema:
- The verdict, outcome, runtime session id, and agent id live in `attributes`, which has `additionalProperties: true`.
- `kind` values `command`, `hook`, `sync`, and `tool` are in the enum.
- `trace_source` `env`/`self` is in the enum.
- `slice_id` and `phase` already have patterns and enums that fit.
- No REQ adds a top-level key.


## Summary

The requirements are precise, EARS-shaped, and traced to B-01…B-09 and MH-01…MH-05. The PO decisions Q-1…Q-15 are
reflected faithfully: test spans, turn and subagent spans, self-report, tokens, and detection spans are all deferred
explicitly.

The independent audit found these problems:
- **Fail-open (AR-1) holes.** The command gate's guarantee is pinned and code-verified. Verify-on-Stop has no
  equivalent "telemetry import failure" clause. The load-hook entry can exit 2 through the shared `asdd` resolver.
- **One contradiction.** The `parent_span_id` of sync child spans contradicts REQ-005.
- **One unmeasurable budget.** The p99 for `asdd observe` has no measurement boundary and no sample size.
- **One silently dropped guardrail clause.** AR-3 stream rotation has no requirement and no deferral.
- **AP-7.** I rule it a violation of the literal criterion, so a human must decide between splitting the slice and
  overriding.

The MEDIUM findings mostly sharpen the wording around "unknown", "not observed", and "not loaded", and around
attribution.

---

## Section 1: Ambiguity Detection

### AMB-001 — HIGH — REQ-018
- **Evidence:** "a latency test shall run `asdd observe` over captured … payload fixtures … and shall fail when the
  99th-percentile **added latency per event** exceeds 50 ms."
- **Problem:** The baseline for "added" is never defined.
  - It could be in-process handler time.
  - It could be the whole hook process: node start, `cli/bin/asdd.mjs` dispatch, and, in projects, the `projectAsdd`
    shell resolver (`cli/src/install/phases.mjs:86-87`).
  - No sample size is given. A p99 over a handful of fixtures is meaningless.
- **Measurement:** a cold `node cli/bin/asdd.mjs gate` already takes about 20 ms of wall time on this machine. Whole
  process versus handler is therefore the difference between a tight budget and a trivial one.
- **Why it matters:** this is the MUST proof of PO decision Q-14, and R-8 says the hook fires on every `Read`.
- **Correction:**
  - State the boundary. Either use "wall time from spawning the installed hook command to its exit", or use "in-process
    time from stdin read to exit, with process start measured separately". Q-14 must say which one it meant; this is a
    PO/TL decision.
  - Set the sample: at least 200 runs per fixture class (Claude `Read` guidance, Claude `Read` non-guidance, Claude
    `Skill`, Cursor `beforeReadFile`).
  - Name the machine the result is valid on (the `npm test` host).

### AMB-002 — MEDIUM — REQ-003
- **Evidence:** "shall call `emit()` at least 1,000 times with spans of up to 4,096 bytes and shall fail when the
  99th-percentile wall time per call exceeds 50 ms."
- **Problem:** The criterion does not say which telemetry state the run uses. Against a missing location, `emit()`
  returns `false` almost at once, so the latency proof would hold trivially.
- **Correction:** Add: "against a writable stream in a temporary telemetry location, every call appending a line, with
  the stream growing across the run".

### AMB-003 — MEDIUM — REQ-007
- **Evidence:** "an `attributes.command_label` taken from the gate's pattern classes."
- **Problem:** The pattern classes only label dangerous matches. `deniedLabel` returns `null` for allow-listed commands
  and for commands that match no pattern (`cli/src/harness/command-gate.mjs:61-71`). Most gate invocations, such as
  `npm install` or `python x.py`, therefore have no class, and the label for those allow spans is undefined.
- **Correction:** Pin a closed label set. For example:
  - the matched dangerous prefix;
  - `allowlist` (optionally with the pattern index);
  - `unclassified`;
  - `empty`.

  State that no allow span carries text taken from the command.

### AMB-004 — MEDIUM — REQ-013
- **Evidence:** "whose skill name is `<name>`, `asdd observe` shall emit exactly one activation record whose
  `attributes.target_path` is `.agents/skills/<name>/SKILL.md`."
- **Problem:** Claude Code's `Skill` tool also runs skills that are not installed under `.agents/skills/`: user-level
  skills, plugin skills, and namespaced names like `plugin:skill`. The record would claim a path that does not exist
  and inflate the "observed" column.
- **Correction:** Pick one rule:
  - emit only when `.agents/skills/<name>/SKILL.md` exists; or
  - emit with `attributes.target_path_exists: false` (a declared schema attribute) and exclude those records from the
    installed-versus-loaded comparison of REQ-021.

  Either way, reject names with `:` or `/` under REQ-004.

### AMB-005 — MEDIUM — REQ-020
- **Evidence:** "Σ(severity weight × hits) + ⌊surface share of slice time / 10%⌋ (OI-2)."
- **Problem:** "Surface" and "slice time" are undefined. Which spans form a surface (per `kind`? per `process_name`?),
  and is the denominator the sum of phase durations or the first-to-last session window? Without this, the "precomputed
  for a fixture stream" test cannot be written.
- **Correction:**
  - Define surface as a span `kind` in {`command`, `hook`, `sync`}.
  - Define share as the sum of that surface's `duration_ms` divided by the sum of the slice's phase durations from
    session events.
  - State that the hits term is 0 when no H-* heuristic is evaluated (OI-2).

### AMB-006 — MEDIUM — REQ-021
- **Evidence:** "When the project's configured runtimes include a runtime without load hooks (Devin, OpenCode, Kimi,
  Junie, Kiro), the profile report shall show `unknown` for that runtime's loads."
- **Problem:** The source of "configured runtimes" is not named. The report also cannot know which runtime ran a given
  phase, so the table layout (one column per runtime? one row per phase?) is open, and the test cannot assert where
  `unknown` appears.
- **Correction:**
  - Name the source: the `runtimes` list in the project configuration file that the installer writes; Design confirms
    the key.
  - Require one column per configured runtime in each phase table: `observed` or `not observed` for `claude` and
    `cursor`, and `unknown` for hookless runtimes.

### AMB-007 — MEDIUM — REQ-018 (criterion 5)
- **Evidence:** "their fixtures shall be payloads captured from the runtimes, committed as test fixtures, before field
  names are fixed in code."
- **Problem:**
  - No test can check that a fixture was "captured from the runtimes" rather than hand-written.
  - "Before field names are fixed" is a commit-order rule, not a behavior.
- **Correction:**
  - Require each fixture to carry provenance (runtime name, runtime version, capture date), and require a test that
    asserts the provenance is present.
  - Drop the temporal clause, or move it to the task plan as a dependency (the fixture task comes before the parser
    task).

### AMB-008 — LOW — REQ-004 (criterion 1)
- **Evidence:** "shall not contain `SECRET-MARKER-123` or any other substring of the command text beyond the
  pattern-class `command_label`."
- **Problem:** "Any other substring" includes single characters, so the criterion cannot be tested as written.
- **Correction:** Use "shall contain no whitespace-separated token of the command text, other than the tokens of
  `command_label`".

## Section 2: Duplicate Requirements

### DUP-001 — LOW — REQ-018 / REQ-025; REQ-004 / REQ-022; REQ-006 / REQ-022
- **Evidence:**
  - "the entry shall not set `failClosed`" (REQ-018, criterion 3) and "without `failClosed`" (REQ-025, criterion 4).
  - "shall open no network socket" (REQ-004, criterion 5) and "makes no network call" (REQ-022, description).
  - "create, modify, or delete no file under `.harness/state/slices/`…" (REQ-006) and "content hash of every file …
    the same" (REQ-022, criterion 1).
- **Correction:** Keep one normative criterion for each, and cross-reference it from the other REQ so that two tests do
  not drift apart.

## Section 3: Missing Domain Model Definitions (route to the Domain phase)

`docs/architecture/domain-model.md` was read in full. It defines Slice, Session, Feature, Requirement, Gate rule,
Guidance document, Binding, Command gate, Hook config, Installer, Installed project, Module, Gate decision, and
Pattern/Proposal. None of the terms below is defined there. `QG-DMN-02` will BLOCK the Domain gate until they are.

| ID | Severity | Term | Used in | Correction for the Domain agent |
|---|---|---|---|---|
| DOM-001 | MEDIUM | **Span** | REQ-001…REQ-010, REQ-017, REQ-019, REQ-022 | Add as an entity: one JSONL line in `spans.jsonl` under `telemetry.schema.json` 1.0. It is append-only, at most 4,096 bytes, and has the sub-types producer span and activation record. Relationships: belongs to one Trace; optionally references a Slice and a Phase. Bounded context: Process (shipped). |
| DOM-002 | MEDIUM | **Trace** | REQ-005 | Add as an entity or value object: the spans of one producer invocation. It is display grouping only and never a detection or attribution key (AR-10, DOM-007 of v2). |
| DOM-003 | MEDIUM | **Activation record** | REQ-013…REQ-017, REQ-021 | Decide whether it is its own entity or a sub-type of Span (`kind:"tool"`, `writer:"runtime-hook"`), as glossary.md's open question asks. Define its relationship to Guidance document (by repo-relative path). |
| DOM-004 | MEDIUM | **Profile report** | REQ-020…REQ-023 | Add as a read model, never persisted. Its sections are phase durations, latencies, the activation table, and `bottleneck_score`. |
| DOM-005 | MEDIUM | **Phase marker** | REQ-020 | Add as a value object: a phase window computed in memory from `phase_started`/`phase_completed` events, never written in this slice. Distinguish it from the Phase value object. |
| DOM-006 | MEDIUM | **Runtime hook host** (actor) | REQ-007, REQ-009, REQ-013…REQ-018 | Decide whether it is an actor or a qualifier of Hook config. Define it as the runtime process that starts kit hook commands with a JSON payload on stdin; it is not a human. |

### DOM-007 — LOW — value objects and events not in the model
- **Evidence:** The header conventions define "telemetry location", "the stream", "the tail", and "telemetry state".
  The glossary defines the event "Guidance load observed" and the metric "Activation gap".
- **Correction:** Domain agent:
  - Add Tail (500 lines / 262,144 bytes) and Telemetry state as value objects.
  - Record "Guidance load observed" as a telemetry event that is explicitly **not** one of the nine session events
    (DOM-003).

### DOM-008 — LOW — requirements.md header
- **Evidence:**
  - "Five slice terms are not yet in `docs/architecture/domain-model.md`", followed by a list of six (five entities plus
    the actor).
  - "REQ-015 pins the absent-field behavior": that behavior is REQ-016.
- **Correction:** At the next revision, change "five" to "six" and change REQ-015 to REQ-016.

## Section 4: Conflicting Requirements

### CON-001 — HIGH — REQ-005 versus REQ-010
- **Evidence:**
  - REQ-005: "When a producer process starts without `HARNESS_TRACE_ID` in its environment, **its spans** shall carry a
    self-minted `trace_id`, `parent_span_id: null`."
  - REQ-010: the knowledge and learning child spans of `asdd sync` "shall emit one child span whose `parent_span_id` is
    the run span's `span_id`."
- **Problem:** `asdd sync` normally starts without `HARNESS_TRACE_ID` (A-06; no producer in this slice exports it). The
  two MUST criteria then cannot both pass for the child spans.
- **Correction:** Scope REQ-005 criterion 3 to "the invocation's root span shall carry `parent_span_id: null`; child
  spans of the same invocation share its `trace_id` and carry `trace_source:"self"`".

### CON-002 — MEDIUM — REQ-016 versus AR-7, capability R-3, and REQ-009/REQ-023
- **Evidence:**
  - REQ-016: "the activation record shall carry the value `unknown` for the runtime session id attribute" (and the same
    for the agent id).
  - AR-7 (v2.md:472): "any runtime that cannot report SHALL omit attributes per D-8 — no inferred fabrication".
  - Capability R-3: "If a field is missing, **the record omits it** and the profile shows `unknown`".
  - REQ-009 and REQ-023 use "omit, never `0`".
- **Correction:** Omit the attribute in the record, and have `asdd profile` render a missing attribute as `unknown`.
  Alternatively, keep the literal value and record a PO decision that waives AR-7's "omit" for these two keys.

### CON-003 — MEDIUM — REQ-021 versus capability B-06, Q-8, and the glossary rule "Unknown is not absent"
- **Evidence:**
  - Capability B-06: "Loads through shell commands … count as `unknown`, never as 'not loaded'".
  - Glossary: "a shell-mediated read, is reported as `unknown`".
  - REQ-021 criterion 3: a file with no activation record is shown "as `not observed` for runtimes with load hooks".
  - REQ-013 criterion 3: a shell load emits nothing.
- **Problem:** On Claude Code and Cursor, a shell load therefore surfaces as `not observed`, never as `unknown`. Q-8 is
  not realized as stated. "Not observed" is honest, but the vocabulary differs between capability and requirements.
- **Correction:** Add a criterion: "the profile report shall print a legend stating that `not observed` means no hook
  reported the load, and that loads made through shell commands or without a tool call are not visible (`unknown`)".
  Assert the legend in a test. Align glossary.md wording at the Domain phase.

### CON-004 — MEDIUM — REQ-023 versus REQ-020 and REQ-021
- **Evidence:**
  - REQ-023: "If … the tail holds no span for the target slice, then `asdd profile` shall exit `3`".
  - REQ-020 criterion 1: phase durations are computed from session events, which exist without any span.
  - REQ-021 criterion 6: unattributed records (`slice_id: null`) are listed rather than assigned.
- **Problem:** In the kit repo, seven slices are `in_progress` in `.harness/state/registry.json`, so most spans are
  unattributed (see RSK-002). `--slice telemetry-emitters` would then exit 3 even though session phase data and
  unattributed activation records exist.
- **Correction:** Decide the precedence. Recommended: exit `3` only when the stream is absent or empty, as in v2 D-5.
  Otherwise print the session-derived phase table and the line "no attributed spans for <slice>" with the unattributed
  count, and exit 0.

## Section 5: Undefined Actors or Behaviors

### ACT-001 — MEDIUM — REQ-017
- **Evidence:** "When the explicit attribution env var (name: OI-1) names an existing slice, the producer shall set
  `slice_id` to that slice".
- **Problem:** The requirements do not say who sets the variable, or how it reaches hook processes. Hooks inherit the
  runtime's environment, so the variable is fixed when the runtime is launched, not per phase. With more than one
  `in_progress` slice (seven in this repo), the variable is the only attribution path.
- **Correction:** Name the actor: the human who launches the runtime, or a documented launch wrapper. State that a
  phase change during one runtime session changes `phase` through the generated manifest, not through the variable.

### ACT-002 — LOW — REQ-007 (criterion 2)
- **Evidence:** "`runtime` `claude` when the payload's `hook_event_name` is `PreToolUse` and `cursor` otherwise".
- **Problem:** A direct `asdd gate` run from the CLI, CI, or a test is labeled `cursor`.
- **Correction:** Use `cursor` only for a Cursor-shaped payload (a top-level `command` field). Otherwise use `cli`, or
  `null` (the schema allows `null`).

## Section 6: EARS Format Violations

### EARS-001 — LOW — REQ-011 (criteria 1 and 3), REQ-012 (criterion 1), REQ-024 (criterion 1)
- **Evidence:**
  - "When a coding agent loads `cli/agents/_runtime-template.md`, the template shall state…"
  - "When the task plan for this slice is written, each wave task shall depend…"
  - "When the slice's change merges, the change shall add, in one merge…"
- **Problem:** Each sentence starts with When, but its subject is an artifact, not the system. These are delivery
  checklists dressed as event-driven behavior.
- **Correction:** Rewrite them as ubiquitous statements about the artifact ("The runtime template shall state…"), and
  name the check that verifies each one: a lint test, a task-plan review, or the merge checklist.

## Section 7: Non-Functional Requirement Quality

### NFR-001 — LOW — REQ-008 (criterion 4)
- **Evidence:** "its added wall time shall stay within the 30 s hook timeout of the shell-hook entry."
- **Problem:** The bound is trivially met. The Claude Code `PreToolUse` entry in `.claude/settings.json` sets no
  timeout at all.
- **Correction:** Bound the gate's added p99 by the REQ-003 emit budget (≤ 50 ms) measured over the gate corpus, or
  drop the criterion.

### NFR-002 — HIGH — REQ-009 (also REQ-010 and REQ-019): telemetry import failure is not pinned outside the command gate
- **Evidence:**
  - REQ-008 criterion 2 covers the gate only: "If `emit()` returns `false` or **its import fails** inside the command
    gate…".
  - REQ-009 pins byte-identity only across "the four telemetry states" (location absent, stream absent, writable,
    unwritable).
  - REQ-019 criterion 6 covers a validator that throws, not a validator that fails to import.
- **Verified in code:** `cli/src/harness/verify-on-stop.mjs:1-105` is a top-level script with static imports (`:15-19`)
  and no top-level `catch`.
- **Problem:** Suppose `telemetry-lib.mjs` is missing or broken. This can happen after a partial vendoring or install
  (R-1). A static import then crashes Verify-on-Stop with a non-zero exit before any check runs. Under Claude Code's
  `Stop` hook, a non-zero exit other than 2 does not block, so a failing slice can end its session. That is telemetry
  changing a gate verdict, which AR-1 (Blocker) forbids.
- **Correction:** Add to REQ-009: "If the telemetry library fails to load, or `emit()` throws or returns `false`, then
  Verify-on-Stop shall write the same stdout, stderr, and exit code as without telemetry". Add the same clause for
  `asdd sync` (REQ-010) and for the validator import in `check-invariants` (REQ-019). The lazy-import precedent is
  `check-invariants.mjs:106-115`.
- **Out of scope, but needs a human decision:** Verify-on-Stop's *own* crash is not fail-closed today under Claude
  Code. The command gate is (`command-gate.mjs:145-159`, `runHookCli` writes `deny` and `exitCode = 0`; REQ-008
  criterion 3 is pinned and testable). Making Verify-on-Stop fail-closed is a behavior change outside this slice.

### NFR-003 — HIGH — REQ-018 and REQ-025: the load-hook entry itself can fail closed or noisy
- **Evidence:**
  - REQ-018: "it shall exit 0" applies to `asdd observe`.
  - REQ-025: "the installer shall wire the `PostToolUse` load hook … running `asdd observe`".
- **Verified in code:** project hook commands go through the `projectAsdd` resolver, which runs
  `{ echo "asdd is not installed…" >&2; exit 2; }` when `asdd` cannot be resolved (`cli/src/install/phases.mjs:86-90`).
- **Problem:** In an installed project where `asdd` is missing, every `Read` (Claude Code) and every file read (Cursor)
  runs a hook that exits 2 before `asdd observe` starts.
  - For Claude Code `PostToolUse`, exit 2 sends stderr back to the model on every read (vendor-documented).
  - For Cursor `beforeReadFile`, exit 2 can deny the read.
  - Both outcomes contradict Q-1 and Q-14: "fail-open … never blocks".
- **Correction:** Add a criterion to REQ-025 (tested in `cli/test/install.sh`): "Where `asdd` cannot be resolved, the
  load-hook command shall exit 0 and print the runtime's allow answer, or nothing". This needs a fail-open variant of
  the resolver for load hooks. The gate and stop entries keep exit 2.

## Section 8: Traceability Gaps

### TRC-001 — HIGH — AR-3 stream rotation is silently dropped
- **Evidence:**
  - AR-3 (v2.md:468): "WHEN `spans.jsonl` exceeds a size/age bound, the implementation SHALL rotate to
    `spans.<seq>.jsonl` (or fold into weekly compaction)".
  - The traceability matrix lists AR-3 as covered (REQ-019, REQ-020, REQ-022), but those REQs pin only bounded reads.
  - Rotation is not in Out of Scope, has no PO decision among Q-1…Q-15, and is not in the "Guardrails without a
    requirement" paragraph.
  - The `profiling.json` per-slice rollup is also implicitly dropped (Q-11 says "computes in memory"), and so is the
    "H-* findings" part of AR-3's `--slice` output, which OI-2 may leave empty.
- **Problem:** Without rotation, `spans.jsonl` grows without bound on every `Read`-heavy session (R-8). Reads stay
  bounded, but disk use and tail-seek cost do not.
- **Correction:** A PO/TL decision is needed. Either:
  - add a REQ for rotation (for example, rotate on append when the stream exceeds N MB; Design picks N as a code
    constant, as in Q-10); or
  - record an explicit deferral of rotation, the `profiling.json` rollup, and H-* findings in `--slice` output, with
    the risk accepted. List them in the requirements' "Guardrails without a requirement" paragraph.

### TRC-002 — MEDIUM — AR-5 detection clause not traced
- **Evidence:** AR-5 (v2.md:470): "WHEN any one is missing, `check-invariants`/`check-project-config` SHALL flag it".
  Q-6 narrows the registration *list*. REQ-024 pins the list and `kit vendor --check`, but no sensor flags a missing
  registration (for example, the telemetry directory present but its gitignore lines missing in an installed project).
- **Correction:** Either add a criterion (the telemetry validator WARNs when `.harness/state/telemetry/` exists and the
  `spans.jsonl` gitignore line is absent), or record that Q-6 also waives the AR-5 sensor.

### TRC-003 — MEDIUM — Mapped files do not cover the required test surfaces
- **Evidence:** intent.md says "Design narrows this list; nothing outside it changes". Several REQs need files outside
  that list:
  - REQ-025 criterion 6 requires `cli/test/install.sh` to assert "no telemetry data file".
  - REQ-008 needs the gate corpus in `cli/src/harness/command-gate.test.mjs`.
  - REQ-010 needs `cli/src/harness/sync-state.test.mjs`.
  - REQ-009 needs a new Verify-on-Stop test.
  - REQ-018 needs committed payload fixture files.

  The mapped list covers `*.test.mjs` only for the *new* modules, and does not include `cli/test/**` or a fixtures
  path. Design can only narrow the list, never widen it.
- **Correction:** The PO/TL widens intent Mapped files with a dated line, as was done on 2026-11-16. Add
  `cli/test/install.sh`, `cli/src/harness/{command-gate,sync-state,verify-on-stop}.test.mjs`, and a fixtures directory
  (for example `cli/test/fixtures/hooks/**`).

### TRC-004 — MEDIUM — AR-10 not pinned for `asdd profile`
- **Evidence:**
  - AR-10 (v2.md:475): "`H-*` detection and `bottleneck_score` SHALL key on `(slice_id, phase, failure_signature)`
    evidence fields — never on trace topology".
  - REQ-017 criterion 4 pins this for producers only. REQ-020 and REQ-021 do not say how spans are grouped.
- **Correction:** Add to REQ-020: "`asdd profile` shall group spans and compute `bottleneck_score` by `slice_id`,
  `phase`, and `kind`/`failure_signature` only, and two streams that differ only in `trace_id`/`parent_span_id` shall
  produce the same report". Back it with a fixture test.

### TRC-005 — LOW — AR-8 input exclusion if OI-2 evaluates H-* in memory
- **Evidence:** The matrix marks AR-8 "not applicable" because no evaluator *writes* spans. AR-8's input-exclusion
  clause still applies to any in-memory evaluation, and OI-2 allows `asdd profile` to evaluate H-SURGE, H-STALL, and
  H-PHANTOM.
- **Correction:** Add a conditional criterion: "Where `asdd profile` evaluates an H-* heuristic, it shall exclude spans
  whose `writer` is `heuristic-evaluator`, `harness-profile`, or `validators/telemetry.mjs`".

## Section 9: Risk Assessment Details

### RSK-001 — HIGH — AP-7 Mega-capability (ruling: violation)
- **Evidence:**
  - The criterion in `.agents/skills/anti-pattern-detection/SKILL.md:39` reads "More than 10 FRs, more than 8 criteria,
    or more than 7 entities in one capability", and it has **no** "not a violation" case.
  - The capability has 25 FRs.
  - The requirements reference 14 entities: Span, Trace, Activation record, Profile report, Phase marker, Guidance
    document, Session, Slice, Feature, Command gate, Hook config, Installer, Installed project, Gate rule.
- **Ruling:** violation. The spec agent's defense rests on "AR-5 forbids splitting", which overstates AR-5:
  - AR-5 is *registration* atomicity: every surface a landing ships is registered in that landing.
  - AR-2 explicitly expects staged landings: "Each wave lands behind green invariants; partial waves SHALL NOT declare
    coverage".
  - After Q-6 the CLI is not copied into projects, so the `profile`/`observe` registration could land with the slice
    that ships them.

  The no-split position came from discovery as part of the recommendations; it was not a separate Q-* decision.
- **Why HIGH and not BLOCKING:** each REQ is atomic, traced, and consumable by downstream agents, and REQ-012 already
  imposes wave ordering. The danger is delivery size: one change touching about 30 files, several of them shared with
  `skill-eval` and `asdd-ui` (R-5). This is not a defect in any one requirement.
- **Decision needed (PO/TL):**
  - **Option A:** split. (a) `telemetry-emitters`: MH-01, MH-02, the MH-04 validator, and the registration of what
    they ship. (b) `telemetry-activation`: MH-03, `asdd profile`, the load hooks, and their registration.
  - **Option B:** an `override` session that accepts AP-7 for this slice, citing wave ordering (REQ-012) and atomic
    registration.
- **Recommendation:** Option B. The waves are already ordered, and splitting now would re-run discovery and spec for
  little gain. Record it explicitly, so that the spec gate's "no unresolved CRITICAL" (`QG-SPC-02`) rests on a human
  waiver and not on an agent's reinterpretation.

### RSK-002 — LOW — Attribution yield in multi-slice repos
- **Evidence:** `.harness/state/registry.json` lists seven `in_progress` slices: asdd-ui, cost-metrics,
  learn-eval-gate, skill-eval, telemetry-emitters, ui-gate-decisions, and ui-insights.
- **Problem:** Under REQ-017 every span in the kit repo is unattributed unless the OI-1 variable is set at runtime
  launch. The success metric "at least one observed steering activation for every phase … with an unambiguous
  attribution" may hold vacuously.
- **Mitigation:** This is accepted by Q-3(a). TL awareness only; see ACT-001.

### RSK-003 — LOW — Drift report is expected-red
- **Evidence:** `asdd drift --slice telemetry-emitters --requirements` reports DRIFT-03 FAIL for every REQ, because no
  feature lists them yet.
- **Assessment:** This is expected before Task Planning. It is not a spec defect.

### RSK-004 — LOW — Vendor payload and exit-code semantics
- **Evidence:** A-01 and A-02 (payload fields) and the hook exit-code semantics behind NFR-003 are vendor-documented
  and unverified in the repo.
- **Mitigation:** REQ-016 and REQ-018 already require the captured fixtures. Extend the fixture capture to record the
  runtime's reaction to a non-zero exit code.

### Checks requested by the orchestrator (results)

| Point | Result |
|---|---|
| Fail-open, command gate | **Pinned and testable.** REQ-008 criteria 1–2 (byte-identical across four states, import failure) and REQ-002. |
| Fail-closed, command gate | **Pinned and code-verified.** REQ-008 criterion 3 matches `runHookCli` (`command-gate.mjs:145-159`). |
| Fail-open, Verify-on-Stop | **Partly pinned.** REQ-009 criteria 5–6 cover the four telemetry states. Import or emit failure is not pinned (NFR-002, HIGH). |
| Fail-closed, Verify-on-Stop | **Not pinned, and not true today under Claude Code** (no top-level catch). This is pre-existing and needs a human decision (NFR-002). |
| p99 ≤ 50 ms, `emit()` | Measurable. Pin the writable state (AMB-002). |
| p99 ≤ 50 ms, `asdd observe` | **Not measurable as written** (AMB-001, HIGH). |
| Per-runtime MH-03 behavior | Claude Code `Read`/`Skill` (REQ-013) and Cursor (REQ-014) are pinned. Hookless runtimes give `unknown` (REQ-021 criterion 4; AMB-006). Shell reads give no record (REQ-013 criterion 3), but are shown as `not observed`, not `unknown` (CON-003). "Configured, not observed" is pinned (REQ-021 criterion 5). |
| "unknown" / "not observed" / "not loaded" | "not loaded" is never shown, and that is testable. "unknown" is used both as a stored value (REQ-016) and as a rendered value (REQ-021), which conflicts with AR-7's omission rule (CON-002). |
| Payload-field absence (REQ-016) | Testable. Store-or-omit needs a decision (CON-002). |
| AR-10 | Pinned for producers (REQ-017 criterion 4). Not pinned for the profile (TRC-004). |
| Deferred items | AR-4, AR-6, AR-8, AR-9, turn/subagent spans, and test spans are explicit and backed by Q-2, Q-4, and Q-11 or by the guardrail's own text. **Not explicit:** AR-3 rotation, the rollup, and H-* findings (TRC-001), and the AR-5 sensor (TRC-002). |
| Schema change | None needed (see Gate Decision). |

## Section 10: Prior Finding Resolution Check

This is the first validation report for this slice; no prior `spec-validation-report.md` existed. `QG-VAL-05` does not
apply. `docs/dissent-log.md` has no telemetry entry.

## Section 11: Agile Governance Recommendation

- **Governance model:** TECH-LEAD-REVIEW for this gate, raised from the requirements' PEER-REVIEW-ONLY.
- **Rationale:** there are six HIGH findings. Two of them need PO/TL decisions and cannot be settled by an agent:
  RSK-001 (AP-7 split versus override) and TRC-001 (AR-3 rotation). Two touch the AR-1 Blocker guardrail (NFR-002,
  NFR-003).
- **Path:**
  1. The TL decides RSK-001 and TRC-001, and the TRC-003 Mapped-files widening.
  2. `asdd-spec-agent` revises AMB-001, CON-001, NFR-002, and NFR-003, plus the MEDIUM findings it accepts. This
     produces spec version 1.1.0.
  3. Either re-validation, or a TL `override` session for the validation phase that acknowledges the remaining
     concerns.
  4. `asdd-domain-agent` runs for DOM-001…DOM-008.
  5. Design starts.
- **SLA:** TL acknowledgement before the Domain phase starts (`QG-DEC-09`). The HIGH findings must be resolved or
  waived before Design.

---

**Tools and commands used:**
- Read: requirements.md, capability.md, glossary.md, intent.md, anti-patterns.md, `docs/architecture/domain-model.md`,
  `telemetry.schema.json`, v2.md, v2.review.md, quality-gates*.md, manifest.md, and the anti-pattern skill.
- Code at file:line: `cli/src/harness/command-gate.mjs:1-159`, `cli/src/harness/verify-on-stop.mjs:1-105`,
  `cli/src/install/runtimes.mjs:1-30`, `cli/src/install/phases.mjs:86-102`, `.claude/settings.json`,
  `.cursor/hooks.json`, `package.json:9-36`.
- `asdd knowledge trace` (no REQ links yet), `asdd knowledge search`, `asdd drift --slice telemetry-emitters
  --requirements`, and a wall-time sample of `node cli/bin/asdd.mjs gate`.
- No `.codegraph/` index exists in this worktree, so CodeGraph was not used; code was read directly.
