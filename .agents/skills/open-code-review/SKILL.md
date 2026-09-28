---
name: open-code-review
description: >-
  Defect review on Git diffs via Alibaba open-code-review (`ocr` CLI). Default
  in this repo: Delegation Mode (OCR selects files/rules; the host agent reviews
  with its own model — no OCR LLM endpoint). Use after implementing a feature
  (before Harness `passing`), during QA Spec Coverage (Mode B), or when Refactor
  consumes CRITICAL/HIGH security findings. Not for Discovery–Design phases.
  Complements TDD and spec coverage — does not replace them. Never invent a fake
  review.
---

# Open Code Review (ASDD discovery)

Project skill that tells ASDD agents **when and how** to invoke
[alibaba/open-code-review](https://github.com/alibaba/open-code-review). This
file is **discovery + contract**, not an installer.

## Role in ASDD + Harness

| Layer | What OCR owns |
|-------|----------------|
| Defect review | Bugs, security, maintainability on the **diff** (line-level) |
| Does **not** own | Spec compliance (REQ/EARS), CCS, feature `verification` tests, domain language |

**Owners (agents):** Implementation (pre-`passing`) → QA Mode B (coverage adjunct) → Refactor (CRITICAL/HIGH security).  
**Not a pipeline phase.** No new `manifest.phase`.

## Default execution mode: Delegation (mandatory in Cursor ASDD)

**Always use Delegation Mode** for Implementation / QA / Refactor in this monorepo unless the human explicitly requests OCR-managed LLM (`ocr review` with a configured provider).

| Mode | When |
|------|------|
| **Delegation (default)** | `ocr delegate preview` + `ocr delegate rule` → **host agent** reviews diffs with its own model. **No** `OCR_LLM_*` / Anthropic OCR endpoint required. |
| OCR-managed LLM | Only if human asks — `ocr review` after `ocr config provider` / env LLM vars. |

Do **not** skip OCR solely because no OCR LLM is configured. Run Delegation Mode instead.

## Prerequisites

1. CLI available — prefer in this order:
   - `ocr` on `PATH`
   - **`npx` fallback:**
     ```bash
     npx -y -p @alibaba-group/open-code-review ocr <args>
     ```
2. Git ≥ 2.41.
3. Optional: Cursor plugin / Team Marketplace for slash UX — does not replace this skill.

**If `ocr` / `npx` CLI is missing entirely:**

1. Tell the human to install the CLI (or use Team Marketplace + CLI).
2. Do **not** fabricate findings.
3. Record skipped in `PROGRESS.md` / feature notes / `code-review-report.md`.
4. Still run normal `verification` (tests).

## When to use

| Context | Action |
|---------|--------|
| Implementation — after feature tests green, before `passing` | Delegation review of the feature/branch diff |
| QA Mode B — Spec Coverage Analysis | Adjunct `code-review-report.md` via Delegation |
| Refactor — security / quality scan input | Consume CRITICAL/HIGH; propose fixes with human approval |
| Discovery → Task Planning | **Do not** run OCR |

## Workflow — Delegation Mode (default)

Prefix with `npx -y -p @alibaba-group/open-code-review` when `ocr` is not on `PATH`.

### 1. Preview (file selection)

```bash
ocr delegate preview --format json \
  --background "ASDD <slice_id>: <one-line intent>" \
  --from main --to HEAD
```

Workspace-only (Harness feature session):

```bash
ocr delegate preview --format json \
  --background "ASDD feature <TASK-id>: <one-line behavior>"
```

Prefer a **short** `--background` string. If using `--background-file`, content must stay ≤ **8000** sanitized characters (summarize capability/requirements — do not pass huge files).

### 2. Rules

```bash
ocr delegate rule --format json <path1> <path2> ...
```

Pass all `reviewable_files` paths from preview (batch if large).

### 3. Diffs + host review

Using mode/refs from preview:

- Range: `git diff <merge_base>..<to> -- <path>`
- Commit: `git show <commit> -- <path>`
- Workspace: `git diff HEAD -- <path>` (read file for untracked)

The **host agent** reviews each file against its rule group. Cover every previewed file (`reviewed` or explicit `skipped` + reason). Focus on changed lines. Discard noisy `low` unless security-related.

### 4. Report

Write/update `.harness/specs/<slice_id>/code-review-report.md` (and optional `ocr-result.json` with the structured comments). Include: mode=delegation, files reviewed/skipped, counts by severity, top CRITICAL/HIGH/MEDIUM.

### 5. Harness / QA gates

- Unresolved CRITICAL/HIGH → do not set feature `passing` (leave `in_progress`/`blocked`) or flag in QA report / handoff to Refactor.
- Medium → WARN in evidence / PROGRESS.
- Spec coverage gate still follows `quality-gates.md` (OCR does not replace MUST coverage).
- List this skill in the agent’s final message when used or explicitly skipped (CLI missing only).

## Workflow — OCR-managed LLM (opt-in only)

Only when the human requests it and an LLM endpoint is configured:

```bash
ocr review --audience agent --format json \
  --background "ASDD <slice_id>: <summary>" \
  --from main --to HEAD \
  --output .harness/specs/<slice_id>/ocr-result.json
```

If `ocr review` fails with “no valid LLM endpoint”, **fall back to Delegation Mode** — do not skip.

## Custom rules (optional)

Repo overrides (when present): `.opencodereview/rule.json`. Preview: `ocr rules check <path>`.

## Anti-patterns

- Skipping OCR because OCR-managed LLM is unconfigured (use Delegation).
- Substituting OCR for `verification` / TDD evidence.
- Inventing review comments when CLI is unavailable.
- Full-repo `ocr scan` on every feature.
- Treating OCR as a new ASDD phase or CCS input by itself.
- Passing oversized `--background-file` (>8000 chars) — summarize instead.

## Verification

- Delegation: preview + rule succeed; host review completed; report written (or CLI-missing skip noted).
- CRITICAL/HIGH either fixed, accepted with human note, or feature not marked `passing` / QA flags them.

## References

- Upstream: https://github.com/alibaba/open-code-review  
- Delegation docs: https://open-codereview.ai/docs/delegate  
- Index: `.harness/steering/skills.md`  
- Session loop: `.harness/steering/session-loop.md`
