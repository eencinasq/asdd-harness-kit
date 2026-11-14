# ASDD + Harness — Playbook

How to use the kit day to day: **what** it is for, **when** to reach for each part, **where** to set it up, and the
**plays** that cover most situations. For how it works inside, see the [README](../README.md). For PR review and
architecture analysis in chat, see the [spec-drift playbook](../tools/spec-drift/docs/PLAYBOOK.md).

---

## 1. What it gives you

| Capability             | You ask for                                     | You get                                                                                    |
| ---------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Governed sessions**  | "Implement the next task of slice X"            | An agent that reads the slice state, edits only mapped files, and logs every step          |
| **Specs that stay**    | "Start a slice for <intent>"                    | Intent → requirements (EARS) → design → tasks → features, each traceable to the next       |
| **Done means done**    | (automatic when a feature closes)               | `passing` only with a verification command, its evidence, and a green `asdd check`         |
| **Spec drift**         | (automatic: Verify-on-Stop and CI)              | DRIFT-01…07: unmapped changes, stale evidence, MUSTs without features or tests             |
| **Right-sized process** | "This is small" / "This is a hotfix"           | Lite and hotfix slices; escalation to the full path only when evidence demands it          |
| **Codebase audit**     | "How healthy is the code?"                      | A dated report: drift over all slices, unowned code, churn hotspots, your audit commands   |
| **Learning loop**      | "What keeps failing?"                           | Recurring failures as patterns, proposals to change a guide or sensor, and their follow-up |
| **Process memory**     | "Which feature implements REQ-004?"             | The knowledge index: search, REQ → feature → file traces, slice summaries                  |
| **Pipeline view**      | "Where are we?"                                 | Active slices, phases, uphill work, escalation signals, adoption metrics                   |

What it is **not**:

- **Not a project manager.** No backlog, stories, points or sprints: work is a Shape Up bet, split into scopes, each
  scope one slice.
- **Not a code generator.** The agent writes the code; the harness decides what it may touch and when it is done.
- **Not a reviewer.** It checks structure and evidence deterministically; judging whether code satisfies a requirement
  stays with people (and the review tools of [spec-drift](../tools/spec-drift/docs/PLAYBOOK.md)).

---

## 2. When to use it

