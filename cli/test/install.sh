#!/usr/bin/env bash
# Smoke test for `asdd install` (no network).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
asdd() { node "$ROOT/cli/bin/asdd.mjs" "$@"; }
# Projects get no copy of the CLI: their hooks run the asdd package through a resolver (devDependency, else global).
export EXPECT_GATE="$(node --input-type=module -e "import { projectAsdd } from '$ROOT/cli/src/install/phases.mjs'; process.stdout.write(projectAsdd('gate'))")"
export EXPECT_VERIFY="$(node --input-type=module -e "import { projectAsdd } from '$ROOT/cli/src/install/phases.mjs'; process.stdout.write(projectAsdd('verify'))")"
# True when a hooks JSON file runs exactly this command somewhere.
hook_has() { node -e 'const f=(v)=>Array.isArray(v)?v.some(f):v&&typeof v==="object"?Object.values(v).some(f):v===process.argv[2]; process.exit(f(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")))?0:1)' "$1" "$2"; }
TMP="$(mktemp -d "${TMPDIR:-/tmp}/asdd-install-test.XXXXXX")"
# Nested junk file fixture: must never be copied into the target
DSSTORE_FIXTURE="$ROOT/cli/skills/shape-up/.DS_Store"
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
mkdir -p "$TMP/existing-app/.agents/skills/open-code-review" && printf -- '---\nname: open-code-review\n---\n' >"$TMP/existing-app/.agents/skills/open-code-review/SKILL.md"
mkdir -p "$TMP/existing-app/scripts" && echo '// old kit copy' >"$TMP/existing-app/scripts/migrate-v2-v3.mjs"
# A pre-CLI install kept the harness in .harness/scripts/: the kit's files go, a project's own script stays
mkdir -p "$TMP/existing-app/.harness/scripts/validators"
echo '// old kit copy' >"$TMP/existing-app/.harness/scripts/check-invariants.mjs"
echo '// old kit copy' >"$TMP/existing-app/.harness/scripts/validators/features.mjs"
echo '// old kit copy' >"$TMP/existing-app/.harness/scripts/jev-command-gate.mjs"
echo '// ours' >"$TMP/existing-app/.harness/scripts/team-report.mjs"
# Older kits installed sqlite-vec into .harness/: it goes on upgrade
mkdir -p "$TMP/existing-app/.harness/node_modules/sqlite-vec"
printf '{"name":"asdd-harness-deps","private":true,"dependencies":{"sqlite-vec":"0.1.10-alpha.4"}}\n' >"$TMP/existing-app/.harness/package.json"
printf '{}\n' >"$TMP/existing-app/.harness/package-lock.json"
printf '.harness/node_modules\n' >>"$TMP/existing-app/.gitignore"
# The bash installer older kits copied into projects is replaced by the CLI
printf '#!/usr/bin/env bash\n# Install / upgrade asdd-harness-kit into an existing project.\n' >"$TMP/existing-app/scripts/install-into.sh"

echo "== cli =="
asdd --version | grep -qxF "$(node -p "require('$ROOT/package.json').version")"
asdd help | grep -q 'asdd install <dir>'
if asdd no-such-command 2>/dev/null; then echo "unknown command accepted" >&2; exit 1; fi

echo "== help contains new flags =="
asdd install --help | grep -q -- '--interactive'
asdd install --help | grep -q -- '--no-interactive'

echo "== --no-interactive without target fails =="
if asdd install --no-interactive 2>/dev/null; then
  echo "expected failure for --no-interactive without target" >&2
  exit 1
fi

echo "== dry-run =="
asdd install "$TMP/existing-app" --dry-run --modules=http-api --runtime=cursor >/tmp/asdd-install-dry.log
head -20 /tmp/asdd-install-dry.log

echo "== install =="
asdd install "$TMP/existing-app" --modules=http-api --runtime=cursor,opencode,kimi,junie,devin,kiro --skip-deps

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
test ! -e "$TMP/existing-app/.agents/skills/open-code-review"  # the open-code-review skill is retired
if grep -q 'open-code-review' "$TMP/existing-app/.harness/steering/skills.md"; then echo "skills index still lists open-code-review" >&2; exit 1; fi

