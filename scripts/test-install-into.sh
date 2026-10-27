#!/usr/bin/env bash
# Smoke test for install-into.sh (no network).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/asdd-install-test.XXXXXX")"
# Nested junk file fixture: must never be copied into the target
DSSTORE_FIXTURE="$ROOT/.agents/skills/shape-up/.DS_Store"
touch "$DSSTORE_FIXTURE"
trap 'rm -rf "$TMP" "${RTMP:-}" "${MTMP:-}"; rm -f "$DSSTORE_FIXTURE"' EXIT

mkdir -p "$TMP/existing-app"
echo '# my product' >"$TMP/existing-app/README.md"
# Pretend project already has a filled binding that must be kept
mkdir -p "$TMP/existing-app/.harness/steering"
echo '# KEEP ME' >"$TMP/existing-app/.harness/steering/product.md"
# Simulate an upgrade from a kit that still shipped Scrum-era files
mkdir -p "$TMP/existing-app/.agents/skills/product-delivery/agents" "$TMP/existing-app/.agents/skills/user-story-decomposition"
echo '# Sprint Planning Agent' >"$TMP/existing-app/.agents/skills/product-delivery/agents/sprint-planning.md"
echo '---' >"$TMP/existing-app/.agents/skills/user-story-decomposition/SKILL.md"
mkdir -p "$TMP/existing-app/scripts" && echo '// old kit copy' >"$TMP/existing-app/scripts/migrate-v2-v3.mjs"

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
"$ROOT/scripts/install-into.sh" "$TMP/existing-app" --modules=http-api --runtime=cursor,opencode,kimi,junie,devin,kiro --skip-deps

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
test -f "$TMP/existing-app/.agents/skills/product-delivery/contracts/scope-map.schema.yaml"
test -f "$TMP/existing-app/.agents/skills/product-delivery/examples/end-to-end-example.md"
# Retired Scrum-era kit files are removed on upgrade
test ! -e "$TMP/existing-app/.agents/skills/product-delivery/agents"
test ! -e "$TMP/existing-app/.agents/skills/user-story-decomposition"
test ! -e "$TMP/existing-app/.agents/skills/capability-prioritization"

# project.json derives name from directory
grep -q '"project_id": "existing-app"' "$TMP/existing-app/.harness/config/project.json"
# harness/kit version tracks package.json, never a hardcoded value
KIT_VER="$(node -e "process.stdout.write(require('$ROOT/package.json').version)")"
grep -q "\"harness_version\": \"$KIT_VER\"" "$TMP/existing-app/.harness/config/project.json"
grep -q "\"version\": \"$KIT_VER\"" "$TMP/existing-app/.harness/config/project.json"
# Jev is skill-scoped in scaffolded project config (key via env only)
grep -q '"jev"' "$TMP/existing-app/.harness/config/project.json"
node -e 'const j=require(process.argv[1]).capabilities.jev; if (j.required !== false || String(j.required_by) !== "shape-up,product-delivery") process.exit(1)' "$TMP/existing-app/.harness/config/project.json"
grep -q '"apiKey": ""' "$TMP/existing-app/.harness/config/project.json"
test -f "$TMP/existing-app/.harness/scripts/jev-client.mjs"
test -f "$TMP/existing-app/.harness/scripts/jev-gates.mjs"
test -f "$TMP/existing-app/.harness/scripts/jev-command-gate.mjs"
test -f "$TMP/existing-app/.agents/mcp/jev-gate-server.mjs"
test -f "$TMP/existing-app/.harness/steering/jev.md"
# Knowledge index (vector/graph-lite projection of specs + state)
test -f "$TMP/existing-app/.harness/scripts/knowledge-lib.mjs"
test -f "$TMP/existing-app/.harness/scripts/knowledge-store.mjs"
test -f "$TMP/existing-app/.harness/scripts/knowledge-store-sqlite.mjs"
test ! -e "$TMP/existing-app/.harness/scripts/knowledge-store-kuzu.mjs"
test -f "$TMP/existing-app/.harness/scripts/sync-knowledge.mjs"
test -f "$TMP/existing-app/.agents/mcp/knowledge-server.mjs"
grep -q '"knowledge"' "$TMP/existing-app/.agents/mcp/mcp.json"
# Spec drift sensor + spec-drift-auditor MCP server (REQ-029)
test -f "$TMP/existing-app/.harness/scripts/drift-lib.mjs"
test -f "$TMP/existing-app/.harness/scripts/audit-lib.mjs"
test -f "$TMP/existing-app/.agents/mcp/spec-drift-auditor.mjs"
test -f "$TMP/existing-app/.agents/mcp/ui/drift-dashboard.html"
test ! -e "$TMP/existing-app/tools"
grep -q '"spec-drift-auditor"' "$TMP/existing-app/.agents/mcp/mcp.json"
test -f "$TMP/existing-app/.harness/scripts/audit-codebase.mjs"
test -f "$TMP/existing-app/.harness/scripts/audit-triage.mjs"
test -f "$TMP/existing-app/.harness/audits/README.md"
test -f "$TMP/existing-app/.harness/examples/CODEOWNERS.harness.example"
test -f "$TMP/existing-app/.harness/examples/harness-audit.yml.example"
test -f "$TMP/existing-app/.agents/skills/codebase-audit/SKILL.md"
(cd "$TMP/existing-app" && node .harness/scripts/audit-codebase.mjs --no-write >/dev/null)
(cd "$TMP/existing-app" && printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node .agents/mcp/spec-drift-auditor.mjs 2>/dev/null) | grep -q '"audit_diff"'
# kit-owned (refresh) files are recorded so spec drift exempts them; project-owned seeds are not
node -e '
  const m = require(process.argv[1]).managed_files || [];
  for (const f of [".harness/scripts/drift-lib.mjs", "scripts/install-into.sh", ".cursor/rules/asdd-steering.mdc", ".cursor/agents/asdd-discovery-agent.md", ".agents/mcp/mcp.json", ".harness/config/project.json", "opencode.json", ".harness/package.json", ".harness/scripts/knowledge-store-kuzu.mjs"])
    if (!m.includes(f)) throw new Error(`managed_files misses ${f}`);
  for (const f of ["AGENTS.md", ".harness/steering/product.md", "README.md"])
    if (m.includes(f)) throw new Error(`managed_files wrongly lists ${f}`);
  const s = require(process.argv[1]).seeded_files || {};
  if (!/^[0-9a-f]{64}$/.test(s["docs/dissent-log.md"] || "")) throw new Error("seeded_files misses docs/dissent-log.md");
  if ("README.md" in s) throw new Error("seeded_files wrongly lists the project README.md");