| Moment                                                         | Who            | Play                                                         |
| -------------------------------------------------------------- | -------------- | ------------------------------------------------------------ |
| Adopting the kit in an existing repository                     | Tech Lead      | [Adopt it](#play-a--adopt-it-in-an-existing-repository)      |
| A small, well-understood change                                | Engineer       | [Lite slice](#play-b--a-small-change-lite-slice)             |
| A bet was placed on a shaped pitch                             | Team           | [Shaped bet](#play-c--a-shaped-bet-full-path)                |
| Production is broken                                           | Engineer       | [Hotfix](#play-d--production-is-broken-hotfix)               |
| A lite slice turned out bigger than it looked                  | Engineer, TL   | [Escalate](#play-e--a-lite-slice-grows-escalate)             |
| The session was blocked at stop, or `asdd check` is red        | Engineer       | [Red check](#play-f--the-check-is-red)                       |
| A shipped capability needs a change                            | Engineer       | [Amend](#play-g--change-a-shipped-capability-amend)          |
| Several people work on one slice                               | Engineers      | [Parallel work](#play-h--several-people-on-one-slice)        |
| A pull request is opened                                       | Tech Lead      | [PR gate](#play-i--a-pull-request)                           |
| Weekly, or before a release                                    | Tech Lead      | [Health check](#play-j--weekly-health-check)                 |
| The same failure keeps coming back                             | Tech Lead      | [Learning loop](#play-k--the-same-failure-keeps-coming-back) |
| You look after several repositories                            | Tech Lead      | [Portfolio](#play-l--several-repositories)                   |

**Skip it** for throwaway spikes and experiments outside the product code. **Do not bypass it** by editing generated
files (`manifest.json`, `registry.json`, `PROGRESS.md`) or session logs by hand: they are regenerated or append-only.

---

## 3. Where to set it up

### Which runtime

| Runtime                            | Command gate                          | Verify-on-Stop                                 | Best for                                  |
| ---------------------------------- | ------------------------------------- | ---------------------------------------------- | ----------------------------------------- |
| **Cursor**                         | `beforeShellExecution` (fail-closed)  | `stop` hook (blocks the session on FAIL)       | Day-to-day work in the editor             |
| **Claude Code**                    | `PreToolUse` (Bash)                   | `Stop` hook                                    | Terminal workflows, subagents             |
| OpenCode, Kimi, Junie, Devin, Kiro | Advisory: `asdd gate` before risky commands | Run `asdd check --live` before `passing` | Teams already on them; CI enforces        |

Advisory stop mode (`stop.mode: "advisory"` in `project.json`, or `HARNESS_STOP_MODE=advisory`) runs the check and
records learning signals without blocking the session — useful during adoption.

### Where things end up

| What                                   | Where                                                    | Commit it?                     |
| -------------------------------------- | -------------------------------------------------------- | ------------------------------ |
| Specs (intent, requirements, design…)  | `.harness/specs/<slice>/`                                | **Yes** — the source of truth  |
| Feature tracker                        | `.harness/features/<slice>.features.json`                | **Yes**                        |
| Session logs (append-only)             | `.harness/state/slices/<slice>/sessions/*.json`          | **Yes**                        |
| Manifests, registry, `PROGRESS.md`     | `.harness/state/…`, `.harness/PROGRESS.md`               | Yes (generated by `asdd sync`) |
| Steering and project bindings          | `.harness/steering/` (`*.project.md` are yours to fill)  | **Yes**                        |
| Audit reports and triage               | `.harness/audits/`                                       | Yes                            |
| Knowledge index                        | `.harness/knowledge/`                                    | No — generated, gitignored     |
| Shape Up pitches and handoffs          | `docs/pitches/`                                          | Yes                            |

### One-time checklist

- [ ] Node 22+, git, and the CLI: `npm i -D asdd-harness-kit` (pinned per project) or `npm i -g asdd-harness-kit`
- [ ] `asdd install . --runtime=cursor` (or `claude`, …; add `--modules=…` if you need them) — or `asdd init-flow`
- [ ] `asdd doctor` shows `ok` (or `warn` for optional tools such as semgrep and codegraph)
- [ ] Fill the project bindings in `.harness/steering/` (`product.md`, `structure.md`, `tech.md`,
      `domain-layer.project.md`, `quality-gates.project.md`): stubs are not product truth and block the gates that need them
- [ ] `asdd check-config` and `asdd check` exit 0
- [ ] CI runs `asdd check` on every pull request
- [ ] The Tech Lead owns the gate files, bindings, `controls.md` and hook config in CODEOWNERS
      (example: `.github/CODEOWNERS.harness.example`)

---

## 4. Plays

### Play A — Adopt it in an existing repository

```bash
npx asdd-harness-kit init-flow --runtime=cursor
```

`asdd init-flow` is the 15-minute path: it installs the harness if needed, fills the minimum bindings for a green check,
creates one lite slice with a sample feature, and runs `asdd check`. Then replace the stubs with real bindings, one at a
time, as the gates that need them come up. Start with `stop.mode: "advisory"` for a week if the team is new to it, and
keep `drift.contract: "warn"` until every feature has `scope_paths` and evidence; then switch both to blocking.

To understand an existing codebase first: the `capability-discovery` skill drafts capability files from the code.

### Play B — A small change (lite slice)

```bash
asdd slice init fix-login-redirect          # lite by default
```

Ask the agent: _"Write the spec for fix-login-redirect: <what and why>"_, then _"Implement the next task"_. A lite
slice has four artifacts — `spec.md`, `design.md`, `tasks.md`, the features file — and runs one feature at a time.
Each feature names its `scope_paths` (the files it may touch) and a verification command; it becomes `passing` only
with that command's result as evidence and `asdd check` green. Close with the QA and Knowledge phases; `asdd status`
shows where it stands.

The agent skills do the bookkeeping: `asdd-next` picks the next ready feature, `asdd-implement` codes it inside its
scope, `asdd-converge` checks requirements, test mentions and evidence before `passing`, `asdd-status` reports.

### Play C — A shaped bet (full path)

1. **Shape** — _"Shape a pitch for <idea>"_ (the `shape-up` skill): problem, appetite, solution, rabbit holes, no-gos.
   A person bets on it, or lets it go.
2. **Split** — _"Split the bet pitch into scopes"_ (`product-delivery`): one `intent.md` per scope, each one slice.
3. **Specify** — per scope: `asdd slice init <id> --full`, then the agents run Discovery → Spec → Validation →
   Domain → Design → Task Planning, with a human gate where the steering says so.
4. **Build** — Implementation, feature by feature; QA checks every MUST requirement has a feature and a test; Knowledge
   records decisions and cut scope.

Choose `--full` upfront for new capabilities, cross-cutting or architectural work, or several domains. At the end of
the cycle, ship the verified must-haves and cut the rest — unfinished work is re-shaped, never carried over.

### Play D — Production is broken (hotfix)

```bash
asdd slice init hotfix-payment-timeout --hotfix
```

A hotfix slice skips Discovery: one stub feature at implementation. Fill its scope and verification, fix, prove it with
evidence, and close. If the fix grows, the escalation signals will say so (Play E).

### Play E — A lite slice grows (escalate)

Growth is detected, not judged: a scope across modules (E1), more than one feature in progress (E2), new domain terms
(E3), a dissent (E4), or a blocked implementation (E5). Open signals are warnings; closing QA or Knowledge with them
open is a failure. When `asdd check` asks for it:

```bash
asdd slice escalate <id> --reasons "E1-scope-spread"
```

then backfill `capability.md` and `requirements.md` from `spec.md` and continue at Validation on the full path.

### Play F — The check is red

`asdd check` (and Verify-on-Stop, which runs `asdd check --live`) prints one line per problem with what to do. The
usual ones:

| Line                    | Meaning                                                           | Do                                                                                  |
| ----------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `DRIFT-01`              | A changed file is not mapped by the slice you are editing          | Map it in the spec or a feature's `scope_paths`, or revert it                       |
| `DRIFT-02`              | A `passing` feature's files changed after its verification         | Set it back to `in_progress`, rerun its verification, record evidence, `asdd sync`  |
| `DRIFT-03` / `DRIFT-04` | A MUST requirement has no feature / no test mentions a REQ         | Add the feature; tag the test with the REQ id                                       |
| Escalation signal       | A lite slice grew                                                  | Play E                                                                              |
| Invariant failures      | Schema, serial lite work, missing evidence                         | Follow the message; `asdd repair --dry-run` for layout problems                     |

`asdd drift --json` shows the drift checks on their own. Never mark a feature `passing` to make the check green.

### Play G — Change a shipped capability (amend)

```bash
asdd slice amend <id> --note "add CSV export to the report"
```

reopens a `DONE` slice with an amendments note, so the capability evolves in its own specs instead of a new pitch.
A new problem, actor or appetite is a new pitch (Play C).

### Play H — Several people on one slice

Give each feature an `owner` and disjoint `scope_paths`, and keep dependencies explicit. `asdd waves --slice <id>`
suggests which features can run in parallel. Otherwise, work in separate slices. Lite and hotfix slices stay serial.

### Play I — A pull request

1. CI runs `asdd check` (with `HARNESS_PR_BRANCH` / `HARNESS_PR_BODY` it also requires the PR to name its slice —
   branch `slice/<id>/…` or `Slice: <id>` in the body). A red PR goes back without review.
2. The Tech Lead reviews what machines cannot judge: `audit_diff` in review mode and `pr_review_*` on the
   [spec-drift server](../tools/spec-drift/docs/PLAYBOOK.md), or `asdd drift --base origin/main` in a terminal.
3. Each advisory finding is confirmed (it becomes a task in the engineer's slice) or dismissed with a reason:
   `asdd triage <finding-id> --dismiss --reason "…"` (or `--confirm`). A dismissed finding comes back when its code
   changes.

### Play J — Weekly health check

```bash
asdd audit                 # dated report in .harness/audits/: drift over all slices, unowned code, hotspots
asdd status --metrics      # lite share, escalation rate, phase medians, stop failures
asdd status --html > pipeline.html
```

Read the hotspots first: files that churn, carry requirements and break rules. The `codebase-audit` skill judges them
against their requirements with file-and-line evidence. Triage findings (Play I, step 3). With the spec-drift server,
`drift_trend` and `traceability_matrix` answer "is drift going down?" and "which requirement has no test?".

### Play K — The same failure keeps coming back

```bash
asdd learn                       # open patterns: recurring failures and noisy checks
asdd learn --propose LP-0003     # scaffold a steering proposal for one pattern
```

Agents log failures in `docs/agent-failure-log.md` with a `**Signature:**` line; failing checks, gate denials and
blocked sessions are recorded automatically. A pattern that recurs becomes a proposal to change a guide or a sensor;
the Tech Lead accepts or rejects it; after the change, the loop watches for recurrence (ineffective → reopened, quiet
→ verified).

### Play L — Several repositories

List the repositories in `.harness/config/portfolio.json` (`{ "repos": [{ "id": "shop", "path": "../shop" }] }`) and
run `asdd portfolio` for a read-only summary of each one's slices and health. For analysis snapshots and audit levels
side by side, use `repos_overview` on the spec-drift server.

---

## 5. Working well with it

- **Small slices.** Lite first; escalate on evidence. A slice that needs a page to explain is a scope split.
- **Name the files.** Good `scope_paths` make DRIFT-01 and DRIFT-02 precise; a whole folder makes every edit "in scope".
- **One verification command per feature** that a machine can rerun — it is what keeps `passing` honest after later
  changes.
- **Tag tests with REQ ids** (`REQ-004` in the test name or a comment): it is how QA and the traceability matrix find them.
- **Fill bindings with real values**, never with plausible ones: an unfilled binding reports `unconfigured`, a wrong one
  hides problems.
- **Let the agent HALT.** When a precondition cannot be met, the steering makes the agent stop with options and a
  recommendation; answer the decision instead of asking it to work around it.
- **Developers commit.** The harness never commits or pushes; review the session's changes and commit them yourself.

---

## 6. Quick reference

| I want to…                         | Run / say                                              |
| ---------------------------------- | ------------------------------------------------------ |
| Adopt the kit in a repo            | `asdd init-flow` (or `asdd install . --runtime=…`)     |
| Check the install                  | `asdd doctor`                                          |
| Start a small change               | `asdd slice init <id>`                                 |
| Start shaped, cross-cutting work   | `asdd slice init <id> --full`                          |
| Fix production                     | `asdd slice init <id> --hotfix`                        |
| Pick / implement / close a feature | "next task" · "implement it" · "converge it"           |
| See where we are                   | `asdd status` (`--metrics`, `--html`)                  |
| Check everything                   | `asdd check`                                           |
| See only spec drift                | `asdd drift` (`--json`, `--base <ref>`)                |
| Regenerate manifests and index     | `asdd sync`                                            |
| A lite slice grew                  | `asdd slice escalate <id> --reasons "E1-scope-spread"` |
| Reopen a shipped slice             | `asdd slice amend <id> --note "…"`                     |
| Parallel work in a slice           | `asdd waves --slice <id>`                              |
| Audit the codebase                 | `asdd audit`                                           |
| Dismiss or confirm a finding       | `asdd triage <id> --dismiss --reason "…"` / `--confirm` |
| Recurring failures                 | `asdd learn` · `asdd learn --propose <LP-id>`          |
| Search specs and features          | `asdd knowledge search "<query>"`                      |
| Trace a requirement                | `asdd knowledge trace req:<slice>:REQ-001`             |
| Several repositories               | `asdd portfolio`                                       |
| Every command                      | `asdd help`                                            |

Something not working? See the [README](../README.md) (install, troubleshooting in each section) and `asdd doctor`.
