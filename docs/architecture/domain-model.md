# Domain Model — asdd-harness-kit

> Project binding for the kit itself. Never shipped: projects get the stub from `cli/templates/docs/domain-model.md`.
> Ubiquitous Language of the harness. Seeded by the `kit-hygiene` slice (Domain phase); Module and Gate decision added by `jev-module`. Telemetry terms (last section) added by `telemetry-emitters`.

## Core Entities

| Entity | Definition | Key attributes | Relationships |
|---|---|---|---|
| **Slice** | A unit of work through the ASDD pipeline | `slice_id`, `mode` (lite/full/escalated), `phase`, `status` (in_progress/DONE/PARKED/ABANDONED) | has many Sessions; has one Feature tracker; has Spec documents |
| **Session** | An append-only event file; the only writer of slice state | `event_type`, `timestamp`, `phase`, `feature_id`, `scope_paths`, `status` (checkpoint only), `evidence`, `concerns` | belongs to a Slice |
| **Feature** | An executable projection of a task, tracked in `<slice>.features.json` | `id`, `status`, `owner`, `scope_paths`, `req_ids`, `verification`, `evidence`, `evidence_commit` | belongs to a Slice; traces to Requirements |
| **Requirement** | An EARS statement with a stable `REQ-*` ID and a priority | `id`, `priority` (MUST/SHOULD/COULD), `status` | belongs to a Slice; covered by Features and tests |
| **Gate rule** | A `QG-*` acceptance criterion in `quality-gates.md`; the only home of a numeric cutoff | `id`, gate, outcome (PASS/WARN/BLOCK) | evaluated per phase of a Slice |
| **Guidance document** | A file an agent reads: `AGENTS.md`, a steering file, an agent prompt, a skill, a runtime rule | path, `inclusion` (always/auto), tags | shipped to an Installed project unless kit-only |
| **Binding** | A project-specific steering file (`product`, `structure`, `tech`, `domain-layer.project`, `quality-gates.project`, `design-system`) | slots (`…` = unfilled) | one set per project; the kit has its own set |
| **Command gate** | The pattern allow/deny hook for shell commands | verdict (allow/deny), pattern label | called by Hook configs |
| **Hook config** | A runtime file naming hook scripts (`.cursor/hooks.json`, `.claude/settings.json`) | entries per event | project-owned; merged by the Installer |
| **Installer** | `asdd install` (`cli/`, `npx asdd-harness-kit install`) | policy per file: `refresh` (kit-owned) or `create` (project-owned seed) | writes an Installed project |
| **Installed project** | A repository the installer wrote into | `installed-versions.json` (managed and seeded files) | receives shipped Guidance documents, never kit-only artifacts |
| **Module** | An opt-in set of kit files the Installer copies only when enabled (`--modules=<id>`), recorded in `project.json` → `modules` (`true` on, `false` explicitly off) | id, files, config it adds | enabled per Installed project; `--remove-modules` deletes its files |
| **Gate decision** | The outcome of a Shape Up betting gate or a Product Delivery EARS/scope gate | decided by Jev (module) or by a human (`decided_by`) | belongs to a pitch or an intent |
| **Pattern / Proposal** | Learning loop: a repeated signal (`LP-*`) and the change that answers it (`SP-*`) | signature, occurrences, status; control, change, success | see README → Self-improving harness |

## Value Objects

- **Phase**: `discovery → spec → validation → domain → design → task_planning → implementation → qa → knowledge` (+ optional `refactor`).
- **Gate state**: PASS, WARN, BLOCK.
- **Scope path**: a repo-relative path or glob owned by a Feature.
- **Always-loaded steering**: the `inclusion: always` steering files plus `AGENTS.md`, measured in bytes against a budget.

## Domain Events

`phase_started`, `phase_completed`, `phase_blocked`, `feature_started`, `feature_completed`, `feature_blocked`, `dissent`, `override`, `checkpoint` (a checkpoint may carry `mode` or `status`).

## Bounded Contexts

- **Process (shipped)**: Guidance documents, Gate rules, Slice state machine, Feature tracker, sensors.
- **Distribution (kit-only)**: Installer, versions, npm package, kit tests, the kit's own Bindings and slices.

The boundary rule: anything in Distribution that describes the kit itself never crosses into an Installed project.

## Telemetry (added by `telemetry-emitters`, Domain phase)

> **Author:** asdd-domain-agent · **Model/Tool:** claude-opus-5-5 · 2026-11-16. Bounded context: **Process (shipped)**.
> Fixed contract: `.harness/state/telemetry/telemetry.schema.json` (`schema_version "1.0"`) and its `README.md`.
> Telemetry observes the pipeline. It is not slice state, and it never decides a gate. Source column: requirements
> `.harness/specs/telemetry-emitters/requirements.md` 1.1.0, guardrails AR-n of `docs/knowledge-base/profiling-proposals/v2.md`.

