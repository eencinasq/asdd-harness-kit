# Architecture Documentation

Generic architecture-doc layout, diagrams, and maintenance triggers. Use with the parent skill [`../SKILL.md`](../SKILL.md).

**Ownership**

| This file | Parent skill |
|-----------|----------------|
| Doc tree patterns (e.g. arc42), section update triggers | When to write ADRs; ADR lifecycle; match-existing-convention |
| C4 / diagram conventions | Inline why-comments, README, changelog |
| Quality / risk / debt record templates | Default ADR body when no project convention exists |
| Prose writing rules for architecture docs | — |

**Do not** invent a new ADR store here. ADR location and field style → parent skill (“match existing convention first”). Discover the project’s real `docs/` paths from the repo.

## When a project uses arc42

If the repository already has arc42 sections, keep them; do not fork into a parallel template.

| # | Section | Content | Update Trigger |
|---|---------|---------|----------------|
| 01 | Introduction & Goals | System purpose, stakeholders, top quality goals | Goals change |
| 02 | Constraints | Technical, organizational, regulatory limits | New constraints |
| 03 | Context & Scope | System boundaries, external actors, protocols | Integrations change |
| 04 | Solution Strategy | Architectural style, key patterns, tech rationale | Major pattern change |
| 05 | Building Block View | Static decomposition (L1→L2→L3) | Services added/removed |
| 06 | Runtime View | Sequence flows for critical scenarios | Critical flows change |
| 07 | Deployment View | Infrastructure, environments, scaling | Infra changes |
| 08 | Cross-cutting Concepts | Security, logging, caching, error handling, testing | Cross-cutting changes |
| 09 | Architecture Decisions | ADRs (or index linking to ADR files) | Decisions made |
| 10 | Quality Requirements | Quality attribute scenarios with measurable criteria | Requirements change |
| 11 | Risks & Technical Debt | Tracked risks and debt items | Periodic review |
| 12 | Glossary | Domain and technical terms | New terms introduced |

Example layout (adapt to the repo — do not relocate existing docs):

```
docs/
├── architecture/
│   ├── overview.md
│   ├── arc42/                 # 01–12 when arc42 is in use
│   └── diagrams/              # C4 / sequence diagrams if used
├── knowledge-base/            # optional org memory (ADRs, spikes, lessons)
└── …
```

## C4 and diagrams

Create diagrams only when they add clarity. Prefer prose for simple relationships.

Levels:
- C1 (System Context) — usually one per product/platform
- C2 (Container) — services, databases, queues
- C3 (Component) — only for complex or critical services
- C4 (Code) — rarely; prefer code, tests, and short gotcha comments

Prefer the **diagram format already used in the repo** (Mermaid, PlantUML, Structurizr, etc.). Do not introduce a second format without an ADR.

Typical naming (adjust to project convention):

```
C1-SystemContext.<ext>
C2-Containers.<ext>
C3-<ServiceName>.<ext>
SequenceDiagram-<Scenario>.<ext>
```

Conventions that travel well:
- Title: `[System Name] — C<N>: <View Name>`
- Show technology on containers/components when useful
- Label relationships with protocols (e.g. REST/HTTP, pub/sub)
- Keep diagrams focused; omit trivial detail
- Names must match code and other docs

## Supporting templates (arc42 §10–11 style)

Use when the project tracks quality scenarios, risks, or debt in architecture docs. Match existing heading style if one exists.

### Quality scenario

```markdown
### [Quality Attribute] Scenario N: [Name]

**Stimulus**: [Trigger]
**Response**: [Expected system behavior]
**Measure**: [Quantifiable acceptance criteria]
```

### Risk

```markdown
### Risk N: [Name]

**Impact**: Critical | High | Medium | Low — [description]
**Probability**: High | Medium | Low — [description]
**Mitigation**: [Strategies]
**Owner**: [Team/person]
**Status**: Open | Mitigated | Accepted | Closed
```

### Technical debt

```markdown
### Debt N: [Name]

**Impact**: Critical | High | Medium | Low — [effect]
**Priority**: Critical | High | Medium | Low
**Effort**: [Estimate]
**Plan**: [Resolution approach]
**Status**: Identified | Planned | In Progress | Resolved
```

## Writing rules (architecture docs)

- Active voice, present tense ("The service processes payments").
- Expand acronyms on first use.
- Specify language on all fenced code blocks.
- Tables for structured comparisons; numbered lists for steps; bullets for unordered items.
- Link between docs with relative paths.
- Document decisions and rationale, not obvious implementation details.
- Use glossary terms consistently when a glossary exists.

## Documentation triggers

When adding a new service (if arc42 / C2 exists):
1. Update building-block view (§05).
2. Update container diagram; add component diagram only if complex.
3. Add domain terms to the glossary (§12).
4. Document key scenarios in runtime view (§06).

When making an architectural decision:
1. Add an ADR using the **project’s** ADR convention (parent skill).
2. Update solution strategy (§04) if patterns change.
3. Update affected diagrams.
4. Update risks/debt (§11) if new risks arise.

When adding an external integration:
1. Update system context (§03) and C1 if present.
2. Add dependency risk where the project tracks risks.

When changing infrastructure:
1. Update deployment view (§07) and related diagrams.
2. Update constraints (§02) if new limits apply.

## Verification (architecture docs)

- [ ] Right arc42 (or project) section updated for the change type
- [ ] Diagrams match service/names in code
- [ ] Glossary terms consistent
- [ ] New risks/debt recorded when applicable
- [ ] Parent skill verification also passes (especially ADR convention match)
