---
name: api-and-interface-design
description: >-
  Designs stable REST/HTTP APIs, GraphQL schemas, and typed module boundaries
  that are hard to misuse. Use when designing or changing endpoints, public
  contracts, GraphQL schemas, frontend–backend boundaries, DTOs, or any surface
  one system calls another. Loads references/api-standards.md (REST) and
  references/graphql-best-practices.md (GraphQL) via progressive disclosure.
---

# API and Interface Design

## Overview

Design stable, well-documented interfaces that make the right thing easy and the wrong thing hard — HTTP APIs, GraphQL schemas, module contracts, and typed boundaries.

**Progressive disclosure (complementary, no overlapping SoTs):**

| Load | Owns |
|------|------|
| This `SKILL.md` | Design principles, contracts, errors, validation boundaries, naming, idempotency *semantics*, TypeScript interface patterns, verification |
| [`references/api-standards.md`](./references/api-standards.md) | REST resource shape, HTTP methods/status, pagination/filter/sort, auth patterns, versioning, CORS, docs/testing checklists |
| [`references/graphql-best-practices.md`](./references/graphql-best-practices.md) | Schema design, nullability, Query/Mutation/Subscription, Connections, error extensions, N+1, field authz, evolution |

Discover **project** conventions from the repo (global prefix, schema path, auth, OpenAPI/codegen, app bootstrap). Do not invent a second conflicting style.

## When to Use

- New or changed HTTP/REST endpoints
- New or changed GraphQL schema, operations, or resolvers
- Module / package public exports and DTOs
- Frontend ↔ backend contracts
- Breaking-change / deprecation decisions
- Idempotent money or side-effecting writes

## Workflow

1. **Contract first** — typed inputs/outputs and error shape before implementation.
2. If work is HTTP/REST: **Read** `references/api-standards.md`.
3. If work is GraphQL: **Read** `references/graphql-best-practices.md`.
4. Align with project conventions found in the repo (prefix, auth, schema/OpenAPI location).
5. Implement; run Verification below (+ the matching reference checklist).

## Core Principles

### Hyrum’s Law

Every observable behavior becomes a dependency. Expose intentionally; do not leak implementation; plan deprecation when removing anything public.

### One-version rule

Prefer extending one live contract over long-lived parallel API versions or diamond dependency forks.

### Contract first

```typescript
interface TaskAPI {
  createTask(input: CreateTaskInput): Promise<Task>;
  listTasks(params: ListTasksParams): Promise<PaginatedResult<Task>>;
  getTask(id: string): Promise<Task>;
  updateTask(id: string, input: UpdateTaskInput): Promise<Task>;
  deleteTask(id: string): Promise<void>;
}
```

### Consistent errors

One error strategy everywhere for a given surface. For HTTP/REST, map:

| Status | Meaning |
|--------|---------|
| 400 | Malformed request |
| 401 | Unauthenticated |
| 403 | Forbidden |
| 404 | Missing resource |
| 409 | Conflict |
| 422 | Semantically invalid |
| 429 | Rate limited |
| 5xx | Server fault (no internals in body) |

REST JSON shape → `references/api-standards.md`.  
GraphQL `errors[]` / payload errors → `references/graphql-best-practices.md`.

### Validate at boundaries

Validate at HTTP/GraphQL edges, forms, env load, and **all third-party responses**. Do not re-validate trusted internal call chains that already share types.

### Prefer addition

Add optional fields / new endpoints / new GraphQL fields. Do not change field types or remove fields without a deprecation path (`@deprecated` in GraphQL).

### Predictable naming

| Surface | Convention |
|---------|------------|
| REST paths | Plural nouns, no verbs |
| GraphQL | `PascalCase` types, `camelCase` fields; mutations verb+noun |
| Query / JSON fields | One style project-wide (`camelCase` *or* `snake_case`) |
| Booleans | `is` / `has` / `can` |
| Enums | Documented stable strings |

### Idempotency (honour the key)

Accepting an idempotency key (header, extension, or input) without honouring it is worse than no key.

- Key from **client/intent**, stable across retries — not `randomUUID()` or `Date.now()` per attempt
- **Claim atomically** (unique constraint); no check-then-act races
- Same key + different body → **fail loudly** (e.g. 422 / domain error)
- In-flight duplicate: deliberate conflict, wait, or async accepted — never double-apply
- Treat outcomes as success / failure / **unknown**; record intent before side effects
- Retention ≥ longest retry/DLQ path

HTTP wiring → REST reference. Mutation patterns → GraphQL reference.

## TypeScript interface patterns

- Discriminated unions for variants
- Separate `CreateXInput` from `X` (server-generated fields)
- Branded IDs when ID mix-ups are costly

## Red flags

- Different response shapes for the same endpoint / operation family
- Mixed error formats
- Validation deep inside domain with no boundary gate
- Breaking field type or nullability changes
- List endpoints / fields without pagination strategy
- Verbs in REST URLs (`/createTask`); Query fields that mutate
- Unvalidated third-party payloads
- Idempotency TOCTOU or key regenerated per retry
- GraphQL N+1 with no batching; auth only at gateway for sensitive fields

## Verification

- [ ] Typed request/response (OpenAPI, GraphQL SDL, or shared types) for every public operation
- [ ] Single error format per surface
- [ ] Boundary validation only (plus untrusted externals)
- [ ] Lists paginated (or explicitly unbounded with rationale)
- [ ] Additive evolution / deprecation noted for breaks
- [ ] Consistent naming
- [ ] Side-effecting writes: idempotency key honoured or documented unsafe-to-retry
- [ ] **HTTP/REST:** checklist in `references/api-standards.md`
- [ ] **GraphQL:** checklist in `references/graphql-best-practices.md`

## See also

- REST detail: `references/api-standards.md`
- GraphQL detail: `references/graphql-best-practices.md`
