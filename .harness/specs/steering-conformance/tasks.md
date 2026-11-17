# steering-conformance — Tasks

| Task | Behavior | Verification | Scope |
|------|----------|--------------|-------|
| TASK-001 | Retag knowledge.md (drop domain/design/lite) + quality-gates.md (→ validation,qa) + quality-gates.project.md both copies (+validation) | `asdd check` zero steering-tags warns | cli/steering/knowledge.md, cli/steering/quality-gates.md, .harness/steering/quality-gates.project.md, cli/templates/bindings/quality-gates.project.md |
| TASK-002 | skills.md Negative space slot | grep section present; npm test | cli/steering/skills.md |
| TASK-003 | Regenerate projections + installed copies; v1.md → converged in vault | `generate-runtime-steering --check` + `kit self --check` pass; v1.md status converged | .harness/steering/, .cursor/rules/asdd-steering.mdc, vault v1.md |