### Entities

| Entity | Definition | Key attributes | Relationships | Source |
|---|---|---|---|---|
| **Span** | One timed unit of kit work, written as one LF-terminated JSON line of at most 4,096 bytes (LF included) appended to the Stream; never edited | `span_id` (hex, schema-fixed), `trace_id`, `parent_span_id`, `kind`, `writer`, `status`, `duration_ms`, `slice_id`/`phase` (nullable), `attributes.trace_source` (env/self), `attributes.command_label` | belongs to one Trace; optionally attributed to one Slice and one Phase; emitted by a producer (Command gate, Verify-on-Stop, `asdd sync`, `asdd observe`); sub-types: **producer span** (`kind` command/hook/sync) and **Activation record** | REQ-001…REQ-010, REQ-017, REQ-019, REQ-022; DOM-001 |
| **Activation record** | A **sub-type of Span**, not a separate entity: `kind:"tool"`, `writer:"runtime-hook"`, written by `asdd observe` when a Runtime hook host reports one load of a Guidance document | `attributes.target_path` (canonical repo-relative path), `runtime` (claude/cursor), `attributes.tool_name`, runtime session id and agent id (only when the payload carries them; keys: Design OI-4), `slice_id`/`phase` (only when unambiguous) | is a Span; refers to one Guidance document by canonical path (`.harness/steering/…` or `.agents/skills/<name>/…`, aliases normalized); caused by one *Guidance load observed* event; read by the Profile report | REQ-013…REQ-017, REQ-021; DOM-003 |
| **Profile report** | The read model printed by `asdd profile` (`--slice`, `--bottlenecks`, `--json`); computed in memory per run, never persisted | phase durations (from Phase markers), p50/p95 `duration_ms` per span `kind`, activation table per phase (one column per configured runtime, Activation state legend), `bottleneck_score` per surface, unattributed-span count | reads Sessions (phase events), the Tail of Spans, Guidance documents (expected steering by tags, installed skills), the project's runtimes; writes nothing | REQ-020…REQ-023; DOM-004 |

> **Superseded by D-3 (2026-11-17):** Cursor is hookless for guidance loads, so `asdd observe` writes Activation records with `runtime` `claude` only; `asdd observe cursor` answers allow and records nothing, no Cursor load hook is installed, and the Profile report shows Cursor loads as `unknown`. The `runtime (claude/cursor)` attribute above stays valid for the schema. See `cli/test/fixtures/telemetry/cursor/README.md` and requirements 1.1.1 errata (QA-F-002).

### Actor

| Actor | Definition | Relationships | Source |
|---|---|---|---|
| **Runtime hook host** | The runtime process (Claude Code, Cursor) that starts a kit hook command with a JSON payload on stdin and reads its answer and exit code. Not a human, and not the Coding agent whose actions it reports. An actor, not a qualifier of Hook config: the Hook config is the file, the host is the process that runs it | configured by a Hook config; invokes Command gate, Verify-on-Stop, and `asdd observe`; its payload is the only source of the runtime session id and agent id of an Activation record | REQ-007, REQ-009, REQ-013…REQ-018, REQ-025; DOM-006 |

### Value objects

- **Trace**: the Spans of one producer invocation, identified by `trace_id` (inherited from `HARNESS_TRACE_ID`/`HARNESS_SPAN_ID`, or self-minted). It has one root Span (`parent_span_id: null`); child Spans carry the root's `trace_id` and `trace_source` and reference the root's `span_id`. A derived display grouping with no lifecycle of its own, hence a value object, not an entity. Source: REQ-005, REQ-010; AR-10; DOM-002.
- **Phase marker**: the window (`phase`, start, end, duration) of one Phase of one Slice, computed in memory from that slice's session `phase_started`/`phase_completed` events. Not written as a `phase` span in this slice. Differs from **Phase**: Phase is the enum value, a Phase marker is a time window for it. Source: REQ-020; DOM-005.
- **Telemetry location / Stream**: the directory `.harness/state/telemetry/` and the single append-only file `spans.jsonl` in it (gitignored). Telemetry is opt-in by the location's existence. Source: REQ-001, REQ-006, REQ-025.
- **Tail**: the last 500 lines or the last 262,144 bytes (256 KB) of the Stream, whichever is smaller; both bounds are code constants; a first line cut by the byte bound is skipped. The only part of the Stream any reader reads. Source: REQ-019, REQ-022; Q-10; DOM-007.
- **Telemetry state**: exactly one of `location absent` · `location present, stream absent` · `stream present and writable` · `stream or location unwritable`. Source: requirements conventions, REQ-001, REQ-002, REQ-018, REQ-019; DOM-007.
- **Activation state**: the value a Profile report shows per Guidance document, runtime, and phase: `observed` · `not observed` (a runtime with load hooks reported no load) · `unknown` (the load is not visible to the kit: shell-mediated reads, every load on a runtime without load hooks) · `configured, not observed` (enters context without a tool call: `CLAUDE.md`, `alwaysApply` rules, skill descriptions). Source: REQ-021.
- **Command label**: the pattern-class label a Command gate span carries in `attributes.command_label`, from a closed set (denied label, allowlist, unmatched, empty); never command text. Source: REQ-004, REQ-007.

