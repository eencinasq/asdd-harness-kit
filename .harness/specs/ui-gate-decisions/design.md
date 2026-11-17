# ui-gate-decisions — Design (lite)

**Author:** asdd-lite-agent  
**Model/Tool:** Composer (Cursor agent)

## What changes

| Path | Change |
|------|--------|
| `cli/src/harness/ui-server.mjs` | Add read `GET /api/gates`; write `POST /api/gates/decide` with Host/Origin guards; spawn `asdd` for the decision (never write sessions/manifest/registry itself). |
| `cli/src/harness/ui-server.test.mjs` | Tests for REQ-001…REQ-005 (list, decide spawn, non-zero handling, Host/Origin 403). |
| `cli/src/harness/ui/**` | Gates tab: pending list + decide form (note required); show command output on failure. |
| `cli/src/harness/gate-decide.mjs` (+ `.test.mjs`) | **Mapped amendment:** thin harness command that appends one `override` session (`human`/`decided_by` from git/`HARNESS_AUTHOR`, mandatory `--note`) then runs `asdd sync --slice`. |
| `cli/src/harness/commands.mjs` | **Mapped amendment:** one append-only `gate-decide` (or `decide`) entry. |
| `package.json` | Append-only: `gate-decide.test.mjs` in `test` (if separate); ui-server tests already registered. |
| `cli/versions.json` | Regenerated via `asdd kit versions` after ship. |
| `README.md` | One command-table row for `asdd gate-decide`. |

> Spec Mapped today lists only `ui-server*` + `ui/**`. REQ-002 requires invoking an `asdd` command; none exists for overrides today (sessions are hand-written). **Checkpoint (b) asks to widen Mapped** as above — without that, the write path cannot satisfy REQ-002.

## Approach

### Pending gates (REQ-001)

`GET /api/gates` (read-only) scans registry slices → each manifest `gates`:

- Pending when `status === 'WARN'` and no `acknowledged_by`.
- Attach latest `phase_completed` / `dissent` concerns for that phase from sessions.
- Include a compact drift summary via `runDrift({ root, sliceIds: [id] })` (or skip heavy drift if empty).

Also surface open learning proposals (`status: proposed`) as decide-adjacent items only if cheap; **primary** target is phase WARN overrides (G19 / QG-DEC-09). SP-* file edits stay out of this slice unless trivial later.

### Decide (REQ-002…004)

`POST /api/gates/decide` JSON body: `{ slice_id, phase, note }`.

1. **REQ-005 first:** validate `Host` + `Origin`/`Referer` against loopback + bound port → else `403`, no spawn.
2. Resolve `decided_by` inside the CLI (`HARNESS_AUTHOR` or `git config user.name`), not from the browser body (browser may suggest display-only).
3. `spawn` `node cli/bin/asdd.mjs gate-decide <slice> --phase <phase> --note <note>` (cwd = project root); capture stdout/stderr/exit.
4. Exit 0 → JSON `{ ok: true, … }`; non-zero → `{ ok: false, output }` and **no** retry that writes state (REQ-004).

`gate-decide.mjs` is the only writer: append session JSON under `.harness/state/slices/<id>/sessions/`, then sync that slice.

### Host / Origin (REQ-005)

Shared helper in `ui-server.mjs` (exported for tests):

- Allow `Host` ∈ `{127.0.0.1:<port>, localhost:<port>}` (port = server bind port; accept bare host only if port is 80 — we always use explicit port).
- `Origin` must equal `http://127.0.0.1:<port>` or `http://localhost:<port>`; if `Origin` missing, parse `Referer` origin the same way.
- Missing both → `403`.
- Apply **only** to write methods on decide (and any future writes); GETs unchanged.

DNS rebinding: evil page on attacker DNS→127.0.0.1 still sends `Host: evil.example` or cross-origin `Origin` → rejected. CSRF from `https://evil` cannot present a matching Origin to the loopback UI origin.

## Domain placement

Delivery adapter (`cli/` HTTP + one harness command) over session/sync ports. No new domain entities.

## Domain impact

none

## ADRs

None — loopback Host/Origin checks are constrained by REQ-005; spawning `asdd` is required by REQ-002.

## Risks

| Risk | Mitigation |
|------|------------|
| Mapped too narrow for REQ-002 | Widen Mapped at checkpoint (b) before code |
| Browser spoofs `decided_by` | CLI resolves author from env/git only |
| DRIFT-02 on shared `commands.mjs` | Append-only at slice end; same as asdd-ui |
| Lite E1 if scope spans modules | Keep helpers under `cli/`; expect possible E1 on registration — escalate if needed |