# project.json derives name from directory
grep -q '"project_id": "existing-app"' "$TMP/existing-app/.harness/config/project.json"
# harness/kit version tracks package.json, never a hardcoded value
KIT_VER="$(node -e "process.stdout.write(require('$ROOT/package.json').version)")"
grep -q "\"harness_version\": \"$KIT_VER\"" "$TMP/existing-app/.harness/config/project.json"
grep -q "\"version\": \"$KIT_VER\"" "$TMP/existing-app/.harness/config/project.json"
# Jev is not part of the harness or the ASDD pipeline (only the kit's jev-gate MCP server, for chat): no install has it
assert_no_jev() {
  local app="$1"
  for f in .harness/cli/src/harness/jev-client.mjs .harness/cli/src/harness/jev-gates.mjs .harness/cli/dist/harness/jev-client.mjs .harness/cli/dist/harness/jev-gates.mjs tools/jev-gate .agents/mcp/jev-gate-server.mjs .harness/steering/jev.md; do
    if [[ -e "$app/$f" ]]; then echo "Jev file in a project: $f" >&2; exit 1; fi
  done
  node -e '
    const [project, mcp] = process.argv.slice(1).map((p) => require(p));
    if (project.capabilities && "jev" in project.capabilities) throw new Error("capabilities.jev in a project");
    if (project.modules && "jev" in project.modules) throw new Error("modules.jev in a project");
    if ("jev-gate" in (mcp.mcpServers ?? {})) throw new Error("jev-gate MCP entry in a project");
  ' "$app/.harness/config/project.json" "$app/.agents/mcp/mcp.json"
  if (cd "$app" && asdd jev status >/dev/null 2>&1); then echo "asdd jev still runs" >&2; exit 1; fi
}
assert_no_jev "$TMP/existing-app"
(cd "$TMP/existing-app" && asdd check-config >/dev/null && asdd check >/dev/null)
if grep -rlE "from ['\"][^'\"]*jev-(client|gates)\.mjs['\"]|import\(['\"][^'\"]*jev-(client|gates)\.mjs" --include='*.mjs' "$TMP/existing-app/.harness" "$TMP/existing-app/.agents"; then
  echo "a default install imports Jev code" >&2; exit 1
fi
# The Shape Up and Product Delivery gates are decided by a human, recorded with decided_by (no Jev)
for skill in shape-up product-delivery; do
  if grep -qi 'jev' "$TMP/existing-app/.agents/skills/$skill/SKILL.md"; then echo "$skill skill still mentions Jev" >&2; exit 1; fi
  for phrase in 'decided_by'; do
    grep -q "$phrase" "$TMP/existing-app/.agents/skills/$skill/SKILL.md" || { echo "$skill skill misses: $phrase" >&2; exit 1; }
  done
done
# jev-module REQ-012: core guidance points to the command-gate CLI
grep -q 'asdd gate' "$TMP/existing-app/.agents/mcp/README.md"
# Knowledge index (vector/graph-lite projection of specs + state)
# tools/* MCP servers stay in the kit; projects get the CLI + an empty mcp.json seed
test ! -e "$TMP/existing-app/tools/knowledge"
test ! -e "$TMP/existing-app/tools/spec-drift"
test ! -e "$TMP/existing-app/tools/jev-gate"
test ! -e "$TMP/existing-app/.agents/mcp/knowledge-server.mjs"
test -f "$TMP/existing-app/.agents/mcp/mcp.json"
node -e '
  const s = require(process.argv[1]).mcpServers || {};
  for (const name of ["knowledge", "spec-drift", "jev-gate", "spec-drift-auditor"])
    if (name in s) throw new Error(`project mcp.json still has ${name}`);
' "$TMP/existing-app/.agents/mcp/mcp.json"
# Spec drift sensor lives in the project CLI (REQ-029); the Nest MCP App stays in the kit
test ! -e "$TMP/existing-app/tools/drift-dashboard"
test ! -e "$TMP/existing-app/.agents/mcp/spec-drift-auditor.mjs"
test -f "$TMP/existing-app/.harness/audits/README.md"
test -f "$TMP/existing-app/.harness/examples/CODEOWNERS.harness.example"
test -f "$TMP/existing-app/.harness/examples/harness-audit.yml.example"
test -f "$TMP/existing-app/.agents/skills/codebase-audit/SKILL.md"
(cd "$TMP/existing-app" && asdd audit --no-write >/dev/null)
(cd "$TMP/existing-app" && asdd learn >/dev/null)
test -f "$TMP/existing-app/.harness/state/learning/patterns.json"
test -f "$TMP/existing-app/.harness/steering/templates/steering-proposal.md"
# The kit's own domain model never ships; projects get the stub (kit-hygiene REQ-011, AC-008)
cmp -s "$ROOT/cli/templates/docs/domain-model.md" "$TMP/existing-app/docs/architecture/domain-model.md"
# The kit's own failure and dissent logs (its slice history) never ship; projects get empty logs
cmp -s "$ROOT/cli/templates/docs/agent-failure-log.md" "$TMP/existing-app/docs/agent-failure-log.md"
cmp -s "$ROOT/cli/templates/docs/dissent-log.md" "$TMP/existing-app/docs/dissent-log.md"
# No lock or progress scaffolding (kit-hygiene REQ-012, AC-008)
test ! -e "$TMP/existing-app/.harness/state/locks"
test ! -e "$TMP/existing-app/.harness/progress"
node -e 'const p = require(process.argv[1]).paths; if ("locks" in p || "progress" in p) throw new Error("project.json declares paths.locks or paths.progress");' "$TMP/existing-app/.harness/config/project.json"
# Shipped guidance (kit-hygiene REQ-001/002 stale, REQ-006/007 cutoffs, REQ-010/013 budget) is checked where it lands: the installed project
asdd kit guidance --only stale "$TMP/existing-app"
asdd kit guidance --only cutoffs "$TMP/existing-app"
asdd kit guidance --only budget "$TMP/existing-app"
asdd kit guidance --only asserts "$ROOT"
# Kit development artifacts never reach a project: not by the installer, not by the npm package
if grep -rqs 'Project binding for the kit itself' "$TMP/existing-app/.harness" "$TMP/existing-app/docs"; then
  echo "kit-only binding text leaked into the installed project" >&2; exit 1
