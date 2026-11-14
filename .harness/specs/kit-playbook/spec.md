# Spec: kit-playbook (lite)

## Intent

Tech Lead request (2026-11-14): "bump the version and wire a playbook for ASDD + Harness like the playbook of
spec-drift". The kit has a long README but no day-to-day guide of what to do when; the spec-drift server has one.
Release the work since 3.10.0 as 3.11.0.

Mapped: `docs/PLAYBOOK.md`, `README.md`, `cli/README.md`, `tools/spec-drift/docs/PLAYBOOK.md`, `package.json`,
`package-lock.json`, `cli/versions.json`, `.harness/config/versions.json`, `.harness/config/installed-versions.json`,
`.harness/config/project.json`, `tools/spec-drift/package.json`, `tools/spec-drift/src/app.constants.ts`,
`tools/spec-drift/test/mcp.e2e-spec.ts`, `tools/knowledge/package.json`, `tools/knowledge/src/app.constants.ts`

## Requirements

- **REQ-001 (MUST).** The kit shall have `docs/PLAYBOOK.md` for ASDD + Harness with the sections of the spec-drift
  playbook (what it gives, when to use it, where to set it up, plays, working well, quick reference), naming only
  commands that `asdd help` lists, and the README, `cli/README.md`, and the spec-drift playbook shall link to it.
- **REQ-002 (MUST).** The kit version shall be 3.11.0 (`package.json`, lock, every artifact in `cli/versions.json`, the
  kit's own installed copies), with an "Upgrading to 3.11" note in the README; spec-drift and knowledge, which gained
  tools, shall be 1.1.0.

## No-gos

No npm publishing; jev-gate keeps 1.0.0 (only refreshed copies).
