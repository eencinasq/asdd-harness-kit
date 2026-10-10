#!/usr/bin/env bash
# Lifecycle e2e: install → init-slice → sessions → sync-state → invariants,
# including negative tests proving validators actually FAIL on bad state.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/asdd-lifecycle-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

APP="$TMP/demo-app"
mkdir -p "$APP"
"$ROOT/scripts/install-into.sh" "$APP" --runtime=cursor,claude --no-interactive >/dev/null
cd "$APP"

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

expect_fail() {
  local label="$1"
  if env -u JEV_API_KEY node .harness/scripts/check-invariants.mjs >/tmp/asdd-lifecycle-neg.log 2>&1; then
    echo "expected check-invariants to FAIL for: $label" >&2
    exit 1
  fi
  echo "  FAIL (expected): $label"
}

echo "== init slice =="
node .harness/scripts/init-slice.mjs demo-slice >/dev/null
test -f .harness/state/slices/demo-slice/sessions/001-initial.json
test -f .harness/state/slices/demo-slice/manifest.json
test -f .harness/features/demo-slice.features.json
test -f .harness/specs/demo-slice/tasks.md
grep -q '"slice_id": "demo-slice"' .harness/state/manifest.json
grep -q '| demo-slice |' .harness/PROGRESS.md

echo "== lite-first: default mode is lite, --full opts in =="
grep -q '"mode": "lite"' .harness/state/slices/demo-slice/manifest.json
grep -q '"escalation_required": false' .harness/state/slices/demo-slice/manifest.json
node .harness/scripts/init-slice.mjs platform-slice --full >/dev/null
node .harness/scripts/sync-state.mjs --slice platform-slice >/dev/null
grep -q '"mode": "full"' .harness/state/slices/platform-slice/manifest.json
# partial sync must merge into the registry, not clobber it
grep -q '"slice_id": "demo-slice"' .harness/state/registry.json
grep -q '"slice_id": "platform-slice"' .harness/state/registry.json

echo "== feature session → sync-state derivations =="
cat >.harness/features/demo-slice.features.json <<'JSON'
{
  "schema_version": "1.0",
  "slice_id": "demo-slice",
  "source_tasks": ".harness/specs/demo-slice/tasks.md",
  "features": [
    {
      "id": "f1",
      "title": "Demo feature",
      "user_visible_behavior": "User sees the demo working",
      "status": "in_progress",
      "priority": 1,
      "owner": "test-agent",
      "verification": ["npm test"],
      "evidence": "",
      "scope_paths": ["src/api"]
    }
  ]
}
JSON
cat >.harness/state/slices/demo-slice/sessions/002-feature.json <<JSON
{
  "schema_version": "1.0",
  "session_id": "sess-demo-002",
  "timestamp": "$(now)",
  "agent": "test-agent",
  "human": "squad",
  "slice_id": "demo-slice",
  "event_type": "feature_started",
  "phase": "implementation",
  "feature_id": "f1",
  "evidence": "Started f1",
  "scope_paths": ["src/api"]
}
JSON
node .harness/scripts/sync-state.mjs >/dev/null
grep -q '"slice_id": "demo-slice"' .harness/state/registry.json
grep -q '"phase": "implementation"' .harness/state/slices/demo-slice/manifest.json
grep -q '"feature_id": "f1"' .harness/state/slices/demo-slice/manifest.json

echo "== invariants pass on valid state =="
env -u JEV_API_KEY node .harness/scripts/check-invariants.mjs >/tmp/asdd-lifecycle-pos.log 2>&1
grep -q 'PASS' /tmp/asdd-lifecycle-pos.log
# verify-on-stop is silent ({}) when invariants pass (live Jev via dummy key)
printf '{"status":"completed","loop_count":0}' | JEV_API_KEY=dummy-test-key node .harness/scripts/verify-on-stop.mjs | grep -qx '{}'
# Claude Code Stop protocol: pass → {}; stop_hook_active always releases the session
printf '{"hook_event_name":"Stop","stop_hook_active":false}' | JEV_API_KEY=dummy-test-key node .harness/scripts/verify-on-stop.mjs | grep -qx '{}'
printf '{"hook_event_name":"Stop","stop_hook_active":true}' | env -u JEV_API_KEY node .harness/scripts/verify-on-stop.mjs | grep -qx '{}'
# verify-on-stop without a key is a FAIL, not a silent pass (Jev is required)
MISSING_KEY_OUT="$(printf '{"status":"completed","loop_count":0}' | env -u JEV_API_KEY node .harness/scripts/verify-on-stop.mjs)"
grep -q 'followup_message' <<<"$MISSING_KEY_OUT"
grep -q 'JEV_API_KEY' <<<"$MISSING_KEY_OUT"

cp .harness/features/demo-slice.features.json /tmp/asdd-lifecycle-features.bak

