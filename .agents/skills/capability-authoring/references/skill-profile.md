# Kit Skill Profile (ratified)

The normative authoring grammar for skill bundles under `.agents/skills/` in
asdd-harness-kit. Derived from the skill specification (`skill.spec`) — every
element is **adopted verbatim**, **adapted** to kit architecture, **rejected**,
or **deferred**. Rule IDs (`S-*`) are referenced, never redefined.

## Grammar

```text
kit_skill := FRONTMATTER(name, description, metadata.tier?) TITLE OVERVIEW
            PRECONDITIONS? IO_CONTRACT? PROTOCOL[Bloom-calibrated]
            VERIFICATION_GATE ESCALATION_GATE HANDOFF_CONVERGENCE
            + assets per deployment profile (inline | packaged)
```

## Element dispositions

| Element (`S-*`/slot) | Disposition | Kit rule |
| --- | --- | --- |
| `name` = dir, kebab-case, no `skill-`/`-skill` affixes (S-002) | Adopted verbatim | Enforced by `check-skills-index.mjs` (name must equal folder) |
| `description` ≤1024, third-person (S-004, S-013) | Adopted verbatim | — |
| Positive trigger `Use when` (S-003) | Adopted verbatim | Required in `description` |
| Negative boundary `Do NOT use` (S-014) | Adopted verbatim → required | Fleet has ≥15 skills — the spec's fleet-promotion condition holds; every new skill must carry it |
| `metadata.tier` (S-022) | Adapted — optional | Declare `orchestrator` when a skill orchestrates siblings/agents; absent ⇒ `leaf`. Agent-mediated routing means tier is descriptive, not a dispatch key |
| Deployment profile `inline`/`packaged` + size caps (S-008) | Adopted verbatim | inline ≤20KB; packaged `SKILL.md` ≤500 lines / ≤15KB with assets in `resources/` `references/` `examples/` `scripts/` |
| Operational boundary in overview (S-020) | Adopted verbatim | State what the skill writes; make it mode-aware where writes differ by repo context |
| `PRECONDITIONS` (S-012) | Adopted verbatim | Required when external deps exist |
| Protocol A/T/IA step format (S-017) | Adapted | Every step: **`[Cn×Type]` Bloom tag** (fleet-wide standard, human-ratified) + Action + Target + Intermediate Assertion. One dominant level per step; proof shape matches the level |
| Verification gate (S-006, S-016) | Adapted | `## Verification` always required: machine-executable where the skill mutates files + a scoped before/after path-delta vs a declared allowlist, excluding `.harness/state/` + `.harness/PROGRESS.md` (proves the delta, not authorship). Pure-guidance skills: explicit falsifiable checklist floor |
| Escalation gate (S-009) | Adopted verbatim | `## Escalation Gate` required — halt conditions + `Context → Options → Recommendation → Decision Needed` format |
| I/O contract (S-015) | Adapted — conditional | Required when outputs feed another skill, agent phase, or harness gate; transient evidence (notes, records) declared, never persisted |
| `## Handoff & Convergence` (S-021) | Adapted — required for all | Terminal skills declare the literal `None (terminal)`; routed skills name `skill:<name>` \| `agent:<asdd-*-agent>` \| `human`; `redirect` conditional, names fleet-resident skills only |
| Relative links, no absolute paths (S-005, S-011) | Adopted verbatim | — |
| Asset rules `scripts/`/`resources/`/`references/`/`examples/` (S-018/019) | Adopted verbatim | Scripts: shebang + executable + parameterized; templates: `<placeholders>` + field dictionary |
| Fleet rules `SL-*` | Deferred — Phase 2 | Intra-skill profile only; MECE/DAG/canary is fleet lint |
| `version` frontmatter field | Rejected | Stamps live in `.harness/config/versions.json` — dual versioning drifts |

## Kit-specific rules

1. **Two-source discipline.** This file is the normative *authoring profile*
   (grammar + rules). The supplied `capability_spec` is domain evidence —
   read-only, not expected to contain `S-*` IDs. Never conflate them; never
   edit either.
2. **Mode probing.** `test -f scripts/generate-versions.mjs` → kit mode
   (stamps apply via that script only). `test -f
   .harness/config/installed-versions.json` → consumer mode (no
   `.harness/config/` writes). Neither or both → escalate. Never key on
   `versions.json` — it exists in both contexts.
3. **Fleet-overlap scan.** Enumerate `description` frontmatter directly under
   `.agents/skills/` **and** `.agents/modules/*/skills/` — `skills.md` is a
   convenience, never the fleet source. Classify each overlap *adjacent,
   distinguishable* (discriminator → `Do NOT use` sibling, within 1024 chars)
   or *ambiguous collision* (→ halt).
4. **Scoped delta checks.** Negative checks compare before/after `git status`
   path sets under a single-writer assumption; baseline changes accounted
   for; `.harness/state/` + `.harness/PROGRESS.md` excluded; halt on
   unexplained deltas; escalate if `git` unavailable.
5. **Transient evidence.** Working notes, checklists, and verification
   records are reported in the final message — never persisted to disk.
6. **Grandfathering.** Existing bundles are unchanged (conform-on-touch);
   every new or edited bundle conforms fully — no partial upgrades.
