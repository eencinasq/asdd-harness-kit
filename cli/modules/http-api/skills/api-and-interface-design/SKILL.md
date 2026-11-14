---
name: api-and-interface-design
description: >-
  Designs typed contracts (REST, GraphQL, DTOs). Use when changing an endpoint or schema. Do NOT use for ADRs — use
  documentation-and-adrs.
metadata:
  tier: leaf
---

# API and Interface Design

Stable, typed interfaces that make the right call easy and the wrong one hard. Principles (Hyrum's law, one-version
rule, error mapping, boundary validation, naming, idempotency, TypeScript patterns, red flags):
[`references/design-principles.md`](./references/design-principles.md). REST resource shape, status codes, pagination,
auth, versioning, CORS: [`references/api-standards.md`](./references/api-standards.md). GraphQL schema, nullability,
connections, errors, N+1, field authorization: [`references/graphql-best-practices.md`](./references/graphql-best-practices.md).

**Operational boundary:** the contract files of the change (OpenAPI document, GraphQL SDL, shared types or DTOs) and the
handlers or resolvers that implement them. It never changes another surface's contract in the same change.

## Input / Output Contract

- **Inputs:** `change` (`string`, the operation to add or change, required); `surface` (`enum`, `rest` | `graphql` |
  `module`, required); `req_ids` (`string[]`, `^REQ-\d{3}$`, in an ASDD slice).
- **Outputs:** `contract` (`openapi | sdl | types`, the typed contract: the OpenAPI path, the SDL type and fields, or the exported types, at the
  project's contract location); `deprecations` (`markdown`, each removed or changed field with its deprecation path,
  in the change description or the ADR).

## Execution Protocol

### Step 1: Find the project conventions

- **Action:** locate the global prefix, the OpenAPI or SDL location, codegen, auth, error envelope, and naming style
  already in use (`.harness/steering/tech.md`, then the repository).
- **Target:** the repository.
- **Assertion:** each convention is named with the file it comes from; when two conflict, stop at the Escalation Gate.

### Step 2: Write the contract first

- **Action:** write typed inputs, outputs, and the error shape before any implementation; read the REST or GraphQL
  reference for the surface. Add, do not break: new optional fields or operations; a removal or type change gets a
  deprecation path (`@deprecated` in GraphQL).
- **Target:** the contract file.
- **Assertion:** every public operation of the change has typed request, response, and error.

### Step 3: Implement at the boundary

- **Action:** validate at the edge (HTTP or GraphQL input, env load, every third-party response), not deep in the
  domain; side-effecting writes that accept an idempotency key claim it atomically and fail loudly on a key reused with
  another body.
- **Target:** the handlers or resolvers.
- **Assertion:** the project's contract check (OpenAPI lint, schema check, or type check from `tech.md`) exits 0.

## Verification Gate

1. The project's contract check exits 0 (for example `npx @redocly/cli lint <openapi>`, a GraphQL schema check, or `tsc --noEmit`, as `tech.md` names).
2. The project's test command exits 0.
3. One error format per surface: the changed operations' error responses reference the same schema
   (`grep` the contract for the error schema name).
4. The checklist of the matching reference (`api-standards.md` or `graphql-best-practices.md`) holds.
5. Negative check: `git diff --name-only` lists only contract, handler or resolver, and test files of this surface.

## Escalation Gate

HALT when the change breaks a published contract and no deprecation path is agreed, when two conventions conflict, or
when an idempotency key cannot be claimed atomically with the store in use. Escalate as Context → Options →
Recommendation → Decision Needed.

## Handoff & Convergence

- **handoff → `documentation-and-adrs`:** when the change is a decision expensive to reverse (API style, versioning,
  breaking change); passes `contract` and `deprecations`.
- **handoff → `test-driven-development`:** for the handler and resolver logic; passes `contract`.