echo "== negative: overlapping concurrent scopes =="
node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs';
const p = '.harness/features/demo-slice.features.json';
const doc = JSON.parse(readFileSync(p, 'utf8'));
doc.features.push({
  id: 'f2', title: 'Conflicting feature', user_visible_behavior: 'x', status: 'in_progress',
  priority: 2, owner: 'other-agent', verification: ['x'], evidence: '', scope_paths: ['src/api/v2'],
});
writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
EOF
expect_fail "overlapping concurrent scopes"
grep -q 'overlapping scopes' /tmp/asdd-lifecycle-neg.log
cp /tmp/asdd-lifecycle-features.bak .harness/features/demo-slice.features.json

echo "== negative: concurrent features share owner =="
node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs';
const p = '.harness/features/demo-slice.features.json';
const doc = JSON.parse(readFileSync(p, 'utf8'));
doc.features.push({
  id: 'f2', title: 'Same-owner feature', user_visible_behavior: 'x', status: 'in_progress',
  priority: 2, owner: 'test-agent', verification: ['x'], evidence: '', scope_paths: ['src/web'],
});
writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
EOF
expect_fail "shared concurrent owner"
grep -q 'share owner' /tmp/asdd-lifecycle-neg.log
cp /tmp/asdd-lifecycle-features.bak .harness/features/demo-slice.features.json

echo "== negative: passing without evidence =="
node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs';
const p = '.harness/features/demo-slice.features.json';
const doc = JSON.parse(readFileSync(p, 'utf8'));
doc.features[0].status = 'passing';
doc.features[0].evidence = '';
writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
EOF
expect_fail "passing without evidence"
grep -q 'passing without evidence' /tmp/asdd-lifecycle-neg.log

echo "== negative: verify-on-stop injects the failure back into the session =="
OUT="$(printf '{"status":"completed","loop_count":0}' | JEV_API_KEY=dummy-test-key node .harness/scripts/verify-on-stop.mjs)"
grep -q 'followup_message' <<<"$OUT"
grep -q 'passing without evidence' <<<"$OUT"
BLOCK_OUT="$(printf '{"hook_event_name":"Stop","stop_hook_active":false}' | JEV_API_KEY=dummy-test-key node .harness/scripts/verify-on-stop.mjs)"
grep -q '"decision":"block"' <<<"$BLOCK_OUT"
grep -q 'passing without evidence' <<<"$BLOCK_OUT"
cp /tmp/asdd-lifecycle-features.bak .harness/features/demo-slice.features.json

echo "== negative: invalid session event_type =="
cat >.harness/state/slices/demo-slice/sessions/003-bad.json <<JSON
{
  "session_id": "sess-demo-003",
  "timestamp": "$(now)",
  "agent": "test-agent",
  "slice_id": "demo-slice",
  "event_type": "exploded"
}
JSON
expect_fail "invalid session event_type"
grep -q 'invalid event_type' /tmp/asdd-lifecycle-neg.log
rm .harness/state/slices/demo-slice/sessions/003-bad.json

echo "== negative: orphan slice not in global manifest =="
mkdir -p .harness/state/slices/ghost/sessions
cat >.harness/state/slices/ghost/sessions/001.json <<JSON
{
  "session_id": "sess-ghost-001",
  "timestamp": "$(now)",
  "agent": "test-agent",
  "slice_id": "ghost",
  "event_type": "phase_started",
  "phase": "discovery"
}
JSON
expect_fail "orphan slice"
grep -q 'orphan slice' /tmp/asdd-lifecycle-neg.log
rm -rf .harness/state/slices/ghost

echo "== negative: malformed features JSON =="
echo 'not json' >.harness/features/demo-slice.features.json
expect_fail "malformed features JSON"
grep -q 'invalid JSON' /tmp/asdd-lifecycle-neg.log
cp /tmp/asdd-lifecycle-features.bak .harness/features/demo-slice.features.json

echo "== recovered state is valid again =="
env -u JEV_API_KEY node .harness/scripts/check-invariants.mjs >/dev/null

