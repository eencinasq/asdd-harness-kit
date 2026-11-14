---
name: capability-authoring
description: >-
  Authors and verifies .agents/skills/<name>/ skill bundles from a capability
  specification. Use when creating or auditing a skill bundle. Do NOT use for
  agent profiles, AGENTS.md, _prompt.md, or fleet-wide linting.
metadata:
  tier: leaf
---

# Capability Authoring

Defines a skill *from* a capability specification. **Operational boundary:**
writes only `.agents/skills/<new-name>/` and regenerates
`.harness/steering/skills.md`; **kit mode** additionally refreshes
`.harness/config/versions.json` — via `generate-versions.mjs` only, never
hand-edited; **consumer mode** modifies no `.harness/config/` file. Source
documents (the capability spec and the bundled profile) are read-only; all
working notes and the verification record are transient — reported in the
final message, never written to disk. Never edits existing skill bundles —
audits report, they do not rewrite.

## Preconditions

1. The bundled authoring profile exists:
   `.agents/skills/capability-authoring/references/skill-profile.md`, and a
   `capability_spec` document is supplied. Both are read-only.
2. Target name is free: `ls .agents/skills/<name>` fails (or the task is a
   declared audit).
3. Repo context probed: `test -f scripts/generate-versions.mjs` → **kit mode**
   (stamps apply); `test -f .harness/config/installed-versions.json` →
   **consumer mode** (no stamps). If **neither or both** probes resolve, the
   context is ambiguous → halt → Escalation Gate.
4. Baseline index is clean: `node .harness/scripts/check-skills-index.mjs`
   exits 0.
5. Baseline delta captured: `git status --porcelain --untracked-files=all`
   recorded before authoring begins (Gate 4 comparison point). If `git` is
   unavailable in this environment, the delta check cannot run → Escalation
   Gate (never silently skip it).

## Input / Output Contract

- **Inputs:** `capability_spec` (`file`, read-only Markdown describing the
  capability — not expected to contain `S-*` IDs; required);
  `skill_name` (`string`, kebab-case per S-002, required);
  `deployment_profile` (`enum inline|packaged`, default `inline`).
  The bundled `references/skill-profile.md` is the normative authoring
  profile — always loaded, never an interchangeable input.
- **Outputs:** `skill_bundle` (`dir`, `.agents/skills/<name>/`, SKILL.md +
  profile assets); `skills_index` (`file`, `.harness/steering/skills.md`
  marker table, regenerated); kit mode only: `version_stamps` (`file`,
  `.harness/config/versions.json`, regenerated); `verification_record`
  (**transient** — manual checklist + before/after path sets reported in the
  final message, never persisted to disk).

## Execution Protocol

### Step 1 [C1·Remember×Factual] — Extract the authoring profile
**Action:** Enumerate every required slot, frontmatter field, adopted/adapted
rule, verification obligation, and cited `S-*` identifier from the bundled
`references/skill-profile.md`.
**Target:** transient working notes (in-context only, never persisted) —
never either source document.
**Assertion:** every profile rule is represented in the notes, source-cited;
both source documents remain byte-identical.

### Step 2 [C4·Analyze×Conceptual] — Map capability evidence
**Action:** Map `capability_spec` evidence onto the profile slots — what the
capability does, when it fires, when it must not, operational boundary, I/O,
handoffs. Do not invent capability behavior to fill a slot. Repository facts
may establish operational boundaries and tool commands; unsupported product
facts are assumptions requiring escalation.
**Target:** slot map (transient, or `resources/SKILL-template.md` fields
in-context only — the template file itself is never edited).
**Assertion:** every authored capability claim cites its spec/repo source or
is visibly flagged for decision; profile slots with no evidence escalate,
never fill silently.

