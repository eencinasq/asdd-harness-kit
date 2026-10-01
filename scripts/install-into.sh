#!/usr/bin/env bash
# Install / upgrade asdd-harness-kit into an existing project.
#
# Usage:
#   ./scripts/install-into.sh <target-dir> [options]
#   ./scripts/install-into.sh /path/to/repo --modules=http-api,web-ui --runtime=cursor
#
# Piped (clones kit temporarily):
#   curl -fsSL https://raw.githubusercontent.com/eencinasq/asdd-harness-kit/main/scripts/install-into.sh \
#     | bash -s -- /path/to/repo --from-git --modules=http-api --runtime=cursor
#
set -euo pipefail

KIT_REMOTE_DEFAULT="${ASDD_KIT_REMOTE:-https://github.com/eencinasq/asdd-harness-kit.git}"
KIT_REF_DEFAULT="${ASDD_KIT_REF:-main}"

usage() {
  cat <<'EOF'
Install asdd-harness-kit into an existing repository.

Usage:
  ./scripts/install-into.sh <target-dir> [options]

Options:
  --from-git              Clone kit into a temp dir (for curl | bash)
  --kit-dir <path>        Kit source (default: parent of scripts/)
  --modules=<list>        bruno,playwright-e2e,web-ui,http-api — or "all"
  --runtime=<name>        cursor | claude | opencode | kimi | junie | devin | kiro
                          comma-separated values or none (default: none)
  --force                 Overwrite portable kit files that already exist
  --force-bindings        Overwrite product/structure/tech/*.project.md (DANGEROUS)
  --force-mcp             Replace .agents/mcp/mcp.json with kit baseline
  --skip-bindings         Do not create binding stubs
  --skip-docs             Skip AGENTS.md / docs copy
  --dry-run               Print actions only
  -h, --help              Show help

Safe defaults: never overwrites existing bindings, PROGRESS, slice state, specs,
or mcp.json. Without --force: create if missing; keep existing portable files.
With --force: refresh portable contracts, agents, skills, modules, scripts.
Bindings still kept unless --force-bindings.
EOF
}

log() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

DRY_RUN=0
FROM_GIT=0
FORCE=0
FORCE_BINDINGS=0
FORCE_MCP=0
SKIP_BINDINGS=0
SKIP_DOCS=0
MODULES=""
RUNTIMES=""
KIT_DIR=""
TARGET=""
TMP_KIT=""

cleanup() {
  if [[ -n "${TMP_KIT:-}" && -d "${TMP_KIT}" ]]; then
    rm -rf "${TMP_KIT}"
  fi
}
trap cleanup EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --from-git) FROM_GIT=1; shift ;;
    --force) FORCE=1; shift ;;
    --force-bindings) FORCE_BINDINGS=1; shift ;;
    --force-mcp) FORCE_MCP=1; shift ;;
    --skip-bindings) SKIP_BINDINGS=1; shift ;;
    --skip-docs) SKIP_DOCS=1; shift ;;
    --kit-dir)
      KIT_DIR="${2:-}"; [[ -n "$KIT_DIR" ]] || die "--kit-dir needs a path"
      shift 2
      ;;
    --modules=*) MODULES="${1#*=}"; shift ;;
    --modules)
      MODULES="${2:-}"; [[ -n "$MODULES" ]] || die "--modules needs a value"
      shift 2
      ;;
    --runtime=*) RUNTIMES="${1#*=}"; shift ;;
    --runtime)
      RUNTIMES="${2:-}"; [[ -n "$RUNTIMES" ]] || die "--runtime needs a value"
      shift 2
      ;;
    --*) die "unknown option: $1" ;;
    *)
      [[ -z "$TARGET" ]] || die "unexpected argument: $1"
      TARGET="$1"
      shift
      ;;
  esac
done

[[ -n "$TARGET" ]] || { usage; die "target directory required"; }
TARGET="$(cd "$TARGET" 2>/dev/null && pwd)" || die "target not found: $TARGET"

resolve_kit() {
  if [[ "$FROM_GIT" -eq 1 ]]; then
    TMP_KIT="$(mktemp -d "${TMPDIR:-/tmp}/asdd-kit.XXXXXX")"
    log "Cloning $KIT_REMOTE_DEFAULT ($KIT_REF_DEFAULT) → $TMP_KIT"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      if [[ -f "$(cd "$(dirname "$0")/.." && pwd)/.harness/steering/domain-layer.md" ]]; then
        KIT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
        log "DRY-RUN from-git: using local kit $KIT_DIR"
        TMP_KIT=""
      else
        KIT_DIR="$TMP_KIT"
      fi
      return
    fi
    git clone --depth 1 --branch "$KIT_REF_DEFAULT" "$KIT_REMOTE_DEFAULT" "$TMP_KIT" >/dev/null
    KIT_DIR="$TMP_KIT"
    return
  fi
  if [[ -n "$KIT_DIR" ]]; then
    KIT_DIR="$(cd "$KIT_DIR" && pwd)"
  else
    KIT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
  fi
  [[ -f "$KIT_DIR/.harness/steering/domain-layer.md" ]] || die "not a kit checkout: $KIT_DIR"
}

# policy: create | refresh
#   create  — copy only if dest missing
#   refresh — copy always when --force OR dest missing; keep existing without --force
copy_file() {
  local src="$1" dest="$2" policy="${3:-create}"
  [[ -f "$src" ]] || die "missing kit file: $src"

  local do_copy=0
  if [[ ! -e "$dest" ]]; then
    do_copy=1
  elif [[ "$policy" == "refresh" && "$FORCE" -eq 1 ]]; then
    do_copy=1
  fi

  if [[ "$do_copy" -eq 0 ]]; then
    log "KEEP $dest"
    return 0
  fi
  log "COPY $dest"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
}

copy_tree() {
  local src="$1" dest="$2" policy="${3:-refresh}"
  [[ -d "$src" ]] || die "missing kit dir: $src"
  local rel local_src local_dest
  while IFS= read -r -d '' rel; do
    rel="${rel#./}"
    local_src="$src/$rel"
    local_dest="$dest/$rel"
    copy_file "$local_src" "$local_dest" "$policy"
  done < <(cd "$src" && find . -type f -print0)
}

install_portable_steering() {
  local f
  for f in domain-layer.md quality-gates.md manifest.md session-loop.md asdd-lite.md \
           codegraph.md codegraph-agents.md skills.md security-rules.md controls.md README.md; do
    copy_file "$KIT_DIR/.harness/steering/$f" "$TARGET/.harness/steering/$f" refresh
  done
  copy_tree "$KIT_DIR/.harness/steering/templates" "$TARGET/.harness/steering/templates" refresh
}

install_bindings() {
  [[ "$SKIP_BINDINGS" -eq 1 ]] && { log "SKIP bindings"; return 0; }
  local f
  for f in product.md structure.md tech.md domain-layer.project.md quality-gates.project.md design-system.md; do
    if [[ "$FORCE_BINDINGS" -eq 1 ]]; then
      local old_force=$FORCE
      FORCE=1
      copy_file "$KIT_DIR/.harness/steering/$f" "$TARGET/.harness/steering/$f" refresh
      FORCE=$old_force
    else
      copy_file "$KIT_DIR/.harness/steering/$f" "$TARGET/.harness/steering/$f" create
    fi
  done
}

install_harness_scaffold() {
  copy_file "$KIT_DIR/.harness/scripts/check-invariants.mjs" "$TARGET/.harness/scripts/check-invariants.mjs" refresh
  copy_file "$KIT_DIR/.harness/scripts/check-skills-index.mjs" "$TARGET/.harness/scripts/check-skills-index.mjs" refresh
  copy_file "$KIT_DIR/.harness/scripts/verify-on-stop.mjs" "$TARGET/.harness/scripts/verify-on-stop.mjs" refresh
  copy_file "$KIT_DIR/.harness/scripts/check-project-config.mjs" "$TARGET/.harness/scripts/check-project-config.mjs" refresh
  copy_file "$KIT_DIR/.harness/config/project.schema.json" "$TARGET/.harness/config/project.schema.json" refresh
  copy_file "$KIT_DIR/.harness/config/README.md" "$TARGET/.harness/config/README.md" refresh
  copy_file "$KIT_DIR/.harness/features/feature_list.schema.json" "$TARGET/.harness/features/feature_list.schema.json" refresh
  copy_file "$KIT_DIR/scripts/harness-migrate.mjs" "$TARGET/scripts/harness-migrate.mjs" refresh
  copy_file "$KIT_DIR/.harness/PROGRESS.md" "$TARGET/.harness/PROGRESS.md" create
  copy_file "$KIT_DIR/.harness/state/manifest.json" "$TARGET/.harness/state/manifest.json" create
  copy_file "$KIT_DIR/.harness/state/locks/README.md" "$TARGET/.harness/state/locks/README.md" create

  local d
  for d in specs features progress state/slices state/archive; do
    if [[ "$DRY_RUN" -eq 1 ]]; then
      log "DIR  $TARGET/.harness/$d"
      continue
    fi
    mkdir -p "$TARGET/.harness/$d"
    if [[ ! -e "$TARGET/.harness/$d/README.md" && -f "$KIT_DIR/.harness/$d/README.md" ]]; then
      cp "$KIT_DIR/.harness/$d/README.md" "$TARGET/.harness/$d/README.md"
      log "COPY $TARGET/.harness/$d/README.md"
    fi
  done
}

install_project_adapter() {
  local config="$TARGET/.harness/config/project.json"
  if [[ -e "$config" ]]; then
    log "KEEP $config"
    return 0
  fi
  local project_id
  project_id="$(basename "$TARGET" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9][^a-z0-9]*/-/g; s/^-//; s/-$//')"
  [[ -n "$project_id" ]] || project_id="project"
  log "CREATE $config"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  mkdir -p "$(dirname "$config")"
  cat >"$config" <<EOF
{
  "schema_version": "1.0",
  "project_id": "$project_id",
  "kit": {
    "name": "asdd-harness-kit",
    "source": "$KIT_REMOTE_DEFAULT",
    "ref": "$KIT_REF_DEFAULT"
  },
  "harness_version": "2.0",
  "mode": "full",
  "bindings_complete": false,
  "paths": {
    "steering": ".harness/steering",
    "specs": ".harness/specs",
    "state": ".harness/state",
    "features": ".harness/features",
    "progress": ".harness/progress",
    "progress_index": ".harness/PROGRESS.md",
    "locks": ".harness/state/locks"
  },
  "bindings": {
    "product": ".harness/steering/product.md",
    "structure": ".harness/steering/structure.md",
    "tech": ".harness/steering/tech.md",
    "domain_layer": ".harness/steering/domain-layer.project.md",
    "quality_gates": ".harness/steering/quality-gates.project.md"
  },
  "commands": {
    "invariants": "node .harness/scripts/check-invariants.mjs",
    "verify_on_stop": "node .harness/scripts/verify-on-stop.mjs"
  },
  "modules": {},
  "capabilities": {
    "codegraph": {
      "enabled": false,
      "required": false
    },
    "orca": {
      "enabled": false,
      "experimental": true
    }
  },
  "runtimes": []
}
EOF
}

