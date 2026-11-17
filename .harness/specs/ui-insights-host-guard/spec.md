# ui-insights-host-guard — Spec (hotfix)

## Intent

`GET /api/insights/skill-eval` (slice ui-insights) starts a process: `asdd skill-eval` runs the fixtures' probes
with a shell. The server binds 127.0.0.1, but without a Host check a page the user has open elsewhere can reach it
through DNS rebinding and trigger runs at will. Found at integration. Require the loopback Host (the same check the
write endpoint uses) before any request that starts a process; read-only endpoints are unchanged.

Mapped: `cli/src/harness/ui-server.mjs`, `cli/src/harness/ui-server.test.mjs`

## Requirements

- **REQ-001.** `asdd ui` shall answer 403 to `/api/insights/skill-eval` when the `Host` header is not `127.0.0.1:<port>` or `localhost:<port>`, and shall not start a process for that request.
