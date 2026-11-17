# pr-security-baseline — Spec (hotfix)

## Intent

Two gaps in the security lens of spec-drift PR review (slice security-review), found when the Tech Lead asked how
security works in PRs:

1. The built-in security pack (10 Semgrep rules for JS/TS and Python) only runs in `analyze_security`. PR review runs
   the repository's own `.semgrep/**` rules, so a repository without `.semgrep/security/` gets no deterministic security
   baseline in its reviews.
2. A PR finding with `category: "security"` is kept when its evidence names a trust boundary and a `file:line`, but the
   cited location is never checked: a made-up line passes.

Run the built-in pack on the PR files when the repository has no security rule set (Semgrep only, never blocking the
review), surface its findings as labeled hints and in the review report; and keep a security finding only when every
`file:line` its evidence cites exists in the PR version (read from the PR head, never the local checkout).

Mapped: `tools/spec-drift/src/pr-review/architecture/architecture-scan.service.ts`, `tools/spec-drift/src/pr-review/architecture/architecture.types.ts`, `tools/spec-drift/src/pr-review/architecture/architecture-report.ts`, `tools/spec-drift/src/pr-review/architecture/architecture-scan.spec.ts` (new), `tools/spec-drift/src/pr-review/pr-review.views.ts`, `tools/spec-drift/src/pr-review/pr-review.service.ts`, `tools/spec-drift/src/security/lens.ts`, `tools/spec-drift/src/security/lens.spec.ts`, `tools/spec-drift/src/security/findings.ts` (export the line counter), `tools/spec-drift/test/pr-review.e2e-spec.ts`, `tools/spec-drift/test/fixtures/sandbox.ts` (optional PR files), `tools/spec-drift/README.md`

## Requirements

- **REQ-001.** WHEN a PR review scans the PR files AND the engine is Semgrep AND the repository has no `security` rule set, the built-in security pack shall run on the PR files at the PR head snapshot, and its findings shall appear in the per-group static-analysis hints and in the review report, labeled as built-in security.
- **REQ-002.** WHEN the repository has a `security` rule set, or the engine is not Semgrep, or the PR has no scannable files, the built-in security pack shall not run.
- **REQ-003.** IF the built-in security pack cannot run or fails, THEN the PR review shall continue and record a note, without changing the repository-rules result.
- **REQ-004.** A PR finding with `category: "security"` shall be kept only when every `file:line` location its evidence cites names a file that exists at the PR head with that line inside the file; otherwise it shall be dropped with a warning naming each bad location.