### Domain event (telemetry, not a session event)

- **Guidance load observed**: a Runtime hook host reports a read of a steering file, or a read or invocation of a skill installed under `.agents/skills/`. Effect: `asdd observe` appends at most one Activation record. It is **not** one of the nine session events listed under Domain Events above, and it creates no Session file (v2.md DOM-003, the forging rule). Source: REQ-006, REQ-013, REQ-014; DOM-007.
  > **Superseded by D-3 (2026-11-17):** REQ-014 (requirements 1.1.1 errata) now states that a Cursor read produces no Activation record; only Claude Code is a Runtime hook host for this event. See `cli/test/fixtures/telemetry/cursor/README.md`.

### Invariants

- **TEL-1 Labels only.** A Span never carries raw command text, file contents, absolute paths, transcript paths, tokens, or secrets; a path in a Span is repo-relative. The kit never parses command text to infer a load. Source: REQ-004, REQ-007, REQ-013.
- **TEL-2 Append-only.** One Span is one append write; earlier bytes of the Stream never change. Producers never set the evaluator-reserved attributes `heuristic`, `trigger_span_id`, `source`, and never emit `kind` `phase`, `turn`, `subagent`, or `test` in this slice. Source: REQ-001, REQ-005.
- **TEL-3 No session forging.** Telemetry never creates, edits, or deletes a Session, generated manifest, registry, Feature tracker, or learning signal; Sessions stay the only writer of slice state. Source: REQ-006; v2.md DOM-003.
- **TEL-4 Fail-open.** Emitting a Span never changes a caller's return value, exit code, output, or gate verdict; a Command gate verdict is decided independently of its span and stays fail-closed. Source: REQ-002, REQ-008, REQ-018.
- **TEL-5 Topology is not a key.** `trace_id`, `parent_span_id`, and `HARNESS_TRACE_ID` group Spans for display only; detection, scoring, grouping in the Profile report, and attribution key only on `slice_id`, `phase`, `kind`, `failure_signature`. Source: REQ-017, REQ-020; AR-10.
- **TEL-6 Unambiguous attribution.** `slice_id`/`phase` are set only when an explicit attribution env var (name: Design OI-1) names an existing slice, or exactly one slice is `in_progress`; otherwise both are `null`. Source: REQ-017.
- **TEL-7 Evidence, not absence.** An Activation record is evidence of an observed load. A missing record means `not observed` only on a runtime with load hooks; on a hookless runtime or for a shell-mediated read it means `unknown`. Nothing is ever reported as "not loaded". Source: REQ-013, REQ-021; Q-2, Q-8.
- **TEL-8 Absent is omitted.** A payload field the runtime does not send is left out of the Activation record, never guessed or derived; a record without a path is not written. Source: REQ-016; AR-7.
- **TEL-9 Read-only readers.** The Profile report and the telemetry validator read at most the Tail; the Profile report writes no file; telemetry validator findings are WARN only and never change the `asdd check` exit code. Source: REQ-019, REQ-022.

### State ownership (binding: `domain-layer.project.md`)

| Concept | State classification | Port / owner |
|---|---|---|
| Span, Activation record | durable, append-only, gitignored observation data (not slice state) | `.harness/state/telemetry/spans.jsonl`, contract `telemetry.schema.json` 1.0 |
| Trace, Phase marker, Tail, Telemetry state, Activation state | derived, transient (computed per call) | none persisted |
| Profile report | transient read model | stdout only |

### Terms to avoid

- **Signal** for a Span: a signal is a learning-loop record (Pattern / Proposal). Say "span".
- **Turn** for a Session: a turn is one agent invocation; a Session is one append-only state file. Turn spans are deferred.
- **Not loaded**: use the Activation state values.
- **DOM-003** without a qualifier: v2.md DOM-003 (telemetry never forges session events) is not steering `DOM-03` of `domain-layer.md` (explicit exceptions). Cite it as "v2.md DOM-003" or TEL-3.
