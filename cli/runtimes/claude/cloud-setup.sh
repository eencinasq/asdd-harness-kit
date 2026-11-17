#!/usr/bin/env bash
# cloud-setup.sh — prepare a Claude Code cloud environment (claude.ai/code, or the Claude Desktop Code tab on a
# remote repository) so the grounding step of PO/PM shaping can read code, specs, and past slices.
#
# Usage (from the repository root):
#   bash cloud-setup.sh            run every step (idempotent)
#   bash cloud-setup.sh --plan     print the steps; change nothing
#   bash cloud-setup.sh --check    report each prerequisite; exit 1 when a required one is missing; change nothing
#
# Where it lives: kit checkout   cli/runtimes/claude/cloud-setup.sh
#                 project        node_modules/asdd-harness-kit/cli/runtimes/claude/cloud-setup.sh (after npm ci)
#
# Environment:
#   ASDD_NODE24_BIN   directory holding a Node >= 24.22.1 `node` (only for building tools/* in a kit checkout,
#                     when the `node` on PATH is older)
#   HARNESS_AUTHOR    author name for learning summaries (else the configured user name)
set -euo pipefail

MODE="${1:-run}"
case "$MODE" in
  run | --plan | --check) ;;
  *) echo "usage: bash cloud-setup.sh [--plan|--check]" >&2; exit 2 ;;
esac

ROOT="$(pwd)"
MISSING=0
STEP=0