install_agents_core() {
  copy_tree "$KIT_DIR/.agents/agents" "$TARGET/.agents/agents" refresh
  copy_tree "$KIT_DIR/.agents/skills" "$TARGET/.agents/skills" refresh
  copy_tree "$KIT_DIR/.agents/mcp/bin" "$TARGET/.agents/mcp/bin" refresh
  copy_file "$KIT_DIR/.agents/mcp/sync-runtime-mcp.cjs" "$TARGET/.agents/mcp/sync-runtime-mcp.cjs" refresh
  copy_file "$KIT_DIR/.agents/mcp/README.md" "$TARGET/.agents/mcp/README.md" refresh
  if [[ "$FORCE_MCP" -eq 1 ]]; then
    local old_force=$FORCE
    FORCE=1
    copy_file "$KIT_DIR/.agents/mcp/mcp.json" "$TARGET/.agents/mcp/mcp.json" refresh
    FORCE=$old_force
  else
    copy_file "$KIT_DIR/.agents/mcp/mcp.json" "$TARGET/.agents/mcp/mcp.json" create
  fi
}

install_docs_root() {
  [[ "$SKIP_DOCS" -eq 1 ]] && return 0
  copy_file "$KIT_DIR/AGENTS.md" "$TARGET/AGENTS.md" create
  copy_file "$KIT_DIR/docs/asdd-harness-portability.md" "$TARGET/docs/asdd-harness-portability.md" create
  copy_file "$KIT_DIR/docs/asdd-and-harness-engineering.md" "$TARGET/docs/asdd-and-harness-engineering.md" create
  copy_file "$KIT_DIR/docs/pipeline-documentation.md" "$TARGET/docs/pipeline-documentation.md" refresh
  copy_file "$KIT_DIR/docs/shape-up-asdd-harness-integration.md" "$TARGET/docs/shape-up-asdd-harness-integration.md" create
  copy_file "$KIT_DIR/scripts/install-into.sh" "$TARGET/scripts/install-into.sh" refresh
  if [[ "$DRY_RUN" -eq 0 ]]; then
    chmod +x "$TARGET/scripts/install-into.sh" 2>/dev/null || true
  fi
}

