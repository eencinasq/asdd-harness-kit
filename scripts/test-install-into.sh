#!/usr/bin/env bash
# Smoke test for install-into.sh (no network).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/asdd-install-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/existing-app"
echo '# my product' >"$TMP/existing-app/README.md"
# Pretend project already has a filled binding that must be kept
mkdir -p "$TMP/existing-app/.harness/steering"
echo '# KEEP ME' >"$TMP/existing-app/.harness/steering/product.md"

echo "== dry-run =="
"$ROOT/scripts/install-into.sh" "$TMP/existing-app" --dry-run --modules=http-api --runtime=cursor >/tmp/asdd-install-dry.log
head -20 /tmp/asdd-install-dry.log

echo "== install =="
"$ROOT/scripts/install-into.sh" "$TMP/existing-app" --modules=http-api --runtime=cursor

# binding preserved
grep -q 'KEEP ME' "$TMP/existing-app/.harness/steering/product.md"
# core present
test -f "$TMP/existing-app/.agents/agents/asdd-discovery-agent.md"
test -f "$TMP/existing-app/.agents/skills/api-and-interface-design/SKILL.md"
test -L "$TMP/existing-app/.cursor/skills"
test -f "$TMP/existing-app/.harness/scripts/check-invariants.mjs"

# second run keeps binding, does not require --force for create-only
"$ROOT/scripts/install-into.sh" "$TMP/existing-app" >/dev/null
grep -q 'KEEP ME' "$TMP/existing-app/.harness/steering/product.md"

echo "OK install-into smoke test"