step() { STEP=$((STEP + 1)); echo "== [$STEP] $1"; }
ok() { echo "  OK      $1"; }
missing() { echo "  MISSING $1"; MISSING=1; }
skip() { echo "  skip    $1"; }
fail() { echo "  FAIL    $1" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# version_ge <have> <need>: true when dotted version <have> >= <need>
version_ge() {
  local IFS=.
  local -a a=($1) b=($2)
  for i in 0 1 2; do
    local x=${a[i]:-0} y=${b[i]:-0}
    if ((10#$x > 10#$y)); then return 0; fi
    if ((10#$x < 10#$y)); then return 1; fi
  done
  return 0
}
node_version() { "$1" -v 2>/dev/null | head -n1 | sed 's/^v//'; }

is_kit=0
[[ -f "$ROOT/cli/bin/asdd.mjs" ]] && is_kit=1
has_tools=0
[[ -d "$ROOT/tools/knowledge" || -d "$ROOT/tools/spec-drift" ]] && has_tools=1

if [[ "$MODE" == "--plan" ]]; then
  echo "cloud-setup plan (repository: $ROOT)"
  echo "  1. prerequisites    node >= 22 and the version-control CLI on PATH"
  echo "  2. asdd CLI         kit checkout: node cli/bin/asdd.mjs; project: node_modules/.bin/asdd (npm ci when listed), else asdd on PATH"
  echo "  3. MCP servers      kit checkout only (tools/knowledge, tools/spec-drift): Node >= 24.22.1 + pnpm, pnpm install --frozen-lockfile && pnpm build"
  echo "  4. codegraph        npm i -g codegraph when missing; codegraph init (no .codegraph/) or codegraph sync"
  echo "  5. knowledge index  asdd knowledge sync"
  echo "  6. doctor           asdd doctor (report only)"
  exit 0
fi

# ---- 1. prerequisites
step "prerequisites"
if have node; then
  NV="$(node_version node)"
  if version_ge "$NV" "22.0.0"; then ok "node $NV"; else missing "node >= 22 (found $NV)"; fi
else
  missing "node >= 22 (not on PATH)"
fi
if have git; then ok "$(git --version)"; else missing "git (not on PATH)"; fi

# ---- 2. asdd CLI
step "asdd CLI"
ASDD=()
if ((is_kit)); then
  ASDD=(node "$ROOT/cli/bin/asdd.mjs"); ok "kit checkout: node cli/bin/asdd.mjs"
elif [[ -x "$ROOT/node_modules/.bin/asdd" ]]; then
  ASDD=("$ROOT/node_modules/.bin/asdd"); ok "project devDependency: node_modules/.bin/asdd"
elif [[ -f "$ROOT/package.json" ]] && grep -q '"asdd-harness-kit"' "$ROOT/package.json"; then
  if [[ "$MODE" == "--check" ]]; then
    if have npm; then ok "asdd-harness-kit listed in package.json; npm ci will install it"; else missing "npm (needed for npm ci)"; fi
  else
    echo "  npm ci (asdd-harness-kit is a devDependency)"
    npm ci --no-audit --no-fund || fail "npm ci"
    ASDD=("$ROOT/node_modules/.bin/asdd")
  fi
elif have asdd; then
  ASDD=(asdd); ok "asdd on PATH"
else
  missing "the asdd CLI (devDependency asdd-harness-kit, or npm i -g asdd-harness-kit)"
fi

# ---- 3. MCP servers (kit checkout only)
step "MCP servers"
NODE24=""
if ((has_tools)); then
  if have node && version_ge "$(node_version node)" "24.22.1"; then
    NODE24="$(dirname "$(command -v node)")"
  elif [[ -n "${ASDD_NODE24_BIN:-}" && -x "${ASDD_NODE24_BIN}/node" ]] && version_ge "$(node_version "${ASDD_NODE24_BIN}/node")" "24.22.1"; then
    NODE24="$ASDD_NODE24_BIN"
  fi
  if [[ -n "$NODE24" ]]; then ok "Node >= 24.22.1 in $NODE24"; else missing "Node >= 24.22.1 (node on PATH, or ASDD_NODE24_BIN) to build tools/*"; fi
  if have pnpm; then ok "pnpm $(pnpm -v 2>/dev/null | head -n1)"; else missing "pnpm (corepack enable, or npm i -g pnpm) to build tools/*"; fi
else
  skip "MCP servers: no tools/ here (projects use the asdd CLI; the servers live in a kit checkout)"
fi

# ---- 4. codegraph
step "codegraph"
if have codegraph; then ok "codegraph $(codegraph --version 2>/dev/null | head -n1)"
elif have npm; then ok "codegraph missing; npm i -g codegraph will install it"
else missing "codegraph (npm i -g codegraph; npm not on PATH)"
fi

# ---- 5. knowledge index / 6. doctor (no prerequisites beyond the asdd CLI)
step "knowledge index"
ok "asdd knowledge sync after the asdd CLI is resolved"
step "doctor"
ok "asdd doctor (report only)"

if [[ "$MODE" == "--check" ]]; then
  if ((MISSING)); then echo "cloud-setup check: required prerequisites are MISSING (see above)"; exit 1; fi
  echo "cloud-setup check: OK"
  exit 0
fi

((MISSING)) && fail "required prerequisites are missing (see above); nothing was built"

# ---- run: 3. build MCP servers
if ((has_tools)); then
  echo "== build MCP servers"
  for t in knowledge spec-drift; do
    [[ -d "$ROOT/tools/$t" ]] || continue
    echo "  tools/$t: pnpm install --frozen-lockfile && pnpm build"
    (cd "$ROOT/tools/$t" && PATH="$NODE24:$PATH" pnpm install --frozen-lockfile && PATH="$NODE24:$PATH" pnpm build) || fail "build tools/$t"
  done
fi

# ---- run: 4. codegraph install + index
echo "== codegraph index"
if ! have codegraph; then
  echo "  npm i -g codegraph"
  npm i -g codegraph || fail "npm i -g codegraph"
fi
if [[ -d "$ROOT/.codegraph" ]]; then
  codegraph sync "$ROOT" || fail "codegraph sync"
else
  codegraph init "$ROOT" || fail "codegraph init"
fi

# ---- run: 5. knowledge index
echo "== knowledge index"
"${ASDD[@]}" knowledge sync || fail "asdd knowledge sync"

# ---- run: 6. doctor (report only: a warning does not fail the setup)
echo "== doctor"
"${ASDD[@]}" doctor || echo "  (doctor reported warnings; see above)"

echo "cloud-setup: done"