remove_runtime_docs() {
  if [[ ! -e "$TARGET/runtimes" ]]; then
    return 0
  fi
  log "REMOVE $TARGET/runtimes (runtime recipes remain in asdd-harness-kit)"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  rm -rf "$TARGET/runtimes"
}

remove_module_sources() {
  if [[ -e "$TARGET/.agents/modules" ]]; then
    log "REMOVE $TARGET/.agents/modules (modules remain in asdd-harness-kit)"
    if [[ "$DRY_RUN" -eq 0 ]]; then
      rm -rf "$TARGET/.agents/modules"
    fi
  fi
  if [[ -e "$TARGET/scripts/enable-module.sh" ]]; then
    log "REMOVE $TARGET/scripts/enable-module.sh (use the kit installer to enable modules)"
    if [[ "$DRY_RUN" -eq 0 ]]; then
      rm -f "$TARGET/scripts/enable-module.sh"
    fi
  fi
}

enable_one_module() {
  local m="$1"
  case "$m" in
    bruno)
      copy_file "$KIT_DIR/.agents/modules/bruno/asdd-integration-tester.md" \
        "$TARGET/.agents/agents/asdd-integration-tester.md" refresh
      ;;
    playwright-e2e)
      copy_file "$KIT_DIR/.agents/modules/playwright-e2e/asdd-e2e-tester.md" \
        "$TARGET/.agents/agents/asdd-e2e-tester.md" refresh
      ;;
    web-ui)
      copy_tree "$KIT_DIR/.agents/modules/web-ui/skills" "$TARGET/.agents/skills" refresh
      ;;
    http-api)
      copy_tree "$KIT_DIR/.agents/modules/http-api/skills" "$TARGET/.agents/skills" refresh
      ;;
    *) die "unknown module: $m (bruno|playwright-e2e|web-ui|http-api)" ;;
  esac
}