' "$TMP/existing-app/.harness/config/installed-versions.json"
# Isolated knowledge deps manifest (installed via .harness/package.json)
! grep -q '"kuzu"' "$TMP/existing-app/.harness/package.json"
grep -q '"sqlite-vec"' "$TMP/existing-app/.harness/package.json"
grep -qxF '.harness/node_modules' "$TMP/existing-app/.gitignore"
grep -qxF '.harness/knowledge' "$TMP/existing-app/.gitignore"

# Shape Up -> Product Delivery integration contract.
grep -q '^name: shape-up$' "$TMP/existing-app/.agents/skills/shape-up/SKILL.md"
grep -q '^name: product-delivery$' "$TMP/existing-app/.agents/skills/product-delivery/SKILL.md"
grep -q 'references/conversions.md' "$TMP/existing-app/.agents/skills/product-delivery/SKILL.md"
grep -q 'bundle_type: shape_up_pitch_bundle' "$TMP/existing-app/.agents/skills/shape-up/references/conversions.md"
grep -q 'source_pitch_id:' "$TMP/existing-app/.agents/skills/shape-up/references/conversions.md"
grep -q 'const: scope_map' "$TMP/existing-app/.agents/skills/product-delivery/contracts/scope-map.schema.yaml"
grep -q 'jev_scope_choice' "$TMP/existing-app/.agents/skills/product-delivery/SKILL.md"
if rg -n 'sprint-plan|user-story|Sprint Plan|EPIC-[0-9]|US-[0-9]|jev_slice_choice' \
  "$TMP/existing-app/.agents/skills/shape-up" \
  "$TMP/existing-app/.agents/skills/product-delivery" \
  "$TMP/existing-app/.agents/skills/external-trackers" \
  "$TMP/existing-app/.harness/steering/templates/intent.md"; then
  echo "Scrum artifact found in the Shape Up workflow" >&2
  exit 1
fi

if rg -n 'shape-up-pitch|ai-product-delivery' \
  "$TMP/existing-app/.agents/skills/shape-up" \
  "$TMP/existing-app/.agents/skills/product-delivery"; then
  echo "stale skill name found in Shape Up/Product Delivery integration" >&2
  exit 1
