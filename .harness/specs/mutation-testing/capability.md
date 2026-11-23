# Capability: mutation testing as a coverage sensor

**Author:** orchestrator (main session; Discovery done in the session, no sub-agent)
**Date:** 2026-11-23
**Status:** CONVERGED — PO decision 2026-11-23 (eencinas: "let's start with 1", after the ub-mode analysis).

## Category
FEATURE — ad-hoc (ub-mode analysis, item 1). One slice.

## Problem (evidence from the code)
- `cli/agents/asdd-qa-agent.md:51`: covered = "a specific executed test asserts it"; no strength check.
- `cli/src/harness/converge-lib.mjs:55-65` (CONVERGE-02) and `drift-lib.mjs` (DRIFT-04): a test *mentioning* the REQ id
  is enough.
- `cli/skills/test-driven-development/SKILL.md`: RED must fail for the expected reason, but nothing re-checks the
  finished tests against changed code.

## Capability
CAP-1: For the features of a slice, run the project's bound mutation tool on the non-test source files those features
own, and tell pass / survivors / unconfigured / no-files apart deterministically (`asdd mutate`).
CAP-2: Guide the agent on each surviving mutant: strengthen or add a behavior test (TDD skill), delete dead code, or
record an equivalent mutant with its reason (`mutation-testing` skill).
CAP-3: QA counts a MUST requirement as covered only when its features' mutation run passes (or every survivor is
recorded as equivalent); an unbound tool is reported `unconfigured`, never a pass.

## Assumptions
- A-1: Mutation tools can be pointed at a file list and exit non-zero when a mutant survives (Stryker `--mutate` with
  `thresholds.break: 100`, mutmut `--paths-to-mutate` + `mutmut results` exit, PIT `targetClasses` + `mutationThreshold`).
  The binding wraps the tool to honour "non-zero = survivors" — the same contract as `Contract command`.
- A-2: The kit dogfoods only the contract (tests with a fake tool); its own binding stays unconfigured (no devDependency).

## Domain terms (new)
Mutant, Surviving mutant, Equivalent mutant, Mutation command (binding) — see the Domain phase.
