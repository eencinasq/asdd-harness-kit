#!/usr/bin/env bash
# Full-flow e2e: Shape Up → Product Delivery (gates decided by a human) → ASDD + Harness slice
# lifecycle (lite → implement → evidence → escalation → DONE) → session-close verify-on-stop.
# Jev is not part of this pipeline (only the kit's jev-gate MCP server, for chat).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
asdd() { node "$ROOT/cli/bin/asdd.mjs" "$@"; }
TMP="$(mktemp -d "${TMPDIR:-/tmp}/asdd-fullflow-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

APP="$TMP/orderflow-app"
mkdir -p "$APP"
asdd install "$APP" --runtime=cursor,claude --no-interactive >/dev/null
cd "$APP"
git init -q
git config user.email "test@asdd.local"
git config user.name "asdd-test"

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

echo "== 2. slice init (lite default) + spec artifacts =="
asdd slice init order-flow >/dev/null
grep -q '"mode": "lite"' .harness/state/slices/order-flow/manifest.json

cat >.harness/specs/order-flow/intent.md <<'EOF'
# Order Flow — Reorder

Intent: customers reorder a previous purchase with one tap from the orders page.
Scope: `src/checkout` only (this feature). No subscriptions, no cart editing.
EOF
cat >.harness/specs/order-flow/spec.md <<'EOF'
# Order Flow — spec (lite)

Intent: one-tap reorder from the orders page.

Requirements (EARS):
- WHEN a customer requests a reorder for an existing order, the system SHALL create
  a new cart with the same line items.
- IF an item is unavailable, THEN the system SHALL exclude it and report it.
EOF
cat >.harness/specs/order-flow/tasks.md <<'EOF'
# order-flow — tasks

- f1: reorder service (src/checkout/reorder.js + test)
- f2: checkout ui surface (web/checkout — out of lite scope, triggers escalation)
EOF

cat >.harness/features/order-flow.features.json <<'JSON'
{
  "schema_version": "1.0",
  "slice_id": "order-flow",
  "source_tasks": ".harness/specs/order-flow/tasks.md",
  "features": [
    {
      "id": "f1",
      "title": "Reorder service",
      "user_visible_behavior": "One-tap reorder creates a new cart with the same items",
      "status": "in_progress",
      "priority": 1,
      "owner": "test-agent",
      "verification": ["node --test test/reorder.test.mjs"],
      "evidence": "",
      "scope_paths": ["src/checkout"]
    },
    {
      "id": "f2",
      "title": "Checkout UI surface",
      "user_visible_behavior": "Reorder card appears on the orders page",
      "status": "pending",
      "priority": 2,
      "owner": "test-agent",
      "verification": ["node --test test/reorder-ui.test.mjs"],
      "evidence": "",
      "scope_paths": ["web/checkout"]
    }
  ]
}
JSON

cat >.harness/state/slices/order-flow/sessions/002-f1.json <<JSON
{ "session_id": "sess-of-002", "timestamp": "$(now)", "agent": "test-agent", "human": "squad", "slice_id": "order-flow", "event_type": "feature_started", "phase": "implementation", "feature_id": "f1", "scope_paths": ["src/checkout"] }
JSON
asdd sync >/dev/null
grep -q '"phase": "implementation"' .harness/state/slices/order-flow/manifest.json

echo "== 3. implement f1 (baseline commit, then work diff) =="
mkdir -p src/checkout test
cat >src/checkout/reorder.js <<'EOF'
export function buildReorderCart(order) {
  return { items: order.items.slice() };
}
EOF
git add -A >/dev/null && git commit -qm baseline

cat >src/checkout/reorder.js <<'EOF'
export function buildReorderCart(order, availability = {}) {
  const unavailable = order.items.filter((i) => availability[i.sku] === false);
  return {
    items: order.items.filter((i) => availability[i.sku] !== false),
    excluded: unavailable,
  };
}
EOF
cat >test/reorder.test.mjs <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReorderCart } from '../src/checkout/reorder.js';

test('reorder copies line items and excludes unavailable', () => {
  const order = { items: [{ sku: 'a' }, { sku: 'b' }] };
  const cart = buildReorderCart(order, { b: false });
  assert.equal(cart.items.length, 1);
  assert.equal(cart.excluded.length, 1);
});
EOF
node --test test/reorder.test.mjs >/dev/null

