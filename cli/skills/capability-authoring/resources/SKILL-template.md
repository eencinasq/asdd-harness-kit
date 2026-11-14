---
name: <skill-name>
description: >-
  <one-paragraph capability summary — third-person, what it does and what it
  produces>. Use when <positive trigger: concrete task/request forms>. Do NOT
  use for <out-of-scope intents — artifact types or named sibling skills>.
metadata:
  tier: leaf
---

# <Title Case Name>

<one-sentence purpose>. **Operational boundary:** writes only <paths this
skill may write>; <mode clause if writes differ by repo context — see
skill-profile.md kit rule 2>. Never edits <explicit non-targets>.

<!-- Conditional slot: delete when no external deps exist -->
## Preconditions

1. <required file/tool/state that must exist before running>
2. <mode/context probes that must resolve first>

<!-- Conditional slot: required when outputs feed a skill, agent phase, or
harness gate; drop for pure-coaching skills -->
## Input / Output Contract

- **Inputs:** `<name>` (`<type>`, <constraints>, required|default `<v>`)
- **Outputs:** `<name>` (`<type>`, `<path>`); `<transient-output>`
  (**transient** — reported in the final message, never persisted)

## Execution Protocol

### Step 1 [<C#·Level×Knowledge-Type>] — <step name>
**Action:** <imperative verb matching the Bloom level>.
**Target:** <file/slot/in-context notes the step writes or reads>.
**Assertion:** <intermediate check proving the step's level-appropriate
proof shape — citations for C4, verdict+evidence for C5, checklist for C6>.

### Step 2 [<C#·Level×Knowledge-Type>] — <step name>
**Action:** …
**Target:** …
**Assertion:** …

<!-- Steps chain ascending (C1→C4→C5→C6); exactly one [Cn×Type] tag each -->

## Verification Gate

1. <machine check 1 — command + expected exit>
2. <machine check 2 — mode-aware branch if writes differ by repo context>
3. **Recorded manual checklist** — <profile items a human/agent verifies;
   reported in the final message, transient>
4. **Scoped delta check** — before/after `git status --porcelain
   --untracked-files=all` vs allowlist: <declared output paths>; exclude
   `.harness/state/` + `.harness/PROGRESS.md`; single-writer assumption;
   halt on unexplained changes; escalate if `git` unavailable

## Escalation Gate

Halt and report **Context → Options → Recommendation → Decision Needed** when:
<the spec is missing/contradictory>; <a required slot has no evidence>;
<context probes resolve ambiguously>; <the delta check is ambiguous>.
Never invent a field, threshold, or name to proceed.

## Handoff & Convergence

- **redirect → <skill:<name>|none>:** <who produces a missing input, if any>
- **convergence → <skill:<name>|agent:<asdd-*-agent>|human>:** <where outputs
  route next>
- `None (terminal)` — <or delete this line and keep the routed targets>

---

## Field dictionary (S-019)

| Placeholder | Type | Constraint |
| --- | --- | --- |
| `<skill-name>` | string | kebab-case, = directory name, no `skill-`/`-skill` affix, ≤64 chars |
| `<one-paragraph capability summary>` | string | third-person, no first-person |
| `<positive trigger>` | string | concrete request/task forms |
| `<out-of-scope intents>` | string | artifact types or fleet-resident skill names |
| `<paths this skill may write>` | path list | must match the Gate-4 allowlist exactly |
| `<C#·Level×Knowledge-Type>` | enum | `C1·Remember×Factual` … `C6·Create×Procedural` — one per step |
| `<step name>` | string | action phrase |
| `<transient-output>` | string | evidence class (checklist, notes, verdict) |
| `<Title Case Name>` | string | display title |

Conditional slots (`Preconditions`, `Input / Output Contract`) are deleted
when unused — do not leave empty sections. `## Handoff & Convergence`,
`## Verification`, and `## Escalation Gate` are always required.
