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

echo "== help contains new flags =="
"$ROOT/scripts/install-into.sh" --help | grep -q -- '--interactive'
"$ROOT/scripts/install-into.sh" --help | grep -q -- '--no-interactive'

echo "== --no-interactive without target fails =="
if "$ROOT/scripts/install-into.sh" --no-interactive 2>/dev/null; then
  echo "expected failure for --no-interactive without target" >&2
  exit 1
fi

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

# project.json derives name from directory
grep -q '"project_id": "existing-app"' "$TMP/existing-app/.harness/config/project.json"

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

# ------------------------------------------------------------------
# Per-runtime MCP validation
# ------------------------------------------------------------------
validate_runtime_mcp() {
  local target="$1" runtime="$2" mcp_path="$3"
  echo "== runtime $runtime MCP =="
  if [[ -e "$target/$mcp_path" ]]; then
    node -e "JSON.parse(require('fs').readFileSync('$target/$mcp_path', 'utf8'))" || {
      echo "invalid MCP JSON for $runtime at $mcp_path" >&2
      exit 1
    }
    echo "  MCP OK"
  else
    echo "  no MCP config"
  fi
}

RTMP="$(mktemp -d "${TMPDIR:-/tmp}/asdd-rt-test.XXXXXX")"
trap 'rm -rf "$RTMP"' EXIT

for rt in cursor claude opencode kimi junie devin kiro; do
  echo "== runtime $rt =="
  mkdir -p "$RTMP/$rt-app"
  "$ROOT/scripts/install-into.sh" "$RTMP/$rt-app" --runtime="$rt" --no-interactive >/dev/null 2>&1
  case "$rt" in
    cursor)
      test -L "$RTMP/$rt-app/.cursor/skills"
      test -L "$RTMP/$rt-app/.cursor/mcp.json"
      validate_runtime_mcp "$RTMP/$rt-app" "$rt" ".cursor/mcp.json"
      ;;
    claude)
      test -L "$RTMP/$rt-app/.claude/skills"
      test -L "$RTMP/$rt-app/.mcp.json"
      validate_runtime_mcp "$RTMP/$rt-app" "$rt" ".mcp.json"
      test -f "$RTMP/$rt-app/CLAUDE.md"
      ;;
    opencode)
      test -L "$RTMP/$rt-app/.opencode/skills"
      test -f "$RTMP/$rt-app/opencode.json"
      node -e "const o=JSON.parse(require('fs').readFileSync('$RTMP/$rt-app/opencode.json','utf8')); if(!o.mcp||!o.mcp.servers) throw new Error('missing mcp.servers')" || {
        echo "OpenCode opencode.json missing embedded MCP" >&2; exit 1
      }
      echo "  MCP OK (embedded in opencode.json)"
      ;;
    kimi)
      test -L "$RTMP/$rt-app/.kimi-code/skills"
      test -L "$RTMP/$rt-app/.kimi-code/mcp.json"
      validate_runtime_mcp "$RTMP/$rt-app" "$rt" ".kimi-code/mcp.json"
      ;;
    junie)
      test -L "$RTMP/$rt-app/.junie/skills"
      test -L "$RTMP/$rt-app/.junie/mcp/mcp.json"
      validate_runtime_mcp "$RTMP/$rt-app" "$rt" ".junie/mcp/mcp.json"
      ;;
    devin)
      test -L "$RTMP/$rt-app/.devin/skills"
      test -L "$RTMP/$rt-app/.devin/mcp_config.json"
      validate_runtime_mcp "$RTMP/$rt-app" "$rt" ".devin/mcp_config.json"
      ;;
    kiro)
      test -L "$RTMP/$rt-app/.kiro/skills"
      test -L "$RTMP/$rt-app/.kiro/settings/mcp.json"
      validate_runtime_mcp "$RTMP/$rt-app" "$rt" ".kiro/settings/mcp.json"
      ;;
  esac
done

# ------------------------------------------------------------------
# Per-module validation
# ------------------------------------------------------------------
MTMP="$(mktemp -d "${TMPDIR:-/tmp}/asdd-mod-test.XXXXXX")"
trap 'rm -rf "$MTMP"' EXIT

for mod in bruno playwright-e2e web-ui http-api; do
  echo "== module $mod =="
  mkdir -p "$MTMP/$mod-app"
  "$ROOT/scripts/install-into.sh" "$MTMP/$mod-app" --modules="$mod" --no-interactive >/dev/null 2>&1
  case "$mod" in
    bruno)
      test -f "$MTMP/$mod-app/.agents/agents/asdd-integration-tester.md"
      ;;
    playwright-e2e)
      test -f "$MTMP/$mod-app/.agents/agents/asdd-e2e-tester.md"
      ;;
    web-ui)
      test -d "$MTMP/$mod-app/.agents/skills/frontend-ui-engineering"
      ;;
    http-api)
      test -d "$MTMP/$mod-app/.agents/skills/api-and-interface-design"
      ;;
  esac
  echo "  OK"
done

# all modules together
echo "== module all =="
mkdir -p "$MTMP/all-app"
"$ROOT/scripts/install-into.sh" "$MTMP/all-app" --modules=all --no-interactive >/dev/null 2>&1
test -f "$MTMP/all-app/.agents/agents/asdd-integration-tester.md"
test -f "$MTMP/all-app/.agents/agents/asdd-e2e-tester.md"
test -d "$MTMP/all-app/.agents/skills/frontend-ui-engineering"
test -d "$MTMP/all-app/.agents/skills/api-and-interface-design"
echo "  OK"

echo "OK install-into smoke test"