refresh_skills_index() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "SKILLS index name+description"
    return 0
  fi
  if [[ ! -f "$TARGET/.harness/scripts/check-skills-index.mjs" ]]; then
    log "SKIP skills index (script missing)"
    return 0
  fi
  log "SKILLS index ← .agents/skills name+description"
  (cd "$TARGET" && node .harness/scripts/check-skills-index.mjs --write)
}

enable_modules() {
  [[ -n "$MODULES" ]] || return 0
  local list="$MODULES"
  [[ "$list" == "all" ]] && list="bruno,playwright-e2e,web-ui,http-api"
  local m
  IFS=',' read -r -a mods <<<"$list"
  for m in "${mods[@]}"; do
    m="$(echo "$m" | tr -d ' ')"
    [[ -n "$m" ]] || continue
    log "MODULE $m"
    local old_force=$FORCE
    FORCE=1
    enable_one_module "$m"
    FORCE=$old_force
  done
}

wire_runtime_cursor() {
  log "RUNTIME cursor"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  mkdir -p "$TARGET/.cursor/agents" "$TARGET/.cursor/rules"
  if [[ -L "$TARGET/.cursor/skills" || ! -e "$TARGET/.cursor/skills" ]]; then
    rm -f "$TARGET/.cursor/skills" 2>/dev/null || true
    ln -sfn ../.agents/skills "$TARGET/.cursor/skills"
    log "LINK $TARGET/.cursor/skills → ../.agents/skills"
  else
    log "KEEP $TARGET/.cursor/skills"
  fi
  local f base
  for f in "$TARGET/.agents/agents"/asdd-*.md; do
    [[ -f "$f" ]] || continue
    base="$(basename "$f")"
    ln -sfn "../../.agents/agents/$base" "$TARGET/.cursor/agents/$base"
    log "LINK $TARGET/.cursor/agents/$base"
  done
  if [[ ! -e "$TARGET/.cursor/mcp.json" ]]; then
    ln -sfn ../.agents/mcp/mcp.json "$TARGET/.cursor/mcp.json"
    log "LINK $TARGET/.cursor/mcp.json"
  else
    log "KEEP $TARGET/.cursor/mcp.json"
  fi
  if [[ ! -e "$TARGET/.cursor/rules/asdd-steering.mdc" || "$FORCE" -eq 1 ]]; then
    cp "$KIT_DIR/runtimes/cursor/asdd-steering.mdc" "$TARGET/.cursor/rules/asdd-steering.mdc"
    log "COPY $TARGET/.cursor/rules/asdd-steering.mdc"
  else
    log "KEEP $TARGET/.cursor/rules/asdd-steering.mdc"
  fi
  install_cursor_verify_hook
}

