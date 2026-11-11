# Reviewer evaluation

Metrics from published reviews (`pr_review_metrics`) tell you what humans kept; they cannot tell you
what the reviewer **missed**. This folder holds labelled cases for that: a diff plus the defects it
really has. Score the reviewer on them before and after any change to the prompt, the rule docs, the
profile or the model.

## Cases

`cases/<id>.json`:

```json
{
	"id": "python-eval-injection",
	"description": "What the change does and why the defect is real.",
	"diff": "diff --git a/… (unified diff)",
	"expected": [
		{ "path": "src/util.py", "startLine": 6, "ruleId": "python.security-sensitive-code", "note": "eval on user input" }
	]
}
```

- `expected: []` is a **clean** case: every finding on it is a false positive. Keep several — they
  measure noise.
- A finding counts as a hit when it is on the same file within ±2 lines of a labelled defect; each
  defect counts once.
- The three seed cases here are synthetic. The cases that matter come from **your** PRs: when a
  reviewer (human or agent) finds a real defect, or when a comment is removed as noise, save the diff
  and the label. Aim for 20–30 cases across your languages, about a third of them clean.

## Run

```bash
pnpm eval prepare              # eval/out/<case>.md: each case's review groups (rules + diff)
# Review each file with the model / agent you are evaluating; save its findings as
# results.json: { "<case id>": [{ "path": "...", "startLine": 6, "endLine": 6, "ruleId": "..." }] }
pnpm eval score results.json   # precision / recall / F1, false positives and misses per case
```

Keep `results-<date>-<change>.json` files to compare runs. A change that raises recall but drops
precision adds noise to every review; look at both.
