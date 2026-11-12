---
name: documentation-and-adrs
description: >-
  Records architectural decisions as ADRs (the kit's ADR format) and updates the docs a change needs. Use when making an
  architectural decision or changing public behavior. Do NOT use for designing an API contract (the http-api module); or
  for tests — use test-driven-development.
metadata:
  tier: leaf
---

# Documentation and ADRs

Document decisions, not just code: the *why* — context, constraints, the alternatives rejected. This skill is the one
authority for the ADR format in the kit; agents (the Design agent included) cite it rather than define their own.
Conventions and examples for inline comments, API docs, README, changelog, and agent docs:
[`references/writing-docs.md`](./references/writing-docs.md). Architecture layouts (arc42, C4, quality and risk
templates): [`references/architecture-documentation.md`](./references/architecture-documentation.md).

**Operational boundary:** writes documentation files only — the ADR directory, `docs/`, README, CHANGELOG, doc comments
in the files of the change. It never changes code behavior.

## Input / Output Contract

- **Inputs:** `decision` (`string`, the decision or change to document, required); `context` (`path[]`, the spec,
  `REQ-NNN`, design notes, or diff it comes from, required); `adr_dir` (`path`, from the repository convention or the
  ADR index in `.harness/steering/structure.md`, default `docs/decisions/`).
- **Outputs:** `adr` (`markdown`, `<adr_dir>/<NNN>-<slug>.md` or the project's pattern, with Status, Date, Context with
  decision drivers, Decision, Alternatives Considered, Consequences); `docs_updates` (`markdown`, the README, changelog, API
  reference, or architecture files the change touches).

## Execution Protocol

### Step 1: Find the convention

- **Action:** inspect existing ADRs, architecture docs, ADR tooling (`.adr-dir`, `adr-tools`, MADR), and the ADR index
  binding. Match location, file extension, markup, numbering, and headings. An established convention overrides the
  default template.
- **Target:** the repository.
- **Assertion:** one convention is named (or "none found"); when two conflict, Step 1 stops at the Escalation Gate.

### Step 2: Write the ADR

- **Action:** for an architectural decision (framework or major dependency, data model, auth strategy, API style, build
  or hosting, anything expensive to reverse), write the ADR in the convention, or this default:

  ```markdown
  # ADR-NNN: <decision title>
  ## Status
  Proposed | Accepted | Superseded by ADR-XXX | Deprecated
  ## Date
  YYYY-MM-DD
  ## Context
  <the problem; slice and REQ-NNN it serves>
  Decision drivers:
  - D1 <requirement or constraint, with its REQ or source>
  ## Decision
  <the choice>
  ## Alternatives Considered
  | Option | D1 | D2 | … | Verdict |
  **Strongest argument against:** <the best case for another option, and why it does not change the decision>
  ## Consequences
  <what follows, good and bad>
  ## Steering consulted
  <steering files and bindings read, in an ASDD slice>
  ```

  The alternatives section is a judgment: drivers first (from the Context), every alternative judged against those
  drivers (not general pros and cons), evidence for each verdict (a REQ, a measurement, a spike, a documented limit),
  and the strongest argument against the chosen option. A changed decision gets a new ADR that supersedes the old one;
  never delete an ADR.
- **Target:** `<adr_dir>`.
- **Assertion:** the ADR continues the existing numbering, and every alternative row has a verdict tied to a driver.

### Step 3: Update the docs the change touches

- **Action:** for a public API, user-facing behavior, onboarding, or a recurring explanation, update the doc comment,
  API reference (OpenAPI/SDL kept aligned with the live contract), README, changelog, or agent instruction file, per
  [`references/writing-docs.md`](./references/writing-docs.md); for architecture sections or diagrams, per
  [`references/architecture-documentation.md`](./references/architecture-documentation.md). Comment the why, never the
  what; delete commented-out code instead of leaving it.
- **Target:** the documentation files of the change.
- **Assertion:** each changed public surface has its doc updated in the same diff.

## Verification Gate

1. For a new ADR: `grep -cE '^## (Status|Date|Context|Decision|Alternatives Considered|Consequences)' <adr>` prints 6
   (or the convention's heading set), and `grep -c 'Strongest argument against' <adr>` prints 1.
2. `grep -c 'D1' <adr>` prints 2 or more (drivers are named and used in the alternatives).
3. When architecture docs changed: the checklist in `references/architecture-documentation.md` holds.
4. Negative check: `git diff --name-only` lists only documentation files and doc-comment lines
   (`git diff -U0 -- '*.ts' '*.js' '*.py' …` changes comments only).

## Escalation Gate

HALT when two ADR conventions conflict in the repository (do not add a third), when the decision has no stated drivers
to judge alternatives against, or when the decision is still open (record it `Proposed` and ask). Escalate as Context →
Options → Recommendation → Decision Needed.

## Handoff & Convergence

None (terminal)
