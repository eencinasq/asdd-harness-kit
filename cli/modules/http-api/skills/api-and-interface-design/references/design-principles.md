# Interface design principles — reference

Loaded by the `api-and-interface-design` skill in Step 2 (contract) and Step 3 (review). REST detail lives in
`api-standards.md`, GraphQL detail in `graphql-best-practices.md`.

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

REST JSON shape → `api-standards.md`.  
GraphQL `errors[]` / payload errors → `graphql-best-practices.md`.

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