fi
test -z "$(find "$TMP/existing-app/.harness/specs" "$TMP/existing-app/.harness/state/archive" -mindepth 1 -not -name README.md 2>/dev/null)"
test ! -e "$TMP/existing-app/docs/knowledge-base/steering-proposals"
# jev-module REQ-010: this slice's own artifacts never land in a project (the loop below covers every kit slice)
test ! -e "$TMP/existing-app/.harness/specs/jev-module"
test ! -e "$TMP/existing-app/.harness/features/jev-module.features.json"
for kit_slice in "$ROOT"/.harness/specs/*/ "$ROOT"/.harness/state/archive/*/; do
  [[ -d "$kit_slice" ]] || continue
  name="$(basename "$kit_slice")"
  test ! -e "$TMP/existing-app/.harness/specs/$name"
  test ! -e "$TMP/existing-app/.harness/state/slices/$name"
  test ! -e "$TMP/existing-app/.harness/features/$name.features.json"
done
(cd "$ROOT" && npm pack --dry-run --json 2>/dev/null) | node -e '
  const files = JSON.parse(require("fs").readFileSync(0, "utf8"))[0].files.map((f) => f.path);
  const kitOnly = /^docs\/(architecture\/domain-model|agent-failure-log|dissent-log)\.md$|^\.harness\/(specs|state\/slices|state\/archive|state\/learning)\/.+\/|^\.harness\/state\/archive\/.+\.json$|^\.harness\/features\/.+\.features\.json$|^\.harness\/state\/registry\.json$|^\.harness\/config\/project\.json$|^\.harness\/audits\/.+\.json$|^docs\/knowledge-base\/steering-proposals\/|^\.harness\/steering\/(product|structure|tech|design-system|domain-layer\.project|quality-gates\.project)\.md$/;
  const leaked = files.filter((f) => kitOnly.test(f));
  if (leaked.length) throw new Error(`npm package ships kit-only files: ${leaked.join(", ")}`);
  for (const f of ["cli/templates/bindings/product.md", "cli/bin/asdd.mjs", "cli/scaffold/specs/README.md", "cli/steering/session-loop.md", "cli/versions.json"])
    if (!files.includes(f)) throw new Error(`npm package misses ${f}`);
  // Everything a project receives ships inside cli/; the kit .harness/ (its slices, state, bindings) never ships.
  // Jev is only the jev-gate MCP server in the kit repo (clone it to use Jev): never in the package
  const dev = files.filter((f) => f.startsWith("cli/test/") || f.startsWith("scripts/") || f.startsWith(".harness/") || /jev/i.test(f));
  if (dev.length) throw new Error(`npm package ships kit tests or retired scripts: ${dev.join(", ")}`);
'
# The CLI as people install it (once per machine): npm pack, then a global install, then asdd install in a repository.
# Installs from the kit checkout never notice a file the package forgot; this does.
PKG_DIR="$TMP/pack" && mkdir -p "$PKG_DIR/prefix" "$PKG_DIR/app"
(cd "$ROOT" && npm pack --pack-destination "$PKG_DIR" >/dev/null 2>&1)
npm i -g --prefix "$PKG_DIR/prefix" "$PKG_DIR"/asdd-harness-kit-*.tgz >/dev/null 2>&1
(cd "$PKG_DIR/app" && git init -q && env PATH="$PKG_DIR/prefix/bin:$PATH" asdd install . --runtime=cursor,claude --modules=all --no-interactive >/dev/null 2>&1)
test ! -e "$PKG_DIR/app/.harness/cli"
echo '{"command":"git status"}' | (cd "$PKG_DIR/app" && env PATH="$PKG_DIR/prefix/bin:$PATH" sh -c "$EXPECT_GATE") | grep -q '"permission": *"allow"'
(cd "$PKG_DIR/app" && env PATH="$PKG_DIR/prefix/bin:$PATH" asdd check >/dev/null)
# kit-owned (refresh) files are recorded so spec drift exempts them; project-owned seeds are not
node -e '
  const m = require(process.argv[1]).managed_files || [];
  for (const f of [".harness/cli/bin/asdd.mjs", "scripts/install-into.sh", ".cursor/rules/asdd-steering.mdc", ".cursor/agents/asdd-discovery-agent.md", ".agents/mcp/mcp.json", ".harness/config/project.json", "opencode.json", ".harness/package.json", ".harness/scripts/knowledge-store-kuzu.mjs", ".harness/scripts/drift-lib.mjs"])
    if (!m.includes(f)) throw new Error(`managed_files misses ${f}`);
  for (const f of ["AGENTS.md", ".harness/steering/product.md", "README.md"])
    if (m.includes(f)) throw new Error(`managed_files wrongly lists ${f}`);
  const s = require(process.argv[1]).seeded_files || {};
  if (!/^[0-9a-f]{64}$/.test(s["docs/dissent-log.md"] || "")) throw new Error("seeded_files misses docs/dissent-log.md");
  if ("README.md" in s) throw new Error("seeded_files wrongly lists the project README.md");
