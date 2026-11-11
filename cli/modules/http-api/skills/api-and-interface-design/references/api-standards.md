# REST API Standards

Generic HTTP/REST conventions for any service. Use with the parent skill [`../SKILL.md`](../SKILL.md).

**Ownership**

| This file | Parent skill |
|-----------|----------------|
| Resource URLs, methods, status codes, pagination/filter/sort | Design principles, Hyrum/one-version, deep idempotency semantics, TS contracts |
| Error JSON shape, versioning, auth/CORS/rate-limit *patterns* | When to version vs extend |
| Docs, logging headers, testing checklist | — |

Prefer **project** global prefix, auth guards, and OpenAPI setup from the repo (bootstrap, README, or project conventions docs) when they exist.

## Resource naming

- Nouns for resources; HTTP method for the action  
- Plural collections: `GET /users`, `GET /users/{id}`  
- Nest at most **two** levels (`/users/{id}/orders`); otherwise flatten (`/order-items/{id}`)  
- No verbs in paths (`/getUsers`, `/createOrder`)

```
GET    /tasks
POST   /tasks
GET    /tasks/{id}
PUT    /tasks/{id}      # full replace
PATCH  /tasks/{id}      # partial
DELETE /tasks/{id}
GET    /tasks/{id}/comments
POST   /tasks/{id}/comments
```

## HTTP methods

| Method | Use | Notes |
|--------|-----|--------|
| GET | Read | Safe, cacheable when appropriate |
| POST | Create or non-idempotent action | Often needs idempotency key |
| PUT | Full replace | Idempotent; send full resource |
| PATCH | Partial update | Only provided fields |
| DELETE | Remove | Idempotent |

Create → **201** + `Location` when a new resource URI exists. Delete → **204** (or **200** with body if the API always returns entities).

## Status codes

**2xx:** 200, 201, 202, 204  
**4xx:** 400, 401, 403, 404, 409, 422, 429  
**5xx:** 500, 502, 503, 504 — never leak stack traces or internals

## Error body

Use one shape everywhere:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "field": "email", "message": "Invalid format" }],
    "timestamp": "2026-01-15T10:30:00Z",
    "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
  }
}
```

Return **all** validation errors in one response when practical.

## Versioning

- Prefer URI version (`/api/v1/...`) when the project versions HTTP APIs  
- New major version only for **breaking** changes (removed/renamed fields, auth change, response shape break)  
- Optional fields and new endpoints stay on the current version  
- Deprecate with headers / docs / dual-run window before removal

## Pagination

Every list needs a strategy:

**Offset/limit** (simple admin lists):

```json
{
  "data": [],
  "pagination": { "limit": 20, "offset": 0, "total": 142, "hasMore": true }
}
```

**Cursor** (feeds / high write):

```json
{
  "data": [],
  "pagination": { "nextCursor": "...", "hasMore": true }
}
```

Defaults: sensible `limit` max; reject unbounded scrapes.

## Filtering, sorting, search

- Filters: query params (`?status=active&createdAfter=2026-01-01`)  
- Sort: explicit, documented (`?sort=createdAt:desc` or `sortBy` + `sortOrder`)  
- Search: dedicated param or `/search` sub-resource — document relevance behavior  

## Authentication and security patterns

- HTTPS in production  
- **Bearer / session** for user agents; **API keys** for service-to-service  
- Fail closed when credentials missing in non-dev  
- Rate limit; return `429` and standard limit headers when used:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1640995200
```

## Idempotency (HTTP)

- GET / PUT / DELETE: naturally idempotent  
- POST with side effects: honour `Idempotency-Key` (semantics in parent skill)  
- Missing required key → 400; key reuse with different body → 422; in-flight → 409 / wait / 202 per product choice  

## CORS

- Explicit allowlist of origins in production  
- `*` only for truly public, credential-less APIs  
- Allow only needed methods and headers  

## Content types

- Default JSON (`application/json`)  
- Use `Accept` / content negotiation only when multiple representations are first-class  

## Response design

- Prefer flat or shallow graphs over deep nested trees  
- Optional field selection (`?fields=`) only if the project standardizes it  
- Dates as ISO-8601  

## Observability

- Propagate / generate `X-Request-ID` (or project equivalent) on every response  
- Structured logs: method, path, status, duration, requestId — **no secrets or raw PII payloads**  
- Track latency percentiles, error rate, auth failures, rate-limit hits  

## Documentation

Every public endpoint documents: method, path, auth, params, body schema, response schema, status codes, errors, example. Prefer OpenAPI generated from the source of truth.

## Testing checklist

- [ ] Happy path  
- [ ] Auth failure (401/403)  
- [ ] Validation errors (full set)  
- [ ] Not found / conflict  
- [ ] Pagination edges  
- [ ] Idempotent POST replay (same key → same result; different body → error)  
- [ ] Rate limit behavior if enabled  

## Common mistakes

1. GET that mutates state  
2. Verbs in URLs  
3. Inconsistent naming (`userId` vs `user_id`)  
4. Exposing table/ORM names in paths  
5. Breaking changes without a version or deprecation window  
6. Accepting idempotency keys without atomic honouring (see parent skill)  

## Verification (REST)

- [ ] Noun paths, consistent plurals  
- [ ] Correct methods and status codes  
- [ ] Shared error envelope  
- [ ] Pagination on lists  
- [ ] Auth + HTTPS posture documented  
- [ ] OpenAPI or equivalent updated  
- [ ] Parent skill verification also passes  