fi
test -L "$TMP/existing-app/.cursor/skills"
test -f "$TMP/existing-app/.harness/scripts/check-invariants.mjs"
test -f "$TMP/existing-app/.harness/scripts/escalate-slice.mjs"
test -f "$TMP/existing-app/.harness/scripts/validators/lite-escalation.mjs"
test -f "$TMP/existing-app/.harness/scripts/check-skills-index.mjs"
test -f "$TMP/existing-app/.harness/steering/controls.md"
grep -q 'Precedence' "$TMP/existing-app/.harness/steering/controls.md"
grep -q 'api-and-interface-design' "$TMP/existing-app/.harness/steering/skills.md"
grep -q 'skills-index:start' "$TMP/existing-app/.harness/steering/skills.md"
test -f "$TMP/existing-app/.harness/scripts/verify-on-stop.mjs"
test -f "$TMP/existing-app/.cursor/hooks.json"
grep -q 'verify-on-stop.mjs' "$TMP/existing-app/.cursor/hooks.json"
grep -q 'jev-command-gate.mjs' "$TMP/existing-app/.cursor/hooks.json"
grep -q 'beforeShellExecution' "$TMP/existing-app/.cursor/hooks.json"
grep -q '"failClosed": true' "$TMP/existing-app/.cursor/hooks.json"
# command gate speaks the Cursor beforeShellExecution contract
(cd "$TMP/existing-app" && echo '{"command":"git status"}' | env -u JEV_API_KEY node .harness/scripts/jev-command-gate.mjs) | grep -q '"permission": *"allow"'
(cd "$TMP/existing-app" && echo '{"command":"rm -rf /tmp/anything"}' | env -u JEV_API_KEY node .harness/scripts/jev-command-gate.mjs) | grep -q '"permission": *"deny"'
# command gate speaks the Claude Code PreToolUse contract
(cd "$TMP/existing-app" && echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git status"}}' | env -u JEV_API_KEY node .harness/scripts/jev-command-gate.mjs) | grep -q '"permissionDecision": *"allow"'
(cd "$TMP/existing-app" && echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"rm -rf /tmp/anything"}}' | env -u JEV_API_KEY node .harness/scripts/jev-command-gate.mjs) | grep -q '"permissionDecision": *"deny"'
test -f "$TMP/existing-app/.harness/scripts/check-project-config.mjs"
test -f "$TMP/existing-app/.harness/config/project.schema.json"
test ! -e "$TMP/existing-app/scripts/harness-migrate.mjs"
test ! -e "$TMP/existing-app/scripts/migrate-v2-v3.mjs"
# Pipeline, Jev, and drift docs were merged into the kit README (linked by URL)
test ! -e "$TMP/existing-app/docs/pipeline-documentation.md"
test ! -e "$TMP/existing-app/docs/jev-integration.md"
test ! -e "$TMP/existing-app/docs/architecture/spec-drift-and-audit.md"
node "$TMP/existing-app/.harness/scripts/check-project-config.mjs"
test ! -e "$TMP/existing-app/runtimes"
test ! -e "$TMP/existing-app/.agents/modules"
test ! -e "$TMP/existing-app/scripts/enable-module.sh"

# Kit-internal / dev-only files must never be installed, kit tests included
if find "$TMP/existing-app/.harness" "$TMP/existing-app/.agents" -path '*/node_modules' -prune -o \( -name '*.test.*' -o -name '*.spec.*' \) -print | grep .; then
  echo "kit test files were installed (listed above)" >&2
  exit 1
fi
test ! -e "$TMP/existing-app/scripts/generate-versions.mjs"
test ! -e "$TMP/existing-app/scripts/npx-install.cjs"
test ! -e "$TMP/existing-app/scripts/test-install-into.sh"
test ! -e "$TMP/existing-app/scripts/test-lifecycle.sh"
test ! -e "$TMP/existing-app/scripts/test-full-flow.sh"
test ! -e "$TMP/existing-app/package.json"
test ! -e "$TMP/existing-app/.npmignore"
test ! -e "$TMP/existing-app/.github"
test ! -e "$TMP/existing-app/.idea"
test ! -e "$TMP/existing-app/LICENSE"
test ! -e "$TMP/existing-app/.harness/state/registry.json"
test ! -e "$TMP/existing-app/.harness/progress/agent-audit-2026-10-01.md"
test -z "$(find "$TMP/existing-app" \( -name '.DS_Store' -o -name '._*' \) -print -quit)"
# target's own files are never clobbered
grep -q 'my product' "$TMP/existing-app/README.md"
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
"$ROOT/scripts/install-into.sh" "$TMP/existing-app" --runtime=cursor --skip-deps >/dev/null
grep -q 'echo keep-me' "$TMP/existing-app/.cursor/hooks.json"
grep -q 'verify-on-stop.mjs' "$TMP/existing-app/.cursor/hooks.json"
grep -q 'jev-command-gate.mjs' "$TMP/existing-app/.cursor/hooks.json"

