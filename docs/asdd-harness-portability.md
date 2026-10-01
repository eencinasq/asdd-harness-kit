# ASDD + Harness portability (kit)

How this template maps to product repos.

## Layers

| Layer | Here |
|-------|------|
| **A. Kit core** | This repository |
| **B. Modules** | Optional modules remain in the kit and are copied only when enabled |
| **C. Bindings** | `.harness/steering/{product,structure,tech,*.project}.md` stubs |
| **D. Runtimes** | Runtime adapters maintained in this kit under runtimes/ |

## Adopter checklist

1. Use this template (GitHub "Use this template" or clone).
2. Fill all required bindings.
3. Install the runtime links you use with scripts/install-into.sh. Runtime recipes stay in this kit and are not copied into product repos.
4. Enable modules with `scripts/install-into.sh --modules=<list>` from this kit, or with the GitHub `--from-git` form.
5. Validate the generated adapter: `node .harness/scripts/check-project-config.mjs`.
6. Validate Harness state: `node .harness/scripts/check-invariants.mjs`. This also checks that `.harness/steering/skills.md` lists only the name and description of each folder under `.agents/skills/`.
7. Fill `quality-gates.project.md` before Discovery: the full-suite command, the failure-log path, and `Active findings` (`none` or real rows). A stub blocks the gate that needs it.
8. With `--runtime=cursor`, confirm `.cursor/hooks.json` runs `node .harness/scripts/verify-on-stop.mjs` on `stop`.
9. Create the first slice via Discovery or ASDD-Lite. Read [asdd-and-harness-engineering.md](asdd-and-harness-engineering.md) for how guides and sensors fit.

## Do not copy from a product monorepo

Specs, PROGRESS history, filled product/structure/tech, or Nx-specific boundary scripts from another app.


## Install into an existing repo

```bash
./scripts/install-into.sh /path/to/existing-repo --modules=http-api --runtime=cursor
# or: curl …/install-into.sh | bash -s -- /path/to/repo --from-git …
```

See root README § *Add to an existing project*. Smoke: `./scripts/test-install-into.sh`.