asdd check >/dev/null

echo "== 5. evidence + complete f1 =="
export EVIDENCE="$(node --test test/reorder.test.mjs 2>&1 | grep -E '^# pass' | tr '\n' ' ')"
node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs';
const p = '.harness/features/order-flow.features.json';
const doc = JSON.parse(readFileSync(p, 'utf8'));
doc.features[0].status = 'passing';
doc.features[0].evidence = process.env.EVIDENCE.trim();
doc.features[1].status = 'in_progress';
doc.features[1].owner = 'ui-agent';
writeFileSync(p, JSON.stringify(doc, null, 2) + '\n');
EOF
cat >.harness/state/slices/order-flow/sessions/003-f1-done.json <<JSON
{ "session_id": "sess-of-003", "timestamp": "$(now)", "agent": "test-agent", "slice_id": "order-flow", "event_type": "feature_completed", "feature_id": "f1", "evidence": "node --test test/reorder.test.mjs" }
JSON
cat >.harness/state/slices/order-flow/sessions/004-f2.json <<JSON
{ "session_id": "sess-of-004", "timestamp": "$(now)", "agent": "ui-agent", "slice_id": "order-flow", "event_type": "feature_started", "phase": "implementation", "feature_id": "f2", "scope_paths": ["web/checkout"] }
JSON
asdd sync >/dev/null
grep -q 'E1-scope-spread' .harness/state/slices/order-flow/manifest.json

echo "== 6. escalation evidence → DONE blocked → escalate → DONE =="
cat >.harness/state/slices/order-flow/sessions/005-dissent.json <<JSON
{ "session_id": "sess-of-005", "timestamp": "$(now)", "agent": "ui-agent", "slice_id": "order-flow", "event_type": "dissent", "phase": "implementation", "note": "ui surface implies a second module — architectural decision" }
JSON
cat >.harness/state/slices/order-flow/sessions/006-f2-done.json <<JSON
{ "session_id": "sess-of-006", "timestamp": "$(now)", "agent": "ui-agent", "slice_id": "order-flow", "event_type": "feature_completed", "feature_id": "f2", "evidence": "stub ui verified" }
JSON
node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs';
const p = '.harness/features/order-flow.features.json';
const doc = JSON.parse(readFileSync(p, 'utf8'));
doc.features[1].status = 'passing';
doc.features[1].evidence = 'stub ui verified';
writeFileSync(p, JSON.stringify(doc, null, 2) + '\n');
EOF
cat >.harness/state/slices/order-flow/sessions/007-knowledge.json <<JSON
{ "session_id": "sess-of-007", "timestamp": "$(now)", "agent": "test-agent", "slice_id": "order-flow", "event_type": "phase_completed", "phase": "knowledge", "evidence": "attempted close with open signals" }
JSON
asdd sync >/dev/null
if grep -q '"status": "DONE"' .harness/state/slices/order-flow/manifest.json; then
  echo "lite slice reached DONE with open escalation signals" >&2; exit 1
fi
LIVE_OUT="$(asdd check --live 2>&1 || true)"
grep -q 'cannot complete with open escalation signals' <<<"$LIVE_OUT" || { echo "$LIVE_OUT"; exit 1; }
echo "  live invariants correctly blocked the lite close"

asdd slice escalate order-flow --reasons "E1-scope-spread,E4-dissent" --by test-agent >/dev/null
grep -q '"mode": "escalated"' .harness/state/slices/order-flow/manifest.json
grep -q '"status": "DONE"' .harness/state/slices/order-flow/manifest.json
grep -q '"escalated_from_lite": true' .harness/state/slices/order-flow/manifest.json

asdd check --live >/dev/null

echo "== 7. session close: verify-on-stop live =="
printf '{"status":"completed","loop_count":0}' | asdd verify | grep -qx '{}'
printf '{"hook_event_name":"Stop","stop_hook_active":false}' | asdd verify | grep -qx '{}'
echo "  stop gates released the session"

echo "== 8. status surface =="
asdd status | tee /tmp/asdd-fullflow-status.log >/dev/null
grep -q 'order-flow' /tmp/asdd-fullflow-status.log
grep -q 'escalated' /tmp/asdd-fullflow-status.log
grep -q 'DONE' /tmp/asdd-fullflow-status.log
cat /tmp/asdd-fullflow-status.log

echo "OK full-flow e2e test"