# existing mcp.json gains spec-drift-auditor without dropping other servers
printf '%s\n' '{"mcpServers":{"mine":{"type":"stdio","command":"echo"}}}' >"$TMP/existing-app/.agents/mcp/mcp.json"
"$ROOT/scripts/install-into.sh" "$TMP/existing-app" --skip-deps >/dev/null
grep -q '"mine"' "$TMP/existing-app/.agents/mcp/mcp.json"
grep -q '"spec-drift-auditor"' "$TMP/existing-app/.agents/mcp/mcp.json"

# second run keeps binding, does not require --force for create-only, stays hook-idempotent
"$ROOT/scripts/install-into.sh" "$TMP/existing-app" --skip-deps >/dev/null
grep -q 'KEEP ME' "$TMP/existing-app/.harness/steering/product.md"
GATE_COUNT="$(node -e "const h=JSON.parse(require('fs').readFileSync('$TMP/existing-app/.cursor/hooks.json','utf8')); process.stdout.write(String((h.hooks.beforeShellExecution||[]).filter((e)=>String(e?.command??'').includes('jev-command-gate')).length))")"
[[ "$GATE_COUNT" == "1" ]]

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

for rt in cursor claude opencode kimi junie devin kiro; do
  echo "== runtime $rt =="
  mkdir -p "$RTMP/$rt-app"
  "$ROOT/scripts/install-into.sh" "$RTMP/$rt-app" --runtime="$rt" --no-interactive --skip-deps >/dev/null 2>&1
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
      test -f "$RTMP/$rt-app/.claude/settings.json"
      grep -q 'jev-command-gate.mjs' "$RTMP/$rt-app/.claude/settings.json"
      grep -q 'verify-on-stop.mjs' "$RTMP/$rt-app/.claude/settings.json"
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

for mod in bruno playwright-e2e web-ui http-api; do
  echo "== module $mod =="
  mkdir -p "$MTMP/$mod-app"
  "$ROOT/scripts/install-into.sh" "$MTMP/$mod-app" --modules="$mod" --no-interactive --skip-deps >/dev/null 2>&1
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
      # spec compliance adapter for the spec-drift-auditor server (REQ-029)
      test -f "$MTMP/$mod-app/.agents/mcp/adapters/openapi.mjs"
      test ! -e "$MTMP/$mod-app/.agents/mcp/adapters/openapi.test.mjs"
      ;;
  esac
  echo "  OK"
done

# all modules together
echo "== module all =="
mkdir -p "$MTMP/all-app"
"$ROOT/scripts/install-into.sh" "$MTMP/all-app" --modules=all --no-interactive --skip-deps >/dev/null 2>&1
test -f "$MTMP/all-app/.agents/agents/asdd-integration-tester.md"
test -f "$MTMP/all-app/.agents/agents/asdd-e2e-tester.md"
test -d "$MTMP/all-app/.agents/skills/frontend-ui-engineering"
test -d "$MTMP/all-app/.agents/skills/api-and-interface-design"
echo "  OK"

echo "== versions: one project version; every refreshed file has an entry =="
VTMP="$(mktemp -d "${TMPDIR:-/tmp}/asdd-versions-test.XXXXXX")"
mkdir -p "$VTMP/app"
HARNESS_TRACE_REFRESH="$VTMP/refresh.log" "$ROOT/scripts/install-into.sh" "$VTMP/app" \
  --runtime=cursor,claude,opencode,kimi,junie,devin,kiro --modules=all --no-interactive --skip-deps >/dev/null
node -e '
  const fs = require("fs");
  const [pkgPath, versionsPath, tracePath] = process.argv.slice(1);
  const version = require(pkgPath).version;
  const v = require(versionsPath);
  if (v.kit_version !== version) throw new Error(`kit_version ${v.kit_version} != package.json ${version}`);
  const off = Object.entries(v.artifacts).filter(([, ver]) => ver !== version).map(([f]) => f);
  if (off.length) throw new Error(`artifacts not at ${version} (run: node scripts/generate-versions.mjs): ${off.join(", ")}`);
  const traced = [...new Set(fs.readFileSync(tracePath, "utf8").split("\n").filter(Boolean))];
  const missing = traced.filter((f) => !(f in v.artifacts));
  if (missing.length) throw new Error(`refreshed but never versioned (add to generate-versions.mjs): ${missing.join(", ")}`);
' "$ROOT/package.json" "$ROOT/.harness/config/versions.json" "$VTMP/refresh.log"
rm -rf "$VTMP"

echo "OK install-into smoke test"