### Step 2b [C4·Analyze×Conceptual] — Fleet overlap scan
**Action:** Enumerate every existing `description` by scanning **frontmatter
directly** — `.agents/skills/*/SKILL.md`, plus `.agents/modules/*/skills/*/SKILL.md`
in the kit repo (module skills are absent from the kit-repo index; in consumers
they land flat under `.agents/skills/`). `skills.md` is a convenience source,
never the authoritative fleet. Compare the new trigger surface — intents,
verbs, phase couplings — against each description, then classify each apparent
overlap: **adjacent, distinguishable** (clear discriminator — name the sibling
in `Do NOT use` when it improves routing and fits the 1024-char limit,
otherwise record the discriminator in the transient notes) or **ambiguous
collision** (same request could select either, no discriminator → halt →
Escalation Gate).
**Target:** all `SKILL.md` frontmatter under both roots.
**Assertion:** every overlap carries a recorded classification; ambiguous
collisions halt before authoring — never ship an ambiguous route.

### Step 3 [C5·Evaluate×Metacognitive] — Judge trigger & level fit
**Action:** Score the `description` against the routing rubric (third-person,
positive trigger, negative boundary, ≤1024 chars). Check each protocol step's
verb against the Bloom verb→level table — one dominant level per step, chained.
**Target:** drafted frontmatter + protocol skeleton.
**Assertion:** rubric applied with verdict + rejected alternatives recorded;
no verb-stacked step survives.

### Step 4 [C6·Create×Procedural] — Author the bundle
**Action:** Write `SKILL.md` from `resources/SKILL-template.md`; add
`references/`/`resources/`/`examples/`/`scripts/` only when `packaged`.
**Target:** `.agents/skills/<name>/`.
**Assertion:** constraint checklist — every adopted/adapted profile element
satisfied; relative links only; no absolute paths.

### Step 5 [C5·Evaluate×Factual] — Verify the artifact
**Action:** Run the Verification Gate below — executable checks plus the
recorded manual checklist plus the scoped delta comparison.
**Target:** the written bundle + regenerated index (+ kit-mode stamps).
**Assertion:** all executable checks exit 0; the checklist is complete and
reported; the delta matches the declared allowlist.

## Verification Gate

Phase-1 verification is honest about tooling: `check-skills-index.mjs`
validates the **catalog** (name/description), not profile conformance — the
profile linter is Phase 2 (G-6). Until then:

1. `node .harness/scripts/check-skills-index.mjs --write` exits 0, then
   `node .harness/scripts/check-skills-index.mjs` (no `--write`) exits 0 —
   the regenerated index is stable and well-formed.
2. **Kit mode:** `node scripts/generate-versions.mjs` run and every new
   bundle file has an entry in `.harness/config/versions.json`.
   **Consumer mode:** neither `.harness/config/versions.json` nor
   `.harness/config/installed-versions.json` changed.
3. **Recorded manual profile checklist** — required sections present, name =
   dir + S-002, `description` grammar + ≤1024, one `[Cn×Type]` tag per step
   with level-matched proof shapes, relative links resolve, mode-appropriate
   write boundary honored. The completed checklist is verification evidence,
   reported in the final message (transient — never persisted).
4. **Scoped delta check (negative check):** compare the post-run
   `git status --porcelain --untracked-files=all` against the Precondition-5
   baseline (git availability is a declared prerequisite — see Precondition
   5). New/changed paths must fall inside the declared allowlist —
   `.agents/skills/<name>/`, `.harness/steering/skills.md`, kit mode only
   `.harness/config/versions.json` — accounting for paths already changed at
   baseline. Exclude `.harness/state/` and `.harness/PROGRESS.md` (generated
   harness bookkeeping). This proves the observed path delta only; it does
   not infer authorship. Single-writer assumption: halt if unexplained
   concurrent changes make the delta ambiguous.

## Escalation Gate

**HALT** and report **Context → Options → Recommendation → Decision Needed** when:
the capability spec is missing or self-contradictory; a required profile slot
has no spec/repo evidence; the requested name collides or violates S-002; a
Step 2b overlap classifies **ambiguous**; repo-context probes resolve
**neither or both** ways; two specs disagree; `git` is unavailable for the
delta check; the Gate-4 delta contains unexplained changes. Never invent a
field, threshold, or skill name to proceed.

## Handoff & Convergence

- **redirect → none:** a missing spec is an escalation, not a route.
- **convergence → agent phase:** the bundle enters the fleet on `skills.md`
  regeneration; onward routing is the hosting agent's normal JIT selection.
- `None (terminal)` — fleet `handoff` edges are declared by the fleet linter
  (Phase 2).