install_cursor_verify_hook() {
  local dest="$TARGET/.cursor/hooks.json"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "HOOK $dest stop → node .harness/scripts/verify-on-stop.mjs"
    return 0
  fi
  mkdir -p "$TARGET/.cursor"
  if [[ ! -e "$dest" ]]; then
    cp "$KIT_DIR/.cursor/hooks.json" "$dest"
    log "COPY $dest"
    return 0
  fi
  node --input-type=module - "$dest" <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs';

const dest = process.argv[2];
const hook = {
  command: 'node .harness/scripts/verify-on-stop.mjs',
  timeout: 60,
  loop_limit: 3,
  failClosed: true,
};
const data = JSON.parse(readFileSync(dest, 'utf8'));
data.version ??= 1;
data.hooks ??= {};
const list = Array.isArray(data.hooks.stop) ? data.hooks.stop : [];
const has = list.some((entry) => String(entry?.command ?? '').includes('verify-on-stop.mjs'));
if (!has) {
  list.push(hook);
  data.hooks.stop = list;
  writeFileSync(dest, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`MERGE ${dest}`);
} else {
  console.log(`KEEP ${dest}`);
}
EOF
}

wire_runtime_claude() {
  log "RUNTIME claude"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  mkdir -p "$TARGET/.claude/agents"
  if [[ -L "$TARGET/.claude/skills" || ! -e "$TARGET/.claude/skills" ]]; then
    rm -f "$TARGET/.claude/skills" 2>/dev/null || true
    ln -sfn ../.agents/skills "$TARGET/.claude/skills"
    log "LINK $TARGET/.claude/skills"
  else
    log "KEEP $TARGET/.claude/skills"
  fi
  local f base
  for f in "$TARGET/.agents/agents"/asdd-*.md; do
    [[ -f "$f" ]] || continue
    base="$(basename "$f")"
    ln -sfn "../../.agents/agents/$base" "$TARGET/.claude/agents/$base"
    log "LINK $TARGET/.claude/agents/$base"
  done
  if [[ ! -e "$TARGET/.mcp.json" ]]; then
    ln -sfn .agents/mcp/mcp.json "$TARGET/.mcp.json"
    log "LINK $TARGET/.mcp.json"
  else
    log "KEEP $TARGET/.mcp.json"
  fi
  if [[ ! -e "$TARGET/CLAUDE.md" ]]; then
    printf '%s\n' 'Follow [`AGENTS.md`](AGENTS.md) (ASDD + Harness INIT, locks, SoT under `.harness/`).' >"$TARGET/CLAUDE.md"
    log "COPY $TARGET/CLAUDE.md"
  else
    log "KEEP $TARGET/CLAUDE.md"
  fi
}

link_runtime_agent_files() {
  local runtime_dir="$1"
  mkdir -p "$TARGET/$runtime_dir/agents"
  local f base
  for f in "$TARGET/.agents/agents"/asdd-*.md; do
    [[ -f "$f" ]] || continue
    base="$(basename "$f")"
    ln -sfn "../../.agents/agents/$base" "$TARGET/$runtime_dir/agents/$base"
    log "LINK $TARGET/$runtime_dir/agents/$base"
  done
}

link_runtime_skills() {
  local runtime_dir="$1"
  local path="$TARGET/$runtime_dir/skills"
  if [[ -L "$path" || ! -e "$path" ]]; then
    rm -f "$path" 2>/dev/null || true
    ln -sfn ../.agents/skills "$path"
    log "LINK $path"
  else
    log "KEEP $path"
  fi
}

link_runtime_mcp() {
  local target_path="$1"
  local source_path="$2"
  if [[ -L "$target_path" || ! -e "$target_path" ]]; then
    rm -f "$target_path" 2>/dev/null || true
    mkdir -p "$(dirname "$target_path")"
    ln -sfn "$source_path" "$target_path"
    log "LINK $target_path"
  else
    log "KEEP $target_path"
  fi
}

link_runtime_dir() {
  local target_path="$1"
  local source_path="$2"
  if [[ -L "$target_path" || ! -e "$target_path" ]]; then
    rm -f "$target_path" 2>/dev/null || true
    mkdir -p "$(dirname "$target_path")"
    ln -sfn "$source_path" "$target_path"
    log "LINK $target_path"
  else
    log "KEEP $target_path"
  fi
}