' "$TMP/existing-app/.harness/config/installed-versions.json"
# No npm packages in the project: the harness uses node:sqlite (built in) and exact cosine search.
# The upgrade removes what older kits installed (.harness/package.json, lock, node_modules, the .gitignore line).
test ! -e "$TMP/existing-app/.harness/package.json"
test ! -e "$TMP/existing-app/.harness/package-lock.json"
test ! -e "$TMP/existing-app/.harness/node_modules"
if grep -qxF '.harness/node_modules' "$TMP/existing-app/.gitignore"; then echo "kit .gitignore line .harness/node_modules kept" >&2; exit 1; fi
grep -qxF '.harness/knowledge' "$TMP/existing-app/.gitignore"

# Shape Up -> Product Delivery integration contract.
grep -q '^name: shape-up$' "$TMP/existing-app/.agents/skills/shape-up/SKILL.md"
grep -q '^name: product-delivery$' "$TMP/existing-app/.agents/skills/product-delivery/SKILL.md"
grep -q 'references/conversions.md' "$TMP/existing-app/.agents/skills/product-delivery/SKILL.md"
grep -q 'bundle_type: shape_up_pitch_bundle' "$TMP/existing-app/.agents/skills/shape-up/references/conversions.md"
grep -q 'source_pitch_id:' "$TMP/existing-app/.agents/skills/shape-up/references/conversions.md"
grep -q 'const: scope_map' "$TMP/existing-app/.agents/skills/product-delivery/contracts/scope-map.schema.yaml"
grep -q 'scope choice' "$TMP/existing-app/.agents/skills/product-delivery/SKILL.md"
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
test -f "$TMP/existing-app/.harness/steering/controls.md"
grep -q 'Precedence' "$TMP/existing-app/.harness/steering/controls.md"
grep -q 'api-and-interface-design' "$TMP/existing-app/.harness/steering/skills.md"
grep -q 'skills-index:start' "$TMP/existing-app/.harness/steering/skills.md"
test -f "$TMP/existing-app/.cursor/hooks.json"
hook_has "$TMP/existing-app/.cursor/hooks.json" "$EXPECT_VERIFY"
hook_has "$TMP/existing-app/.cursor/hooks.json" "$EXPECT_GATE"
grep -q 'beforeShellExecution' "$TMP/existing-app/.cursor/hooks.json"
grep -q '"failClosed": true' "$TMP/existing-app/.cursor/hooks.json"
# command gate speaks the Cursor beforeShellExecution contract
(cd "$TMP/existing-app" && echo '{"command":"git status"}' | asdd gate) | grep -q '"permission": *"allow"'
(cd "$TMP/existing-app" && echo '{"command":"rm -rf /tmp/anything"}' | asdd gate) | grep -q '"permission": *"deny"'
# command gate speaks the Claude Code PreToolUse contract
(cd "$TMP/existing-app" && echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git status"}}' | asdd gate) | grep -q '"permissionDecision": *"allow"'
(cd "$TMP/existing-app" && echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"rm -rf /tmp/anything"}}' | asdd gate) | grep -q '"permissionDecision": *"deny"'
test -f "$TMP/existing-app/.harness/config/project.schema.json"
test ! -e "$TMP/existing-app/scripts/harness-migrate.mjs"
test ! -e "$TMP/existing-app/scripts/migrate-v2-v3.mjs"
# Pipeline, Jev, and drift docs were merged into the kit README (linked by URL)
test ! -e "$TMP/existing-app/docs/pipeline-documentation.md"
test ! -e "$TMP/existing-app/docs/jev-integration.md"
test ! -e "$TMP/existing-app/docs/architecture/spec-drift-and-audit.md"
(cd "$TMP/existing-app" && asdd check-config)
test ! -e "$TMP/existing-app/runtimes"
test ! -e "$TMP/existing-app/.agents/modules"
test ! -e "$TMP/existing-app/scripts/enable-module.sh"

