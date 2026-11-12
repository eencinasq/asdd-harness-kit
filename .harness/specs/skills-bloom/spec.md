# skills-bloom — Spec (lite)

## Intent

Review of every skill the CLI ships (`cli/skills/*`, `cli/modules/*/skills/*`) against the revised Bloom's taxonomy
(cognitive level C1–C6 × knowledge type; the contract each level needs: output shape, level-appropriate proof, one
dominant level per step, the strongest counter-case for a judgment). The best skills (`codebase-audit`,
`capability-discovery`, `product-delivery`) already follow it; this slice brings the others to the same contract and adds
the sensor that keeps agent-defined cutoffs out of skills. P1: REQ-001…003 and REQ-008; P2: REQ-004…006; P3: REQ-007.

Out of scope: moving `create-mcp-app` into a module, renaming skills, changing the gates in `quality-gates.md`.

## Requirements

- **REQ-001.** The `test-driven-development` skill shall have each test name the `REQ-NNN` it verifies (the token `DRIFT-04` looks for) and shall have the verification result recorded in the feature's `evidence` before it is set `passing`.
- **REQ-002.** The `anti-pattern-detection` skill shall define no cutoff or score arithmetic of its own (the gate thresholds stay in `quality-gates.md`, QG-DIS-02/03, cited by ID), shall define its score unambiguously, shall reference only skills the kit ships, shall report findings before proposing fixes (detection and rewriting as separate steps), and shall have each finding checked in context so a listed word that is precise where it stands is not a violation.
- **REQ-003.** The `business-model-canvas` skill shall map all nine Business Model Canvas blocks and the Lean Canvas blocks, shall give an output schema, shall mark every generated capability, requirement, and EARS criterion `PROPOSED — VALIDATION REQUIRED` with the canvas block it came from, shall write `PENDING_DEFINITION` for an empty block instead of inventing it, and shall define no cutoff of its own.
- **REQ-004.** The `domain-language-extraction` skill shall extract only from the supplied text, shall cite the source (document and section or line) of every term, shall mark a definition the text does not state as `ASSUMPTION — CONFIRMATION REQUIRED`, and shall define no cutoff of its own.
- **REQ-005.** Every skill step that judges against criteria (`anti-pattern-detection`, the `shape-up` pitch review, the `documentation-and-adrs` alternatives, `codebase-audit`) shall name the criteria, cite the evidence for each verdict, and state the strongest counter-case for it.
- **REQ-006.** The `shape-up` skill shall reference only commands and skills the kit ships, shall number and order its flows consistently, shall have the pitch review cite evidence from the pitch for each pass or fail, and shall be shorter than before.
- **REQ-007.** The `create-mcp-app` skill shall give a workflow with an output for each step, the acceptance criteria of the finished app, and a verification checklist.
- **REQ-008.** `asdd kit guidance` (cutoffs) shall scan the skills a project receives (`.agents/skills/**`) as well as the agents, and fail on an agent-defined cutoff there.

## Design

- Pattern: the contract of the reference skills (`codebase-audit`: criteria → verdict → `file:line` evidence; `capability-discovery`: chain of steps, each with its output, provenance markers, human stop).
- Markers reuse the ones `product-delivery` defines: `PENDING_DEFINITION`, `ASSUMPTION — CONFIRMATION REQUIRED`, `PROPOSED — VALIDATION REQUIRED`.
- Numbers that are not gates (pattern limits such as "more than 10 FRs", counts, "top N") stay; comparisons of a score against a threshold leave the skills.
- Sources edit `cli/`; `asdd kit self` refreshes the kit's copies.
