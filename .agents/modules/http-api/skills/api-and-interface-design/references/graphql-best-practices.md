# GraphQL Best Practices

Generic GraphQL conventions for any service. Use with the parent skill [`../SKILL.md`](../SKILL.md).

**Ownership**

| This file | Parent skill |
|-----------|----------------|
| Schema design, nullability, Query/Mutation/Subscription roles | Contract-first, Hyrum, one-version, additive evolution |
| Connections/cursors, error *extensions*, N+1 / DataLoader | Idempotency *semantics* for side-effecting mutations |
| Authz at field/type level, complexity/depth limits, deprecation | Cross-style naming / boundary validation |
| Client operation hygiene, docs/testing checklist | — |

Prefer **project** schema location, codegen, and gateway setup from the repo when they exist. Do not invent a conflicting style.

## Schema design

- Schema is the **public contract** — design for consumers, not tables/ORMs  
- Prefer a **graph of domain types** over RPC-shaped fields (`createUserTask` as the only surface)  
- Keep business names stable; map persistence privately  
- Prefer concrete types; use interfaces/unions when polymorphism is real  
- Input types (`CreateTaskInput`) separate from output types (`Task`)

```graphql
type Task {
  id: ID!
  title: String!
  status: TaskStatus!
  assignee: User
  comments(first: Int, after: String): CommentConnection!
}

input CreateTaskInput {
  title: String!
  assigneeId: ID
}

type Mutation {
  createTask(input: CreateTaskInput!): CreateTaskPayload!
}
```

Prefer **payload types** for mutations (entity + userErrors / extensions) over bare scalars.

## Query vs Mutation vs Subscription

| Root | Use |
|------|-----|
| Query | Reads only — no side effects |
| Mutation | Creates, updates, deletes, or other side effects |
| Subscription | Push updates; keep payloads small and authz-checked |

Never put writes behind Query fields. Document which mutations are safe to retry (see parent skill idempotency).

## Nullability

- Mark fields non-null (`!`) only when the server **guarantees** a value on success  
- Prefer nullable for optional associations and computed fields that can fail independently  
- Avoid “null bombs”: one nullable parent can wipe a large selection set — design error strategy deliberately  
- Lists: `\[Task!\]!` vs `\[Task\]` — document empty vs absent

## Naming

| Surface | Convention |
|---------|------------|
| Types / fields | `PascalCase` types, `camelCase` fields (GraphQL default) |
| Booleans | `is` / `has` / `can` |
| Mutations | Verb + noun: `createTask`, `archiveTask` |
| Inputs | `XxxInput`; payloads `XxxPayload` |
| Enums | Documented, stable SCREAMING_SNAKE or project-standard |

## Pagination

Prefer **cursor Connections** (Relay-style) for lists that grow or are feed-like:

```graphql
type TaskConnection {
  edges: [TaskEdge!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type TaskEdge {
  node: Task!
  cursor: String!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}
```

Offset pagination is acceptable for small admin lists — document max `limit`. Unbounded lists are a defect.

## Errors

HTTP is often **200** with GraphQL errors in `errors[]`. Still:

- Use a **single** error extension shape project-wide (`code`, `field`, `correlationId`)  
- Separate **request validation** (bad variables) from **domain** failures (business rules)  
- Prefer mutation payload `userErrors` for expected domain failures; reserve top-level `errors` for unexpected / transport-class issues when that is the project pattern  
- Never leak stack traces or internal IDs in `message`

```json
{
  "errors": [
    {
      "message": "Not authorized to view this task",
      "path": ["task"],
      "extensions": {
        "code": "FORBIDDEN",
        "correlationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
      }
    }
  ]
}
```

## N+1 and resolvers

- Assume field resolvers run per parent — plan DataLoader (or equivalent batching) for nested associations  
- Avoid hidden queries in type resolvers without batching  
- Prefer resolving IDs in parents and batching children over sequential awaits in loops  
- Watch subscription fan-out cost

## Authorization

- Enforce authn at the operation boundary; enforce **authz per field/type** that exposes sensitive data  
- Do not rely on the client omitting fields  
- Return `FORBIDDEN` / null per project policy — be consistent (error vs null) and document it  
- Filter lists in the resolver/data layer, not only in the response mapper

## Evolution and versioning

- Prefer **additive** schema changes: new fields, new optional args, new types  
- Deprecate with `@deprecated(reason: "...")` before removal; give clients a window  
- Avoid long-lived parallel schemas (“v1 schema” + “v2 schema”) unless product-mandated — align with parent one-version rule  
- Changing a field from non-null to nullable (or removing args) is breaking — treat as such

## Performance and abuse controls

- Enforce **depth** and/or **complexity** limits on public APIs  
- Persist / allowlist operations in production when appropriate (persisted queries)  
- Time out expensive operations; paginate large connections  
- Rate-limit by identity / API key

## Client hygiene

- Named operations only (`query GetTask`, not anonymous)  
- Request only needed fields (avoid mega-fragments of everything)  
- Typed documents via codegen when the stack supports it  
- Idempotency keys for money / side-effect mutations via extension or input field — honour them (parent skill)

## Documentation

- Describe every public type/field that is not obvious  
- Document auth requirements and error codes  
- Keep schema SDL (or equivalent) the source of truth; generate client types from it

## Testing checklist

- [ ] Happy-path query / mutation  
- [ ] Authn missing / authz forbidden on sensitive fields  
- [ ] Validation errors on bad input  
- [ ] Domain failure via payload or extensions (per project pattern)  
- [ ] Pagination edges (`first`/`after`, empty page, `hasNextPage`)  
- [ ] Nested associations do not N+1 under representative load  
- [ ] Deprecated fields still work until removal date  
- [ ] Mutation replay / idempotency when keys are in contract  

## Common mistakes

1. Mutations exposed as Query fields  
2. Everything non-null “for convenience”  
3. ORM entities leaked as GraphQL types  
4. Unbounded lists without Connection / limit  
5. No DataLoader → N+1 in production  
6. Auth only at the HTTP gateway, not on sensitive fields  
7. Breaking nullability / arg changes without deprecation  
8. Anonymous operations and undocumented error shapes  

## Verification (GraphQL)

- [ ] Clear Query / Mutation / Subscription split  
- [ ] Nullability matches real guarantees  
- [ ] Lists paginated (Connection or documented offset)  
- [ ] Consistent error extensions / payload errors  
- [ ] Nested fields batched or justified  
- [ ] Field-level authz where data is sensitive  
- [ ] Additive evolution / `@deprecated` for removals  
- [ ] Parent skill verification also passes  