# Kit-internal / dev-only files must never be installed, kit tests included
if find "$TMP/existing-app/.harness" "$TMP/existing-app/.agents" -path '*/node_modules' -prune -o \( -name '*.test.*' -o -name '*.spec.*' \) -print | grep .; then
  echo "kit test files were installed (listed above)" >&2
  exit 1
fi
test ! -e "$TMP/existing-app/scripts/install-into.sh"
test ! -e "$TMP/existing-app/.harness/scripts/check-invariants.mjs"
test ! -e "$TMP/existing-app/.harness/scripts/validators"
test ! -e "$TMP/existing-app/.harness/scripts/jev-command-gate.mjs"
grep -q '// ours' "$TMP/existing-app/.harness/scripts/team-report.mjs"
# No copy of the CLI in the project: asdd is the npm package (a devDependency, or global)
test ! -e "$TMP/existing-app/.harness/cli"
[[ "$(cd "$TMP/existing-app" && asdd --version)" == "$KIT_VER" ]]
(cd "$TMP/existing-app" && asdd status >/dev/null)
grep -q '"invariants": "asdd check"' "$TMP/existing-app/.harness/config/project.json"
# The hooks find asdd: none installed fails closed (exit 2, how to install); a global one runs; a devDependency wins
NODE_DIR="$(dirname "$(command -v node)")"
GBIN="$TMP/global-bin" && mkdir -p "$GBIN"
printf '#!/bin/sh\nexec node "%s/cli/bin/asdd.mjs" "$@"\n' "$ROOT" >"$GBIN/asdd" && chmod +x "$GBIN/asdd"
run_hook() { (cd "$TMP/existing-app" && env PATH="$1" sh -c "$EXPECT_GATE"); }
set +e; NO_ASDD="$(echo '{"command":"ls"}' | run_hook "$NODE_DIR:/usr/bin:/bin" 2>&1)"; NO_ASDD_CODE=$?; set -e
[[ "$NO_ASDD_CODE" == 2 ]] && grep -q 'asdd is not installed: npm i -D asdd-harness-kit' <<<"$NO_ASDD"
echo '{"command":"git status"}' | run_hook "$GBIN:$NODE_DIR:/usr/bin:/bin" | grep -q '"permission": *"allow"'
echo '{"command":"rm -rf /tmp/anything"}' | run_hook "$GBIN:$NODE_DIR:/usr/bin:/bin" | grep -q '"permission": *"deny"'
mkdir -p "$TMP/existing-app/node_modules/.bin"
ln -s "$ROOT" "$TMP/existing-app/node_modules/asdd-harness-kit"
ln -s ../asdd-harness-kit/cli/bin/asdd.mjs "$TMP/existing-app/node_modules/.bin/asdd"
echo '{"command":"git status"}' | run_hook "$NODE_DIR:/usr/bin:/bin" | grep -q '"permission": *"allow"'
grep -q '^ok    cli: devDependency asdd' <<<"$(asdd doctor "$TMP/existing-app" 2>&1 || true)"
rm -rf "$TMP/existing-app/node_modules"
test ! -e "$TMP/existing-app/cli"
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
asdd install "$TMP/existing-app" --runtime=cursor --skip-deps >/dev/null
grep -q 'echo keep-me' "$TMP/existing-app/.cursor/hooks.json"
hook_has "$TMP/existing-app/.cursor/hooks.json" "$EXPECT_VERIFY"
hook_has "$TMP/existing-app/.cursor/hooks.json" "$EXPECT_GATE"

