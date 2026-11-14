# Spec-as-source (experimental pilot)

This is **not the default** source of truth for ASDD + Harness.

## Default rule (unchanged)

- Specs and evidence live under `.harness/`.
- **Product code stays editable** by humans and agents.
- Sensors (DRIFT, converge, check) reconcile specs ↔ code; they do not generate the codebase from specs.

## Opt-in pilot

Set in `.harness/config/project.json`:

```json
{
  "capabilities": {
    "spec_as_source": true
  }
}
```

Then run:

```bash
asdd spec-source
asdd spec-source --slice <id> --json
```

You get a read-only inventory of MUST REQs vs feature `req_ids` and test mentions (Tessl-like *visibility*, not Tessl *generation*).

## When to use

- Pilots that want a checklist of uncovered MUST requirements before QA.
- Conversations about tightening traceability without changing the SoT model.

## When not to use

- As a default for every repo (leave `spec_as_source` unset/false).
- As a code generator or “spec locks the tree” workflow — that remains out of kit policy (see `docs/ASDD-ROADMAP.md` §6).
