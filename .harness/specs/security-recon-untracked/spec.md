# security-recon-untracked — Spec (hotfix)

## Intent

`security_audit_start` (slice security-review) builds its reconnaissance from tracked files only, so code written but
not yet committed — the usual case for a local audit before a PR — does not count toward languages or surfaces
(found in the end-to-end test: `src/api/run.js` was ignored until committed). Include untracked files that are not
ignored (`git ls-files --cached --others --exclude-standard`), keeping the existing size and count limits.

Mapped: `tools/spec-drift/src/security/security.service.ts` (its file listing feeds `recon()`; `recon.ts` is pure and lists nothing), `tools/spec-drift/src/security/security.service.spec.ts`

## Requirements

- **REQ-001.** Reconnaissance shall consider tracked files and untracked files that `.gitignore` does not exclude, and shall never consider ignored files.
