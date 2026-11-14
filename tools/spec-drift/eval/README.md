# Reviewer evaluation

Metrics from published reviews (`pr_review_metrics`, and team-wide in `learning_report`) tell you what humans kept;
they cannot tell you what the reviewer **missed**. This folder holds labelled cases for that: a diff plus the defects it
really has. Score the reviewer on them before and after any change to the prompt, the rule docs, the profile or the
model.

## Cases

`cases/<id>.json`:

```json
{
	"id": "py-mutable-default",
	"description": "What the change does and why the defect is real.",
	"language": "python",
	"category": "correctness",
	"diff": "diff --git a/… (unified diff)",
	"expected": [
		{
			"path": "app/catalog.py",
			"startLine": 1,
			"ruleId": "python.mutable-default-arguments-and-shared-state",
			"note": "mutable default argument"
		}
	],
	"noise": []
}
```

- `expected: []` is a **clean** case: every finding on it is a false positive. Keep about a third of the cases clean —
  they measure noise.
- A finding counts as a hit when it is on the same file within ±2 lines of a labelled defect; each defect counts once.
- `language` and `category` are required: scores are broken down by both.
- `ruleId` is optional; when set, it must be a checklist item of the rule docs (`#### [python.performance] …`).
- `noise` (optional) lists findings a human already removed on a real review: reporting one again is counted as
  **repeated noise**.

**Every case is checked in `pnpm test`** (`src/pr-review/metrics/eval-set.spec.ts`): the id matches the file name, the
diff gives the reviewer at least one group, every label is on an **added** line of its file (a reviewer cannot comment
anywhere else), every cited rule exists, and the set keeps at least 30 cases, 6 languages, and a third clean. Run the
same check on any folder with `pnpm eval check [dir]`.

The 35 cases here are **synthetic** (9 languages, 12 clean): authored for the kit, with no client code. They measure the
reviewer on defects someone wrote down, not on your team's code — for that, harvest cases from your own reviews.

## Run

```bash
pnpm eval prepare              # eval/out/<case>.md: each case's review groups (rules + diff), no labels
# Review each file with the model / agent you are evaluating; save its findings as
# results.json: { "<case id>": [{ "path": "...", "startLine": 6, "endLine": 6, "ruleId": "..." }] }
pnpm eval score results.json --json baseline.json        # first run: save the summary
pnpm eval score results-new.json --baseline baseline.json  # later runs: compare
```

`score` prints precision, recall and F1 overall, per language and per category, the false positives and misses per
case, and the repeated noise. With `--baseline`, it exits **1** when precision or recall dropped by more than
`--max-drop` points (default 5) — F1 is shown but does not decide, so a trade of one for the other stays visible.

CI cannot run the model, so CI enforces the case checks; the baseline comparison runs wherever the evaluation runs
(your session, or a job that has model access). Keep `results-<date>-<change>.json` files to compare runs.

## Cases from your reviews

```bash
pnpm eval harvest ~/.local/state/pr-review/<project>/pr-<n> [--language typescript] [--out <dir>]
```

Turns a **published** review into a case: its `diff.patch`, the published inline comments as defects (a human kept or
edited them) and the draft comments the human removed as `noise`. No comment text is copied — the labels are
locations. Check the labels before using the case: a published comment is a defect a human agreed with, not every
defect of the change, so add what the review missed.

Harvested diffs are **your client's code**: `harvest` writes to `$PR_REVIEW_ROOT/eval-cases/` (default
`~/.local/state/pr-review/eval-cases/`) and refuses to write inside this repository unless you pass `--allow-repo`.
Keep a private set there and score it with `pnpm eval score results.json <that folder>`.
