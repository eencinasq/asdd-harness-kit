# platform-spec — Spec

> Lite exception: this slice's spec lives here; `intent.md`/`design.md` summarize scope and approach. Full-mode slice (cross-cutting: vault proposal + kit conformance + toolchain).

## Intent

Execute Wave 4 of `@work.plan.md` — Enterprise Platform Specification & Native Executor (`proposals/platform`). Turn the seven problem records (`_problem.engine|compiler|architecture|specification|distribution|integrations|security`) into an integrated platform proposal plus the kit-side Phase-1 deliverables: a language-neutral behavioral specification with an executable conformance fixture suite, an evidence-based compiled-executor benchmark/toolchain evaluation, and a cross-platform hook/MCP boundary contract.

## Requirements

- **REQ-001 (Task 4.1 — Integrated proposal):** `@asdd-harness-kit/proposals/platform/_prompt.md` and `v0.md` exist, synthesize all seven child records (RT-1…RT-8, B-1…B-8, Q-R1…Q-R20), and carry EARS decisions (`D-*`), assumptions (`A-*`), open human questions (`Q-R*`), and a phase plan. `v0.md` must not silently ratify unverified baseline claims — current-state citations are revalidated against the working tree.
- **REQ-002 (Task 4.2 — Conformance specification):** a portable, language-neutral spec of consumer command behavior — command IDs, args/defaults, exit statuses, stable machine output, diagnostics, side effects — plus an executable fixture suite under `cli/test/conformance/` that runs identical input trees against the Node reference executor and asserts golden results (exit codes, stable JSON fields, state effects; nondeterministic fields normalized and declared).
- **REQ-003 (Task 4.3 — Benchmark & toolchain evaluation):** a repeatable benchmark harness measuring cold/warm startup and p50/p95 for `gate`+`verify`-class invocations of the Node reference and Go/Rust/C++ spike binaries on named hardware/OS; results recorded as evidence (not decisions) with the `<15 ms` hook-latency budget vs Node's measured baseline; `cli/dist` → native cutover + provenance/SBOM model defined in `v0.md`.
- **REQ-004 (Task 4.4 — Hooks & MCP boundary):** POSIX-only hook invocation is replaced or wrapped so a supported executor launches without POSIX syntax on Windows (`PowerShell`/`cmd.exe` projections in the runtime installer); the three NestJS MCP services (`spec-drift`, `knowledge`, `jev-gate`) get an explicit keep/port/replace disposition in `v0.md`.

## Out of scope

- Implementing the native executor (Phase 2+ of the proposal; Wave 4 ratifies spec + evidence only).
- Migrating existing state, generated files, sessions, or installed artifacts.
- Choosing the implementation language — evidence is produced; the `D-*` selection needs the human's `Q-R7` disposition in the review cycle.
