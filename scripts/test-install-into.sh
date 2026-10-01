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
test -f "$TMP/existing-app/.agents/skills/shape-up/SKILL.md"
test -f "$TMP/existing-app/.agents/skills/shape-up/references/methodology.md"
test -f "$TMP/existing-app/.agents/skills/shape-up/references/conversions.md"
test -f "$TMP/existing-app/.agents/skills/product-delivery/references/shape-up-input.md"
test -f "$TMP/existing-app/.agents/skills/product-delivery/references/asdd-harness-handoff.md"
test -f "$TMP/existing-app/.agents/skills/product-delivery/references/technical-diagrams.md"
test -f "$TMP/existing-app/.agents/skills/product-delivery/contracts/delivery-map.schema.yaml"
test -f "$TMP/existing-app/docs/pipeline-documentation.md"

# Shape Up -> Product Delivery integration contract.
grep -q '^name: shape-up$' "$TMP/existing-app/.agents/skills/shape-up/SKILL.md"
grep -q '^name: product-delivery$' "$TMP/existing-app/.agents/skills/product-delivery/SKILL.md"
grep -q 'references/conversions.md' "$TMP/existing-app/.agents/skills/product-delivery/SKILL.md"
grep -q 'bundle_type: shape_up_pitch_bundle' "$TMP/existing-app/.agents/skills/shape-up/references/conversions.md"
grep -q 'source_pitch_id:' "$TMP/existing-app/.agents/skills/shape-up/references/conversions.md"
grep -q 'pitch_bundle' "$TMP/existing-app/.agents/skills/product-delivery/contracts/delivery-map.schema.yaml"

if rg -n 'shape-up-pitch|ai-product-delivery' \
  "$TMP/existing-app/.agents/skills/shape-up" \
  "$TMP/existing-app/.agents/skills/product-delivery"; then
  echo "stale skill name found in Shape Up/Product Delivery integration" >&2
  exit 1
fi
test -L "$TMP/existing-app/.cursor/skills"
test -f "$TMP/existing-app/.harness/scripts/check-invariants.mjs"
test -f "$TMP/existing-app/.harness/scripts/check-skills-index.mjs"
test -f "$TMP/existing-app/.harness/steering/controls.md"
grep -q 'Precedence' "$TMP/existing-app/.harness/steering/controls.md"
grep -q 'api-and-interface-design' "$TMP/existing-app/.harness/steering/skills.md"
grep -q 'skills-index:start' "$TMP/existing-app/.harness/steering/skills.md"
test -f "$TMP/existing-app/.harness/scripts/verify-on-stop.mjs"
test -f "$TMP/existing-app/.cursor/hooks.json"
grep -q 'verify-on-stop.mjs' "$TMP/existing-app/.cursor/hooks.json"
grep -q '"failClosed": true' "$TMP/existing-app/.cursor/hooks.json"
test -f "$TMP/existing-app/.harness/scripts/check-project-config.mjs"
test -f "$TMP/existing-app/.harness/config/project.schema.json"
test -f "$TMP/existing-app/scripts/harness-migrate.mjs"
test -f "$TMP/existing-app/docs/shape-up-asdd-harness-integration.md"
node "$TMP/existing-app/.harness/scripts/check-project-config.mjs"
test ! -e "$TMP/existing-app/runtimes"
test ! -e "$TMP/existing-app/.agents/modules"
test ! -e "$TMP/existing-app/scripts/enable-module.sh"
test -f "$TMP/existing-app/.agents/skills/api-and-interface-design/SKILL.md"
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

# existing hooks.json gains verify-on-stop without dropping other hooks
printf '%s\n' '{"version":1,"hooks":{"beforeShellExecution":[{"command":"echo keep-me"}]}}' >"$TMP/existing-app/.cursor/hooks.json"
"$ROOT/scripts/install-into.sh" "$TMP/existing-app" --runtime=cursor >/dev/null
grep -q 'echo keep-me' "$TMP/existing-app/.cursor/hooks.json"
grep -q 'verify-on-stop.mjs' "$TMP/existing-app/.cursor/hooks.json"

# second run keeps binding, does not require --force for create-only
"$ROOT/scripts/install-into.sh" "$TMP/existing-app" >/dev/null
grep -q 'KEEP ME' "$TMP/existing-app/.harness/steering/product.md"

echo "OK install-into smoke test"
