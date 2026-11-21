# platform-spec — Tasks

| Task | Title | Verification | Scope paths |
|------|-------|--------------|-------------|
| TASK-001 | Vault `_prompt.md` + `v0.md` for integrated platform proposal | files exist; synthesize 7 records (RT-1..8, B-1..8, Q-R1..20); EARS D-* + phase plan | vault:@asdd-harness-kit/proposals/platform/_prompt.md, vault:@asdd-harness-kit/proposals/platform/v0.md |
| TASK-002 | Conformance spec + fixture suite `cli/test/conformance/` | `node --test cli/test/conformance.test.mjs` green; fixtures assert exit codes + stable output + state effects on Node reference | cli/test/conformance/, cli/test/conformance.test.mjs, docs/spec/conformance-spec.md |
| TASK-003 | Benchmark harness + toolchain evaluation | `node cli/test/conformance/bench.mjs` produces evidence JSON; Node baseline + go/rustc/clang spikes measured; budgets named | cli/test/conformance/bench.mjs, docs/knowledge-base/platform-benchmarks/v0.md |
| TASK-004 | Cross-platform hooks + MCP disposition | PowerShell/cmd hook launchers exist in runtime projection; v0.md §integrations disposition recorded; install smoke covers wrapper presence | cli/runtimes/, cli/scaffold/, vault v0.md |
