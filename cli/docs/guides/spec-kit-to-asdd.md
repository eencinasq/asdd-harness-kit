# Spec Kit → ASDD + Harness (one page)

If you know [GitHub Spec Kit](https://github.com/github/spec-kit/), this map gets you productive in asdd-harness-kit without relearning product delivery.

| Spec Kit | ASDD + Harness | Notes |
|----------|----------------|-------|
| `/speckit.constitution` | `.harness/steering/` + project bindings (`product`, `structure`, `tech`, …) | Principles live in steering; fill bindings before Discovery |
| `/speckit.specify` | `intent.md` (full) or `spec.md` (lite) | One slice = one scope outcome |
| `/speckit.plan` | `design.md` (+ Domain / Validation on full path) | Architecture and file map |
| `/speckit.tasks` | `tasks.md` + `.harness/features/<slice>.features.json` | Features need `scope_paths`, `verification`, `req_ids` |
| `/speckit.implement` | Implementation agent / lite agent + `asdd sync` | Edit only mapped paths |
| `/speckit.converge` | `asdd check` / `asdd drift` + QA | **Deterministic** sensors (DRIFT-01…07), not only an LLM checklist |
| `/speckit.clarify` / analyze | Validation phase, `asdd learn`, Tech Lead triage | Humans decide gates (`decided_by`) |

## Shape Up sits above Spec Kit

ASDD does not start from a vague prompt. Upstream:

1. **Shape Up** pitch → betting table  
2. **Product Delivery** → scopes → one `intent.md` per scope  
3. **ASDD slice** (lite by default)

Skip Shape Up only for tiny onboardings (`asdd init-flow`) or hotfixes (roadmap P2.1).

## 15-minute brownfield path

```bash
asdd init-flow /path/to/repo --runtime=cursor
cd /path/to/repo
asdd status --metrics
asdd check
```

That installs the harness (if needed), fills minimum bindings, creates a lite `hello` slice, and aims for a green `asdd check`. Then replace the sample `docs/hello-asdd.md` work with your real feature.

## What Spec Kit does not give you (and ASDD does)

- **Evidence hash** — `passing` features reopen when owned files change (DRIFT-02)
- **Verify-on-Stop** — Cursor / Claude Code hooks run `asdd check --live`
- **Self-improving loop** — `asdd learn` turns repeated failures into steering proposals
- **Spec Drift MCP** — chat dashboards over the same libraries as the CLI

## Keep both temporarily

You can keep Spec Kit skills while adopting ASDD: treat Spec Kit artifacts as drafts, then copy outcomes into `.harness/specs/<slice>/` and delete the parallel tree once `asdd check` is green. Do not run two systems of record for the same change.