echo "== lite-first: E1/E3/E4 signals warn while in progress =="
node .harness/scripts/init-slice.mjs grow-slice >/dev/null
cat >.harness/features/grow-slice.features.json <<'JSON'
{
  "schema_version": "1.0",
  "slice_id": "grow-slice",
  "source_tasks": ".harness/specs/grow-slice/tasks.md",
  "features": [
    {
      "id": "g1",
      "title": "Backend piece",
      "user_visible_behavior": "API works",
      "status": "passing",
      "priority": 1,
      "owner": "test-agent",
      "verification": ["x"],
      "evidence": "done",
      "scope_paths": ["src/api"]
    },
    {
      "id": "g2",
      "title": "Frontend piece",
      "user_visible_behavior": "UI shows it",
      "status": "passing",
      "priority": 2,
      "owner": "test-agent",
      "verification": ["x"],
      "evidence": "done",
      "scope_paths": ["web/ui"]
    }
  ]
}
JSON
cat >.harness/state/slices/grow-slice/sessions/002-g1.json <<JSON
{ "session_id": "sess-grow-002", "timestamp": "$(now)", "agent": "test-agent", "slice_id": "grow-slice", "event_type": "feature_started", "phase": "implementation", "feature_id": "g1", "scope_paths": ["src/api"] }
JSON
cat >.harness/state/slices/grow-slice/sessions/003-g1-done.json <<JSON
{ "session_id": "sess-grow-003", "timestamp": "$(now)", "agent": "test-agent", "slice_id": "grow-slice", "event_type": "feature_completed", "feature_id": "g1", "evidence": "done" }
JSON
cat >.harness/state/slices/grow-slice/sessions/004-g2.json <<JSON
{ "session_id": "sess-grow-004", "timestamp": "$(now)", "agent": "test-agent", "slice_id": "grow-slice", "event_type": "feature_started", "phase": "implementation", "feature_id": "g2", "scope_paths": ["web/ui"] }
JSON
cat >.harness/state/slices/grow-slice/sessions/005-g2-done.json <<JSON
{ "session_id": "sess-grow-005", "timestamp": "$(now)", "agent": "test-agent", "slice_id": "grow-slice", "event_type": "feature_completed", "feature_id": "g2", "evidence": "done" }
JSON
cat >.harness/state/slices/grow-slice/sessions/006-dissent.json <<JSON
{ "session_id": "sess-grow-006", "timestamp": "$(now)", "agent": "test-agent", "slice_id": "grow-slice", "event_type": "dissent", "phase": "implementation", "note": "schema choice disputed" }
JSON
cat >.harness/state/slices/grow-slice/sessions/007-terms.json <<JSON
{ "session_id": "sess-grow-007", "timestamp": "$(now)", "agent": "test-agent", "slice_id": "grow-slice", "event_type": "checkpoint", "new_domain_terms": ["Order", "Cart"] }
JSON
node .harness/scripts/sync-state.mjs --slice grow-slice >/dev/null
grep -q '"escalation_required": true' .harness/state/slices/grow-slice/manifest.json
grep -q 'E1-scope-spread' .harness/state/slices/grow-slice/manifest.json
grep -q 'E3-domain-growth' .harness/state/slices/grow-slice/manifest.json
grep -q 'E4-dissent' .harness/state/slices/grow-slice/manifest.json
env -u JEV_API_KEY node .harness/scripts/check-invariants.mjs >/tmp/asdd-lifecycle-warn.log 2>&1
grep -q 'escalation signal E1-scope-spread' /tmp/asdd-lifecycle-warn.log
grep -q 'escalation signal E4-dissent' /tmp/asdd-lifecycle-warn.log
node .harness/scripts/harness-status.mjs | grep -q 'E1-scope-spread'

echo "== lite-first: DONE is blocked while signals are open =="
cat >.harness/state/slices/grow-slice/sessions/008-knowledge.json <<JSON
{ "session_id": "sess-grow-008", "timestamp": "$(now)", "agent": "test-agent", "slice_id": "grow-slice", "event_type": "phase_completed", "phase": "knowledge", "evidence": "attempted close" }
JSON
node .harness/scripts/sync-state.mjs --slice grow-slice >/dev/null
grep -q '"status": "in_progress"' .harness/state/slices/grow-slice/manifest.json
if grep -q '"status": "DONE"' .harness/state/slices/grow-slice/manifest.json; then
  echo "lite slice reached DONE with open escalation signals" >&2
  exit 1
fi
env -u JEV_API_KEY node .harness/scripts/check-invariants.mjs >/tmp/asdd-lifecycle-esc.log 2>&1 && {
  echo "expected check-invariants to FAIL for: lite close with open escalation signals" >&2
  exit 1
}
grep -q 'cannot complete with open escalation signals' /tmp/asdd-lifecycle-esc.log
echo "  FAIL (expected): lite close blocked"

echo "== lite-first: escalate-slice resolves the block =="
node .harness/scripts/escalate-slice.mjs grow-slice --reasons "E1-scope-spread,E4-dissent" --by test-agent >/dev/null
grep -q '"mode": "escalated"' .harness/state/slices/grow-slice/manifest.json
grep -q '"status": "DONE"' .harness/state/slices/grow-slice/manifest.json
if node .harness/scripts/escalate-slice.mjs grow-slice --reasons "again" >/dev/null 2>&1; then
  echo "expected escalate-slice to refuse a second escalation" >&2
  exit 1
fi
echo "  FAIL (expected): second escalation refused"
env -u JEV_API_KEY node .harness/scripts/check-invariants.mjs >/dev/null

echo "== lite-first: E2 — lite slices are serial (hard fail) =="
node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs';
const p = '.harness/features/demo-slice.features.json';
const doc = JSON.parse(readFileSync(p, 'utf8'));
doc.features.push({
  id: 'f2', title: 'Parallel attempt', user_visible_behavior: 'x', status: 'in_progress',
  priority: 2, owner: 'other-agent', verification: ['x'], evidence: '', scope_paths: ['src/web'],
});
writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
EOF
expect_fail "lite serial violation"
grep -q 'allows at most one in_progress' /tmp/asdd-lifecycle-neg.log
cp /tmp/asdd-lifecycle-features.bak .harness/features/demo-slice.features.json
env -u JEV_API_KEY node .harness/scripts/check-invariants.mjs >/dev/null

echo "OK lifecycle e2e test"
