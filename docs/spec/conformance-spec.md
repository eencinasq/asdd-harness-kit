# ASDD Executor Conformance Specification v1

**Status:** normative behavioral contract (platform proposal `v0` D-3). Any executor — Node reference or compiled — claiming ASDD parity must pass this suite on every supported release cell. **A supported cell requires a release artifact AND a conformance pass; compile success is not support.**

## 1. Consumer command surface

The consumer surface is the kernel-owned `commands.harness` table in `cli/registry/contribution-points.json` (23 commands at authoring). `commands.kit` is maintainer tooling — out of native-parity scope. `install`/`uninstall`/`doctor` are control-plane entries.

Each command contract fixes: command ID, args/defaults, cwd/env behavior, stdin payload grammar, exit status, stable machine output fields, diagnostics, side effects, and idempotence.

## 2. Exit-status vocabulary

| Code | Meaning |
|---|---|
| `0` | success (verdicts like allow/PASS included — a report is not a verdict) |
| `1` | contract-defined negative (gate FAIL, drift blocking, check FAIL) |
| `2` | usage error (bad args, malformed invocation) |
| `3` | no data for the requested scope (e.g. `profile` on span-less slice) |

Hooks (`gate`, `verify`) emit their runtime payload on stdout and use `exit 0`/`exit 2` per runtime contract — the verdict lives in the JSON, not the exit code, unless `failClosed` applies.

## 3. Machine diagnostics

Machine paths (`--json`, hook payloads) carry:

```json
{ "ok": true|false, "error"?: { "code": "E-*", "message": "…" } }
```

Stable codes: `E-PIN-MISMATCH`, `E-UNSUPPORTED-TARGET`, `E-SCHEMA`, `E-DRIFT`, `E-INTEGRITY`, `E-USAGE`. Human output follows a looser policy and is not conformance-tested beyond declared `stdout_contains` rows.

## 4. Fixture format (`fixtures/*.json`)

```jsonc
{
  "name": "check-clean-install",
  "setup": [                              // ordered, declarative
    { "op": "install", "args": ["--no-interactive"] },
    { "op": "slice", "id": "demo" },
    { "op": "write", "path": ".harness/state/...", "content": "…" },
    { "op": "append", "path": ".harness/state/telemetry/spans.jsonl", "content": "…" }
  ],
  "invoke": { "cmd": "check", "args": ["--slice","demo"], "stdin": null, "env": {} },
  "expect": {
    "exit": 0,
    "stdout_contains": ["PASS"],
    "stdout_json": { "ok": true },        // for --json/payload commands: field equality after normalization
    "files": { ".harness/state/slices/demo/manifest.json": { "exists": true } },
    "spans_tail": { "kind": "command" }   // optional: last spans.jsonl record fields
  },
  "normalize": ["timestamps","ids","durations","paths","bytes"]
}
```

**Normalizer declaration is mandatory.** A fixture asserting on a field that a normalizer covers must name it — masking semantic drift is forbidden. Normalizers rewrite ISO timestamps, 8–32-hex ids, `duration_ms`, absolute paths, and byte counts to placeholders before comparison.

## 5. Runner contract

`conformance.run(fixture, { executor }) → {exit, stdout, stderr, effects}` — the Node reference binds `cli/bin/asdd.mjs`; a native executor binds its binary and runs the identical fixture set. Equivalence is judged on normalized output + declared state effects only.

## 6. What conformance does not cover

- Human output wording beyond declared contains-rows.
- Kit maintainer commands (`commands.kit`) — Node-only surface.
- Timing — latency is benchmark evidence (`bench.mjs`), never a conformance predicate.