# existing mcp.json keeps project servers; kit tools/*, retired auditor, and legacy knowledge-server go
printf '%s\n' '{"mcpServers":{"mine":{"type":"stdio","command":"echo"},"codegraph":{"type":"stdio","command":"node","args":[".agents/mcp/bin/codegraph-mcp.cjs"]},"spec-drift-auditor":{"type":"stdio","command":"node","args":[".agents/mcp/spec-drift-auditor.mjs"]},"knowledge":{"type":"stdio","command":"node","args":[".agents/mcp/knowledge-server.mjs"],"enabled":true},"spec-drift":{"type":"stdio","command":"node","args":["tools/spec-drift/bin/spec-drift.mjs"]}}}' >"$TMP/existing-app/.agents/mcp/mcp.json"
mkdir -p "$TMP/existing-app/.agents/mcp/ui" "$TMP/existing-app/tools/knowledge" "$TMP/existing-app/tools/spec-drift"
printf '%s\n' '{"name":"knowledge"}' >"$TMP/existing-app/tools/knowledge/package.json"
printf '%s\n' '{"name":"spec-drift"}' >"$TMP/existing-app/tools/spec-drift/package.json"
printf 'old\n' >"$TMP/existing-app/.agents/mcp/spec-drift-auditor.mjs"
printf 'old\n' >"$TMP/existing-app/.agents/mcp/knowledge-server.mjs"
printf 'old\n' >"$TMP/existing-app/.agents/mcp/ui/drift-dashboard.html"
asdd install "$TMP/existing-app" --skip-deps >/dev/null
grep -q '"mine"' "$TMP/existing-app/.agents/mcp/mcp.json"
# Codegraph is a skill on the CLI: the kit MCP entry, launcher, and steering go on upgrade
if grep -q '"codegraph"' "$TMP/existing-app/.agents/mcp/mcp.json"; then echo "kit codegraph MCP entry still registered" >&2; exit 1; fi
test -f "$TMP/existing-app/.agents/skills/codegraph/SKILL.md"
test ! -e "$TMP/existing-app/.agents/mcp/bin/codegraph-mcp.cjs"
test ! -e "$TMP/existing-app/.harness/steering/codegraph.md"
grep -q '| `codegraph` |' "$TMP/existing-app/.harness/steering/skills.md"
if grep -q '"spec-drift"' "$TMP/existing-app/.agents/mcp/mcp.json"; then echo "tools/spec-drift MCP entry still registered" >&2; exit 1; fi
if grep -q '"spec-drift-auditor"' "$TMP/existing-app/.agents/mcp/mcp.json"; then echo "retired spec-drift-auditor still registered" >&2; exit 1; fi
if grep -q '"knowledge"' "$TMP/existing-app/.agents/mcp/mcp.json"; then echo "legacy knowledge MCP entry still registered" >&2; exit 1; fi
test ! -e "$TMP/existing-app/.agents/mcp/spec-drift-auditor.mjs"
test ! -e "$TMP/existing-app/.agents/mcp/ui/drift-dashboard.html"
test ! -e "$TMP/existing-app/.agents/mcp/knowledge-server.mjs"
test ! -e "$TMP/existing-app/tools/knowledge"
test ! -e "$TMP/existing-app/tools/spec-drift"

# Orca was never wired: a fresh install has no capabilities.orca, and an upgrade drops the block older kits seeded
node -e 'if ("orca" in (require(process.argv[1]).capabilities ?? {})) throw new Error("capabilities.orca still seeded")' "$TMP/existing-app/.harness/config/project.json"
node -e 'const fs=require("fs");const p=process.argv[1];const d=JSON.parse(fs.readFileSync(p,"utf8"));d.capabilities.orca={enabled:false,experimental:true};fs.writeFileSync(p,JSON.stringify(d,null,2))' "$TMP/existing-app/.harness/config/project.json"
# second run keeps binding, does not require --force for create-only, stays hook-idempotent
asdd install "$TMP/existing-app" --skip-deps >/dev/null
grep -q 'KEEP ME' "$TMP/existing-app/.harness/steering/product.md"
node -e 'if ("orca" in (require(process.argv[1]).capabilities ?? {})) throw new Error("upgrade kept the seeded capabilities.orca")' "$TMP/existing-app/.harness/config/project.json"
GATE_COUNT="$(node -e "const h=JSON.parse(require('fs').readFileSync('$TMP/existing-app/.cursor/hooks.json','utf8')); process.stdout.write(String((h.hooks.beforeShellExecution||[]).filter((e)=>e?.command===process.env.EXPECT_GATE).length))")"
[[ "$GATE_COUNT" == "1" ]]

# Upgrade (kit-hygiene REQ-008, AC-006): an old gate entry is rewritten, never duplicated
printf '%s\n' '{"version":1,"hooks":{"beforeShellExecution":[{"command":"node .harness/scripts/jev-command-gate.mjs","timeout":30,"failClosed":true},{"command":"node tools/jev-command-gate.mjs --mine"}],"stop":[{"command":"node .harness/scripts/verify-on-stop.mjs"}]}}' >"$TMP/existing-app/.cursor/hooks.json"
mkdir -p "$TMP/existing-app/.claude"
printf '%s\n' '{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"node .harness/scripts/command-gate.mjs"}]}]}}' >"$TMP/existing-app/.claude/settings.json"
asdd install "$TMP/existing-app" --runtime=cursor,claude --skip-deps >/dev/null
node -e '
  const fs = require("fs");
  const [cursorPath, claudePath] = process.argv.slice(1);
  const cursor = JSON.parse(fs.readFileSync(cursorPath, "utf8")).hooks.beforeShellExecution.map((e) => e.command);
  const claude = JSON.parse(fs.readFileSync(claudePath, "utf8")).hooks.PreToolUse.flatMap((e) => e.hooks.map((h) => h.command));
  for (const [name, cmds] of [["cursor", cursor], ["claude", claude]]) {
    const gates = cmds.filter((c) => c.includes(".harness/scripts/") || c.includes("asdd.mjs gate") || c === process.env.EXPECT_GATE);
    if (gates.length !== 1 || gates[0] !== process.env.EXPECT_GATE)
      throw new Error(`${name}: expected one gate entry calling command-gate.mjs, got ${JSON.stringify(cmds)}`);
  }
  if (!cursor.includes("node tools/jev-command-gate.mjs --mine")) throw new Error("a project-owned hook with a similar name was rewritten");
  const stop = JSON.parse(fs.readFileSync(cursorPath, "utf8")).hooks.stop.map((e) => e.command);
  if (stop.join() !== process.env.EXPECT_VERIFY) throw new Error(`cursor stop hook not moved to the CLI: ${stop}`);
