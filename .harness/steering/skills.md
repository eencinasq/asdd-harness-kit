# ASDD skills index (kit)

Skill **files** live in `.agents/skills/` once installed. Optional UI/API skills remain in the kit and are copied only when enabled with the kit installer.

Skip a skill if the file is absent.

## Core skills (shipped under `.agents/skills/`)

| Skill | Purpose |
|-------|---------|
| `domain-language-extraction` | Ubiquitous language |
| `anti-pattern-detection` | Spec anti-patterns |
| `user-story-decomposition` | Split epics |
| `business-model-canvas` | BMC → capabilities |
| `capability-prioritization` | RICE / MoSCoW |
| `product-delivery` | Pitch intake / epics / stories / dependencies / sprint |
| `documentation-and-adrs` | ADRs / docs |
| `shape-up` | Shape Up pitches, appetite, boundaries, conversions, and betting readiness |
| `test-driven-development` | RED-GREEN-REFACTOR |
| `open-code-review` | Defect review via `ocr` |

## Module skills (copy to enable)

| Module | Skills |
|--------|--------|
| `http-api` | `api-and-interface-design` |
| `web-ui` | `frontend-ui-engineering`, `browser-testing-with-devtools` |

## Per-agent required reads

| Agent | Always | Conditional |
|-------|--------|-------------|
| `asdd-discovery-agent` | `domain-language-extraction`, `anti-pattern-detection` | epic / BMC / 2+ caps as needed |
| `asdd-spec-agent` | `domain-language-extraction`, `anti-pattern-detection` | `api-and-interface-design` if API **and installed** |
| `asdd-validation-agent` | `anti-pattern-detection` | API skill if installed |
| `asdd-domain-agent` | `domain-language-extraction` | — |
| `asdd-design-agent` | — | frontend / API / docs skills when relevant **and installed** |
| `asdd-task-planning-agent` | — | frontend / API / `test-driven-development` |
| `asdd-implementation-agent` | **`test-driven-development`** | `open-code-review`; API/UI skills if installed |
| `asdd-qa-agent` | — | anti-pattern / TDD / OCR / UI / API as relevant |
| `asdd-refactor-agent` | **`test-driven-development`** | OCR / UI / API / docs as relevant |
| `asdd-e2e-tester` | — | (module playwright-e2e) frontend skill if installed |
| `asdd-integration-tester` | — | (module bruno) API skill if installed |
| `asdd-knowledge-agent` | **`documentation-and-adrs`** | — |

## Execution rule

1. Load **Always** skills for your agent.
2. Load **Conditional** skills when the concern applies **and** the skill file exists.
3. List loaded skills in the final message.
