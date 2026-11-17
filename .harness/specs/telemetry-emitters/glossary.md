# Glossary: telemetry-emitters

**Author:** asdd-discovery-agent
**Model/Tool:** claude-opus-5-5 (Claude Code sub-agent)
**Date:** 2026-11-16

**Source texts:**
- `.harness/specs/telemetry-emitters/intent.md`
- `docs/knowledge-base/profiling-proposals/v2.md`
- `.harness/state/telemetry/README.md`
- PO decision 2026-11-16 (relayed by the orchestrator)

**Compared against:** `docs/architecture/domain-model.md`. Each entry is labeled `new`, `matches`, or `contradicts`,
with a confidence of high, medium, or low. Confirmed terms reach `domain-model.md` through the Domain agent.

## Core domain entities
- **Span**: one timed unit of work, written as one JSONL line of at most 4,096 bytes in `.harness/state/telemetry/spans.jsonl`, append-only and never edited. Relationships: belongs to one trace; may carry `slice_id` and `phase`. Label: new; confidence: high. source: README.md "Layout" and "Contract in brief"; v2.md §2.1–§2.2
- **Trace**: the group of spans of one producer invocation, correlated by the `HARNESS_TRACE_ID`/`HARNESS_SPAN_ID` env vars. It is used only to group spans for display, never for detection. Label: new; confidence: high. source: v2.md §2.1, AR-10; README.md "Trace := one producer invocation"
- **Activation record**: a span (`kind:"tool"`) recording that a runtime reported one load of a guidance document. It holds the repo-relative path, the runtime, the runtime session id, the agent id when known, and `slice_id`/`phase` only when unambiguous. Label: new; confidence: medium (the shape is a discovery decision). source: intent.md MH-03; PO decision 2026-11-16 Q-1, Q-3, Q-13
- **Profile report**: the read-only output of `asdd profile` (`--slice`, `--bottlenecks`, `--json`). It covers phase durations, latencies, the activation table, and `bottleneck_score`. Label: new; confidence: high. source: intent.md MH-04; v2.md §5; PO decision 2026-11-16 Q-11
- **Phase marker**: a `phase` window computed from session `phase_started`/`phase_completed` events. In this slice it is computed in memory and never written. Label: new; confidence: medium. source: v2.md §2.1, A-6; PO decision 2026-11-16 Q-11
- **Guidance document**: a file an agent reads: a steering file, skill body, agent prompt, or runtime rule. Label: matches; confidence: high. source: intent.md "Problem" (steering files and skills); domain-model.md Core Entities
- **Hook config**: the runtime file naming hook commands (`.claude/settings.json`, `.cursor/hooks.json`). This slice adds load hooks to it. Label: matches; confidence: high. source: intent.md (PO-widened Mapped files); domain-model.md Core Entities

## Personas
- **Coding agent**: a runtime-hosted ASDD agent (Claude Code, Cursor, Devin) whose guidance loads are observed. It writes no spans in this slice. Label: matches (product.md actor); confidence: high. source: intent.md "Problem"; PO decision 2026-11-16 Q-2
- **Runtime hook host**: the runtime process that starts the kit's hook commands with a JSON payload on stdin. It is not a human. Label: new (actor term; related to Hook config); confidence: medium. source: v2.md §1.2 P-5/P-6; PO decision 2026-11-16 Q-1
- **Kit maintainer / Tech Lead**: reads the profile report to decide which guidance earns its place. Label: matches (product.md actors); confidence: high. source: intent.md "Problem" ("installed vs. actually used")

## Domain events
- **Guidance load observed**: the runtime reports a read of a steering file, or a read or invocation of a skill. Downstream: `asdd observe` emits one activation record. It is never a session event (DOM-003). Label: new; confidence: medium. source: intent.md MH-03; PO decision 2026-11-16 Q-1

## Domain processes
- **Fail-open emit**: hand a span to `telemetry-lib.emit()`. It makes one append-mode write, never throws, never changes a verdict, and returns false when the directory is missing. Label: new; confidence: high. source: intent.md MH-01; v2.md D-3, AR-1
- **Atomic registration**: one landing registers everything: command entries, test script, scaffold source, the `HARNESS_FILES` row, gitignore lines, load hooks, vendored copies, versions, and README rows. Label: new; confidence: high. source: intent.md MH-05; v2.md AR-5; PO decision 2026-11-16 Q-6

## Business rules
- **Unknown is not absent**: a runtime with no load signal, or a shell-mediated read, is reported as `unknown`, never as "not loaded". Label: new; confidence: high. source: PO decision 2026-11-16 Q-2, Q-8
- **Configured, not observed**: `CLAUDE.md`, `alwaysApply` rules, and skill descriptions enter context without a tool call. `asdd profile` lists them from configuration when it runs; no span is written for them. Label: new; confidence: high. source: PO decision 2026-11-16 Q-9
- **Labels only**: spans never carry raw command text or file contents, and the kit never parses command text to infer loads. Label: new; confidence: high. source: intent.md "No-gos"; v2.md DOM-005; PO decision 2026-11-16 Q-8
- **Unambiguous attribution**: `slice_id`/`phase` are set only when exactly one slice is `in_progress` or an explicit env var names the slice; otherwise the record is unattributed. Label: new; confidence: medium (the env var is named in Design). source: PO decision 2026-11-16 Q-3

## Metrics
- **Activation gap**: guidance expected or installed versus guidance observed as loaded, per slice and phase. For steering, "expected" comes from frontmatter tags. For skills, the comparison is installed against loaded. Label: new; confidence: medium. source: intent.md "Problem"; docs/ASDD-ROADMAP.md G15
- **Emit latency budget**: p99 ≤ 50 ms per `emit()`, and per load-hook event. Label: new; confidence: high. source: intent.md MH-01; PO decision 2026-11-16 Q-14
- **Tail bound**: reads cover at most the last 500 lines or 256 KB of the stream (code constants). Label: new; confidence: high. source: v2.md AR-3; PO decision 2026-11-16 Q-10
- **bottleneck_score**: a deterministic ranking: Σ(severity weight × hits) + ⌊share of slice time / 10%⌋. Label: new; confidence: high. source: v2.md §4

## Acronyms
- **AR-n**: a Phase-2 guardrail of the profiling proposal (AR-1…AR-10). Label: new; confidence: high. source: v2.md §8.2
- **DOM-003**: the rule that telemetry never forges session events. Label: new; confidence: high. source: v2.md §2.5; intent.md "No-gos"

## Terms to avoid
- **Signal (for telemetry output)**: use "span". "Signal" already means a learning-loop record. Label: contradicts if misused (learning signal, domain-model Pattern); confidence: high. source: v2.md DOM-002
- **Turn (as a synonym of session)**: a turn is one agent invocation, and a session is one append-only state file. Turn spans are deferred in this slice. Label: contradicts if conflated (domain-model Session); confidence: high. source: v2.md DOM-001; PO decision 2026-11-16 Q-2

## Open questions
None block discovery. Left to Design or the Domain phase:
- Name of the explicit env var for attribution (Q-3).
- Whether "Runtime hook host" becomes a domain-model actor or stays a qualifier of Hook config.
- Whether "Activation record" enters `domain-model.md` as its own entity or as a sub-type of Span.
