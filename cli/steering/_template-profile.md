# Template profile — `artifact_template` class (D-9)

Registry class `artifact_template` covers the scaffolds under `.harness/steering/templates/`. They are **not** `kit_steering_rule` files: no `inclusion`/`tags` frontmatter, no JIT loading, exempt from the rule-slot linter (`steering-profile.mjs` skips the class). They are copied or filled into other locations, where the artifact's own spec governs them.

## Grammar classes

| Template | Grammar owner | Frontmatter / shape |
|---|---|---|
| `steering-proposal.md` | **This file + `validators/learning.mjs`** | `id:` `pattern:` `status:` `control:` `change:` `success:` `decided_by:` `applied_commit:` `applied_at:` (see contract below) |
| `capability.md`, `requirements.md`, `design.md`, `tasks.md`, `intent.md`, `spec-validation-report.md`, `spec-coverage-report.md`, `spec-peer-review.md`, `code-review-report.md` | The ASDD artifact spec each instantiates (EARS `REQ-…` ids, section scaffolds) | No steering frontmatter; body grammar only |
| `slice-manifest.stub.json` | `manifest.md` schema v3.0 | JSON stub, not a rule file |

## `steering-proposal.md` frontmatter contract

Machine-checked by `validators/learning.mjs` (`proposalFindings`, `QG-LEARN-03`/`05`):

- `id` — `SP-NNN`, must match the file name.
- `pattern` — must match an open learning signal (`asdd learn --all`).
- `status` — `proposed` → `accepted | rejected` → `applied` → `verified | ineffective`. Only the Tech Lead sets `accepted`/`rejected`/`applied` and fills `decided_by`.
- `control` — path of the guide or sensor file the change touches; must exist (or `product-code` for the `product-code` change type).
- `change` — one of `add-guide | tighten-guide | add-sensor | tighten-sensor | loosen-sensor | remove-sensor | product-code`.
- `success` — measurable criterion (e.g., no recurrence of the signature in N sessions); must not be left as a `<placeholder>`.
- `applied_commit` — required at `applied`: the commit that changed `control` (validated with git); `applied_at` defaults to that commit's date.

A malformed proposal FAILs the invariants (`QG-LEARN-03`). Agents shall not merge steering changes (`QG-LEARN-05`).