' "$TMP/existing-app/.cursor/hooks.json" "$TMP/existing-app/.claude/settings.json"

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
  asdd install "$RTMP/$rt-app" --runtime="$rt" --no-interactive --skip-deps >/dev/null 2>&1
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
      hook_has "$RTMP/$rt-app/.claude/settings.json" "$EXPECT_GATE"
      hook_has "$RTMP/$rt-app/.claude/settings.json" "$EXPECT_VERIFY"
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
  asdd install "$MTMP/$mod-app" --modules="$mod" --no-interactive --skip-deps >/dev/null 2>&1
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
      # spec compliance adapter for the spec-drift server's verify_spec_compliance (REQ-029)
      test -f "$MTMP/$mod-app/.agents/mcp/adapters/openapi.mjs"
      test ! -e "$MTMP/$mod-app/.agents/mcp/adapters/openapi.test.mjs"
      ;;
  esac
  echo "  OK"
done

# all modules together
echo "== module all =="
mkdir -p "$MTMP/all-app"
asdd install "$MTMP/all-app" --modules=all --no-interactive --skip-deps >/dev/null 2>&1
test -f "$MTMP/all-app/.agents/agents/asdd-integration-tester.md"
test -f "$MTMP/all-app/.agents/agents/asdd-e2e-tester.md"
test -d "$MTMP/all-app/.agents/skills/frontend-ui-engineering"
test -d "$MTMP/all-app/.agents/skills/api-and-interface-design"
assert_no_jev "$MTMP/all-app"
# Jev is not an installable module, and a bad module or runtime fails before anything is written
mkdir -p "$MTMP/jev-app"
if asdd install "$MTMP/jev-app" --modules=jev --no-interactive --skip-deps >/dev/null 2>&1; then echo "--modules=jev accepted" >&2; exit 1; fi
JEV_OUT="$(asdd install "$MTMP/jev-app" --modules=jev --no-interactive --skip-deps 2>&1 || true)"
grep -q 'only the jev-gate MCP server in the kit repo' <<<"$JEV_OUT"
test -z "$(ls -A "$MTMP/jev-app")"
if asdd install "$MTMP/jev-app" --runtime=vim --no-interactive --skip-deps >/dev/null 2>&1; then echo "--runtime=vim accepted" >&2; exit 1; fi
test -z "$(ls -A "$MTMP/jev-app")"
echo "  OK"

# .gitignore: committed harness files must reach the repository (other clones, CI)
echo "== .gitignore: common rules (node_modules/, dist/) are fine; an ignored .harness/ stops the install =="
mkdir -p "$MTMP/gi-dist" && (cd "$MTMP/gi-dist" && git init -q && printf 'node_modules/\ndist/\n' >.gitignore)
asdd install "$MTMP/gi-dist" --runtime=cursor --no-interactive --skip-deps >/dev/null
grep -q '^ok    gitignore' <<<"$(asdd doctor "$MTMP/gi-dist" 2>&1 || true)"
mkdir -p "$MTMP/gi-harness" && (cd "$MTMP/gi-harness" && git init -q && printf '.harness/\n' >.gitignore)
GI_OUT="$(asdd install "$MTMP/gi-harness" --no-interactive --skip-deps 2>&1 || true)"
grep -q 'ignore rules hide harness files the team must commit' <<<"$GI_OUT"
test "$(ls -A "$MTMP/gi-harness" | tr '\n' ' ')" = ".git .gitignore "
asdd install "$MTMP/gi-harness" --force --no-interactive --skip-deps >/dev/null 2>&1
test -f "$MTMP/gi-harness/.harness/config/project.json"
if asdd doctor "$MTMP/gi-harness" >/dev/null 2>&1; then echo "doctor passed an ignored .harness/" >&2; exit 1; fi
grep -q '^FAIL  gitignore' <<<"$(asdd doctor "$MTMP/gi-harness" 2>&1 || true)"
mkdir -p "$MTMP/gi-cursor" && (cd "$MTMP/gi-cursor" && git init -q && printf '.cursor/\n' >.gitignore)
GI_OUT="$(asdd install "$MTMP/gi-cursor" --runtime=cursor --no-interactive --skip-deps 2>&1)"
grep -q 'runtime hook files are ignored' <<<"$GI_OUT"
grep -q '^warn  gitignore' <<<"$(asdd doctor "$MTMP/gi-cursor" 2>&1 || true)"
echo "  OK"

