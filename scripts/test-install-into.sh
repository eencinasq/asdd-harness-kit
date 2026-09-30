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
"$ROOT/scripts/install-into.sh" "$TMP/existing-app" --modules=http-api --runtime=cursor,opencode,kimi,junie,devin,kiro

# binding preserved
grep -q 'KEEP ME' "$TMP/existing-app/.harness/steering/product.md"
# core present
test -f "$TMP/existing-app/.agents/agents/asdd-discovery-agent.md"
test -f "$TMP/existing-app/.agents/skills/api-and-interface-design/SKILL.md"
test -L "$TMP/existing-app/.cursor/skills"
test -f "$TMP/existing-app/.harness/scripts/check-invariants.mjs"
test -f "$TMP/existing-app/.harness/scripts/check-project-config.mjs"
test -f "$TMP/existing-app/.harness/config/project.schema.json"
test -f "$TMP/existing-app/scripts/harness-migrate.mjs"
node "$TMP/existing-app/.harness/scripts/check-project-config.mjs"
test -L "$TMP/existing-app/.opencode/skills"
test -L "$TMP/existing-app/.opencode/agents/asdd-discovery-agent.md"
test -f "$TMP/existing-app/opencode.json"
test -L "$TMP/existing-app/.kimi-code/agents"
test -L "$TMP/existing-app/.kimi-code/skills"
test -L "$TMP/existing-app/.kimi-code/mcp.json"
test -L "$TMP/existing-app/.junie/skills"
test -L "$TMP/existing-app/.junie/agents/asdd-discovery-agent.md"
test -L "$TMP/existing-app/.junie/mcp/mcp.json"
test -L "$TMP/existing-app/.devin/skills"
test -L "$TMP/existing-app/.devin/agents/asdd-discovery-agent.md"
test -L "$TMP/existing-app/.devin/mcp_config.json"
test -L "$TMP/existing-app/.kiro/skills"
test -L "$TMP/existing-app/.kiro/agents/asdd-discovery-agent.md"
test -L "$TMP/existing-app/.kiro/settings/mcp.json"

# second run keeps binding, does not require --force for create-only
"$ROOT/scripts/install-into.sh" "$TMP/existing-app" >/dev/null
grep -q 'KEEP ME' "$TMP/existing-app/.harness/steering/product.md"

echo "OK install-into smoke test"
