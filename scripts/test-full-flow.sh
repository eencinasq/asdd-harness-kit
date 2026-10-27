#!/usr/bin/env bash
# Full-flow e2e: Shape Up → Product Delivery (Jev live) → ASDD + Harness slice
# lifecycle (lite → implement → evidence → gold-plating → escalation → DONE)
# → session-close verify-on-stop.
#
# With JEV_API_KEY set, all Jev gates run against the live System One API and
# _unavailable results fail the test. Without a key, live stages are skipped
# (deterministic harness stages still run).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/asdd-fullflow-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

APP="$TMP/orderflow-app"
mkdir -p "$APP"
"$ROOT/scripts/install-into.sh" "$APP" --runtime=cursor,claude --no-interactive >/dev/null
cd "$APP"
git init -q
git config user.email "test@asdd.local"
git config user.name "asdd-test"

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

if [[ -n "${JEV_API_KEY:-}" ]]; then LIVE=1; else LIVE=0; fi
if [[ "$LIVE" -eq 0 ]]; then
  echo "NOTE  JEV_API_KEY not set — live Jev stages will be skipped"
fi

echo "== 0. live Jev health (System One) =="
if [[ "$LIVE" -eq 1 ]]; then
  node .harness/scripts/jev-gates.mjs health | grep -q '"status": "healthy"'
  echo "  healthy"
fi

echo "== 1. intake gates: Shape Up + Product Delivery (Jev) =="
if [[ "$LIVE" -eq 1 ]]; then
  node --input-type=module <<'EOF'
import { shapeUpGates, earsGate, scopeChoice, hillChartGate } from './.harness/scripts/jev-gates.mjs';

const pitch = {
  problem: 'Customers abandon carts because reordering requires rebuilding the cart.',
  appetite: '2 weeks',
  solution: 'One-tap reorder card on the orders page backed by a reorder API.',
  rabbit_holes: ['inventory reservation semantics'],
  no_gos: ['subscription scheduling', 'cart editing before reorder'],
};

const su = await shapeUpGates(pitch);
if (su.appetite._unavailable || su.rabbit._unavailable) {
  console.error('shapeUpGates unavailable:', su.appetite._reason || su.rabbit._reason);
  process.exit(1);
}
console.log(`  shapeUp  appetite=${su.appetite.score}/5 rabbit_hole_ok=${su.rabbit.prob_yes}`);

const ears = await earsGate(
  'WHEN a customer taps "reorder", the system SHALL create a new cart with the items of the referenced order within 2 seconds.'
);
if (ears.result._unavailable) {
  console.error('earsGate unavailable:', ears.result._reason);
  process.exit(1);
}
console.log(`  earsGate prob_yes=${ears.result.prob_yes} (pass>=0.85 → ${ears.ok})`);

const sc = await scopeChoice('Quick reorder: tapping Reorder on a past order fills the cart with its items at current prices.');
if (sc.result._unavailable) {
  console.error('scopeChoice unavailable:', sc.result._reason);
  process.exit(1);
}
console.log(`  scopeChoice=${sc.result.choice}`);

const hill = await hillChartGate({ task: 'reorder-api endpoint', timeboxRemaining: 0.1 });
if (hill.result._unavailable) {
  console.error('hillChartGate unavailable:', hill.result._reason);
  process.exit(1);
}
console.log(`  hillChart score=${hill.result.score}/5 breakCircuit=${hill.breakCircuit}`);
EOF
else
  echo "  skipped (no key)"
fi

echo "== 2. slice init (lite default) + spec artifacts =="
node .harness/scripts/init-slice.mjs order-flow >/dev/null
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
node .harness/scripts/sync-state.mjs >/dev/null
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

echo "== 4. gold-plating gate on the real diff (live Jev noul) =="
if [[ "$LIVE" -eq 1 ]]; then
  node --input-type=module <<'EOF'
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { goldPlatingGate } from './.harness/scripts/jev-gates.mjs';
const intent = readFileSync('.harness/specs/order-flow/intent.md', 'utf8').slice(0, 5000);
const diff = execFileSync('git', ['diff', '--', 'src/checkout'], { encoding: 'utf8' }).trim().slice(0, 5000);
const gate = await goldPlatingGate({ intent, diff, sliceId: 'order-flow' });
if (gate.result._unavailable) {
  console.error('goldPlatingGate unavailable:', gate.result._reason);
  process.exit(1);
}
console.log(`  gold-plating prob_yes=${gate.result.prob_yes} (pass>=0.85 → ${gate.ok})`);
EOF
fi
env -u JEV_API_KEY node .harness/scripts/check-invariants.mjs >/dev/null

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
node .harness/scripts/sync-state.mjs >/dev/null
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
node .harness/scripts/sync-state.mjs >/dev/null
if grep -q '"status": "DONE"' .harness/state/slices/order-flow/manifest.json; then
  echo "lite slice reached DONE with open escalation signals" >&2; exit 1
fi
if [[ "$LIVE" -eq 1 ]]; then
  LIVE_OUT="$(node .harness/scripts/check-invariants.mjs --live 2>&1 || true)"
  grep -q 'cannot complete with open escalation signals' <<<"$LIVE_OUT" || { echo "$LIVE_OUT"; exit 1; }
  echo "  live invariants correctly blocked the lite close"
else
  OFF_OUT="$(env -u JEV_API_KEY node .harness/scripts/check-invariants.mjs 2>&1 || true)"
  grep -q 'cannot complete with open escalation signals' <<<"$OFF_OUT" || { echo "$OFF_OUT"; exit 1; }
  echo "  invariants correctly blocked the lite close"
fi

node .harness/scripts/escalate-slice.mjs order-flow --reasons "E1-scope-spread,E4-dissent" --by test-agent >/dev/null
grep -q '"mode": "escalated"' .harness/state/slices/order-flow/manifest.json
grep -q '"status": "DONE"' .harness/state/slices/order-flow/manifest.json
grep -q '"escalated_from_lite": true' .harness/state/slices/order-flow/manifest.json

if [[ "$LIVE" -eq 1 ]]; then
  node .harness/scripts/check-invariants.mjs --live >/dev/null
else
  env -u JEV_API_KEY node .harness/scripts/check-invariants.mjs >/dev/null
fi

echo "== 7. session close: verify-on-stop live (real key) =="
if [[ "$LIVE" -eq 1 ]]; then
  printf '{"status":"completed","loop_count":0}' | node .harness/scripts/verify-on-stop.mjs | grep -qx '{}'
  printf '{"hook_event_name":"Stop","stop_hook_active":false}' | node .harness/scripts/verify-on-stop.mjs | grep -qx '{}'
  echo "  stop gates released the session"
else
  printf '{"status":"completed","loop_count":0}' | JEV_API_KEY=dummy node .harness/scripts/verify-on-stop.mjs | grep -qx '{}'
fi

echo "== 8. status surface =="
node .harness/scripts/harness-status.mjs | tee /tmp/asdd-fullflow-status.log >/dev/null
grep -q 'order-flow' /tmp/asdd-fullflow-status.log
grep -q 'escalated' /tmp/asdd-fullflow-status.log
grep -q 'DONE' /tmp/asdd-fullflow-status.log
cat /tmp/asdd-fullflow-status.log

echo "OK full-flow e2e test (LIVE=$LIVE)"
