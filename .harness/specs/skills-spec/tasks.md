# skills-spec — Tasks

Each skill task applies P1 → P4 (REQ-001…005) to its group in one pass, so no later phase reopens an earlier task's files (`DRIFT-02`).

| Task | Requirements | Scope |
|------|--------------|-------|
| TASK-001 Discovery skills to the grammar | REQ-001 REQ-002 REQ-004 REQ-005 | `cli/skills/{anti-pattern-detection,business-model-canvas,domain-language-extraction,capability-discovery}/SKILL.md` |
| TASK-002 Shaping and delivery skills; one scope-map owner, one tracker-write owner | REQ-001 REQ-002 REQ-004 REQ-005 | `cli/skills/{shape-up,product-delivery,external-trackers}/**` |
| TASK-003 Engineering core skills; TDD trigger narrowed; absolute paths removed; tutorials to references | REQ-001 REQ-002 REQ-003 REQ-004 REQ-005 | `cli/skills/{test-driven-development,documentation-and-adrs,codegraph,codebase-audit,create-mcp-app}/**` |
| TASK-004 Module skills (http-api, web-ui) with bilateral boundaries | REQ-001 REQ-002 REQ-004 REQ-005 | `cli/modules/http-api/skills/**`, `cli/modules/web-ui/skills/**` |
| TASK-005 Steering: markers and escalation format, prohibitions, halts; design agent cites the ADR skill (after TASK-001…004: the index lists their descriptions) | REQ-002 REQ-003 | `cli/steering/{skills,controls,README,security-rules}.md`, `cli/agents/asdd-design-agent.md` |
| TASK-006 `asdd kit skills-lint` in `npm test` (after TASK-001…005); after the escalation, also the shipped-content test for AC-002 and AC-003 (VAL-002) | REQ-002 REQ-003 REQ-006 | `cli/src/kit/skills-lint.mjs`, `cli/src/main.mjs`, `cli/test/skills-lint.test.mjs`, `package.json` |

After the escalation (E1-scope-spread) Task Planning added no task: the AC-002/AC-003 shipped-content test reopens
TASK-006 (same test file). Order: TASK-001…005 passing; TASK-006 reopened, then QA.
