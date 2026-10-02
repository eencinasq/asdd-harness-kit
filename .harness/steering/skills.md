---
inclusion: always
---

# ASDD skills index (kit)

Initial catalog for folders under `.agents/skills/`. Each folder exposes only its name and description here. The skill body stays in `SKILL.md` until the matching task starts.

## Disclosure

- Read this file to choose a skill. This is the initial index.
- When you start the task that matches a description, `Read` `.agents/skills/<name>/SKILL.md` and follow that file.
- Until that task starts, do not `Read` that `SKILL.md`, its `references/`, or its `agents/`.
- Do not copy a skill body into this index. After adding or editing a skill folder, regenerate the catalog with `node .harness/scripts/check-skills-index.mjs --write`.
- A skill that is not yet copied into `.agents/skills/` is not part of this index.

<!-- skills-index:start -->
| Name | Description |
| --- | --- |
| `anti-pattern-detection` | Detects 8 specification anti-patterns in capabilities and requirements. Acts as a quality gate before finalization. |
| `business-model-canvas` | Parses Business Model Canvas and Lean Canvas inputs into structured product capabilities, personas, and revenue-critical features. |
| `capability-prioritization` | Scores and ranks capabilities using RICE, MoSCoW, Value vs Complexity, and Kano frameworks. Produces prioritization matrix and wave plan. |
| `documentation-and-adrs` | Documents decisions and rationale (ADRs, inline why-comments, README, changelogs, agent context)—not obvious code. Use when making architectural choices, changing public APIs or user-facing behavior, onboarding, or when the same explanation keeps recurring. Loads references/architecture-documentation.md for arc42/C4/layout detail via progressive disclosure. |
| `domain-language-extraction` | Extracts domain-specific terminology from business documents into a ubiquitous language dictionary. Seeds the domain slice. |
| `external-trackers` | Handoff contract between human-driven Product Delivery (Shape Up + sprint planning in external trackers) and ASDD + Harness agent execution. Defines how agents read, reference, and trace work that originates in Linear, Jira, GitHub Issues, or manual pitch documents. Use when intent.md references an external source or when the squad needs to sync status back to a tracker. |
| `open-code-review` | Defect review on Git diffs via Alibaba open-code-review (`ocr` CLI). Default in this repo: Delegation Mode (OCR selects files/rules; the host agent reviews with its own model — no OCR LLM endpoint). Use after implementing a feature (before Harness `passing`), during QA Spec Coverage (Mode B), or when Refactor consumes CRITICAL/HIGH security findings. Not for Discovery–Design phases. Complements TDD and spec coverage — does not replace them. Never invent a fake review. |
| `product-delivery` | Consumes Shape Up pitch artifacts and transforms them into validated, traceable delivery artifacts across epics, user stories, technical specifications, tasks, relationships, dependencies, and sprint planning. |
| `shape-up` | Shape work using the Shape Up methodology (Ryan Singer, Basecamp). Walk through the 4-step shaping process to create pitches ready for betting. Distinguishes between established product mode (fixed time, variable scope) and new product mode (looser constraints). Use when planning cycle work, writing pitches, or coaching PMs on shaping. |
| `test-driven-development` | Drives development with tests using the red-green-refactor loop. Use when implementing any logic, fixing any bug, or changing any behavior. Use when you need to prove that code works, when a bug report arrives, or when you're about to modify existing functionality. Combine with browser-testing-with-devtools for UI runtime verification. |
| `user-story-decomposition` | Decomposes epics and large user stories into atomic, testable capabilities using 8 splitting patterns. |
<!-- skills-index:end -->