# Upgrade of a project that had the old jev module (or a pre-module Jev install): every trace of it goes
echo "== upgrade: the old jev module and the retired jev-gate-server.mjs are removed =="
mkdir -p "$MTMP/legacy-app"
asdd install "$MTMP/legacy-app" --no-interactive --skip-deps >/dev/null 2>&1
assert_no_jev "$MTMP/legacy-app"
mkdir -p "$MTMP/legacy-app/.harness/scripts" "$MTMP/legacy-app/.harness/cli/src/harness" "$MTMP/legacy-app/.harness/cli/dist/harness"
for f in jev-client.mjs jev-gates.mjs; do
  printf '// old kit copy\n' >"$MTMP/legacy-app/.harness/cli/src/harness/$f"
  printf '// old kit copy\n' >"$MTMP/legacy-app/.harness/cli/dist/harness/$f"
  printf '// old kit copy\n' >"$MTMP/legacy-app/.harness/scripts/$f"
done
printf -- '---\ninclusion: auto\n---\n# Jev module\n' >"$MTMP/legacy-app/.harness/steering/jev.md"
# An install by an older kit: the CLI copied into .harness/cli/, and hooks calling that copy
mkdir -p "$MTMP/legacy-app/.harness/cli/bin" "$MTMP/legacy-app/.cursor"
printf '// old kit copy\n' >"$MTMP/legacy-app/.harness/cli/bin/asdd.mjs"
printf '%s\n' '{"version":1,"hooks":{"beforeShellExecution":[{"command":"node .harness/cli/bin/asdd.mjs gate","timeout":30,"failClosed":true}],"stop":[{"command":"node .harness/cli/bin/asdd.mjs verify"}]}}' >"$MTMP/legacy-app/.cursor/hooks.json"
printf 'old\n' >"$MTMP/legacy-app/.agents/mcp/jev-gate-server.mjs"
node -e '
  const fs = require("fs");
  const [p, m] = process.argv.slice(1);
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  d.capabilities.jev = { enabled: true, required: false, required_by: ["shape-up", "product-delivery"], apiKey: "", endpoint: "https://api.typesafe.ai/v1", fallbackPolicy: "fail-closed" };
  d.modules = { ...(d.modules ?? {}), jev: true };
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n");
  const mcp = JSON.parse(fs.readFileSync(m, "utf8"));
  mcp.mcpServers["jev-gate"] = { type: "stdio", command: "node", args: [".agents/mcp/jev-gate-server.mjs"], enabled: true };
  fs.writeFileSync(m, JSON.stringify(mcp, null, 2) + "\n");
' "$MTMP/legacy-app/.harness/config/project.json" "$MTMP/legacy-app/.agents/mcp/mcp.json"
asdd install "$MTMP/legacy-app" --runtime=cursor --no-interactive --skip-deps >/dev/null 2>&1
assert_no_jev "$MTMP/legacy-app"
test ! -e "$MTMP/legacy-app/.harness/scripts/jev-gates.mjs"
hook_has "$MTMP/legacy-app/.cursor/hooks.json" "$EXPECT_GATE"
hook_has "$MTMP/legacy-app/.cursor/hooks.json" "$EXPECT_VERIFY"
if grep -q 'harness/cli' "$MTMP/legacy-app/.cursor/hooks.json"; then echo "a hook still calls the old .harness/cli copy" >&2; exit 1; fi
test ! -e "$MTMP/legacy-app/.harness/cli"
(cd "$MTMP/legacy-app" && asdd check-config >/dev/null)
echo "  OK"

echo "== versions: one project version; every refreshed file has an entry =="
VTMP="$(mktemp -d "${TMPDIR:-/tmp}/asdd-versions-test.XXXXXX")"
mkdir -p "$VTMP/app"
HARNESS_TRACE_REFRESH="$VTMP/refresh.log" asdd install "$VTMP/app" \
  --runtime=cursor,claude,opencode,kimi,junie,devin,kiro --modules=all --no-interactive --skip-deps >/dev/null
node -e '
  const fs = require("fs");
  const [pkgPath, versionsPath, tracePath] = process.argv.slice(1);
  const version = require(pkgPath).version;
  const v = require(versionsPath);
  if (v.kit_version !== version) throw new Error(`kit_version ${v.kit_version} != package.json ${version}`);
  const off = Object.entries(v.artifacts).filter(([, ver]) => ver !== version).map(([f]) => f);
  if (off.length) throw new Error(`artifacts not at ${version} (run: asdd kit versions): ${off.join(", ")}`);
  const traced = [...new Set(fs.readFileSync(tracePath, "utf8").split("\n").filter(Boolean))];
  const missing = traced.filter((f) => !(f in v.artifacts));
  if (missing.length) throw new Error(`refreshed but never versioned (add to cli/src/kit/versions.mjs): ${missing.join(", ")}`);
' "$ROOT/package.json" "$ROOT/cli/versions.json" "$VTMP/refresh.log"
rm -rf "$VTMP"

echo "OK asdd install smoke test"