wire_runtime_opencode() {
  log "RUNTIME opencode"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  link_runtime_agent_files ".opencode"
  link_runtime_skills ".opencode"
  if [[ ! -e "$TARGET/opencode.json" ]]; then
    cat >"$TARGET/opencode.json" <<'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": ["AGENTS.md"]
}
EOF
    log "COPY $TARGET/opencode.json"
  else
    log "KEEP $TARGET/opencode.json"
  fi
  if command -v node >/dev/null 2>&1 && [[ -f "$TARGET/.agents/mcp/sync-runtime-mcp.cjs" ]]; then
    (cd "$TARGET" && node .agents/mcp/sync-runtime-mcp.cjs)
  else
    log "WARN node or MCP projection script unavailable — skip OpenCode MCP projection"
  fi
}

wire_runtime_kimi() {
  log "RUNTIME kimi"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  mkdir -p "$TARGET/.kimi-code"
  link_runtime_dir "$TARGET/.kimi-code/agents" "../.agents/agents"
  link_runtime_skills ".kimi-code"
  link_runtime_mcp "$TARGET/.kimi-code/mcp.json" "../.agents/mcp/mcp.json"
}

wire_runtime_junie() {
  log "RUNTIME junie"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  link_runtime_agent_files ".junie"
  link_runtime_skills ".junie"
  link_runtime_mcp "$TARGET/.junie/mcp/mcp.json" "../../.agents/mcp/mcp.json"
}

wire_runtime_devin() {
  log "RUNTIME devin"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  link_runtime_agent_files ".devin"
  link_runtime_skills ".devin"
  link_runtime_mcp "$TARGET/.devin/mcp_config.json" "../.agents/mcp/mcp.json"
}

wire_runtime_kiro() {
  log "RUNTIME kiro"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  link_runtime_agent_files ".kiro"
  link_runtime_skills ".kiro"
  link_runtime_mcp "$TARGET/.kiro/settings/mcp.json" "../../.agents/mcp/mcp.json"
}

wire_runtimes() {
  [[ -n "$RUNTIMES" && "$RUNTIMES" != "none" ]] || return 0
  local r
  IFS=',' read -r -a rts <<<"$RUNTIMES"
  for r in "${rts[@]}"; do
    r="$(echo "$r" | tr -d ' ' | tr '[:upper:]' '[:lower:]')"
    case "$r" in
      cursor) wire_runtime_cursor ;;
      claude|claude-code) wire_runtime_claude ;;
      opencode|open-code) wire_runtime_opencode ;;
      kimi|kimi-code) wire_runtime_kimi ;;
      juni|junie) wire_runtime_junie ;;
      devin) wire_runtime_devin ;;
      kiro) wire_runtime_kiro ;;
      none|"") ;;
      *) die "unknown runtime: $r (use cursor|claude|opencode|kimi|junie|devin|kiro)" ;;
    esac
  done
}

verify() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "SKIP verify (dry-run)"
    return
  fi
  if command -v node >/dev/null 2>&1; then
    log "VERIFY node .harness/scripts/check-project-config.mjs"
    (cd "$TARGET" && node .harness/scripts/check-project-config.mjs) || die "project configuration failed"
    log "VERIFY node .harness/scripts/check-invariants.mjs"
    (cd "$TARGET" && node .harness/scripts/check-invariants.mjs) || die "invariants failed"
  else
    log "WARN node not found — skip invariants"
  fi
}

main() {
  resolve_kit
  log "Kit:    $KIT_DIR"
  log "Target: $TARGET"
  [[ "$DRY_RUN" -eq 1 ]] && log "Mode:   dry-run"

  install_portable_steering
  install_bindings
  install_harness_scaffold
  install_project_adapter
  install_agents_core
  remove_runtime_docs
  remove_module_sources
  install_docs_root
  enable_modules
  refresh_skills_index
  wire_runtimes
  verify

  cat <<EOF

Done. Next steps in $TARGET:

  1. Fill bindings (if still stubs):
       .harness/steering/product.md
       .harness/steering/structure.md
       .harness/steering/tech.md
       .harness/steering/domain-layer.project.md
       .harness/steering/quality-gates.project.md
  2. Read AGENTS.md
  3. Start Discovery: .harness/specs/<slice>/intent.md

EOF
}

main
