#!/usr/bin/env bash
# Install / upgrade asdd-harness-kit into an existing project.
#
# Usage:
#   ./scripts/install-into.sh <target-dir> [options]
#   ./scripts/install-into.sh /path/to/repo --modules=http-api,web-ui --runtime=cursor
#
# Interactive (prompts when run in a TTY without explicit target):
#   ./scripts/install-into.sh --interactive
#
# Piped (clones kit temporarily):
#   curl -fsSL https://raw.githubusercontent.com/eencinasq/asdd-harness-kit/main/scripts/install-into.sh \
#     | bash -s -- /path/to/repo --from-git --modules=http-api --runtime=cursor
#
set -euo pipefail

KIT_REMOTE_DEFAULT="${ASDD_KIT_REMOTE:-https://github.com/eencinasq/asdd-harness-kit.git}"
KIT_REF_DEFAULT="${ASDD_KIT_REF:-main}"

# ------------------------------------------------------------------
# Colors / UI helpers
# ------------------------------------------------------------------
if [[ -t 1 && "${NO_COLOR:-}" != "1" ]]; then
  C_RESET='\033[0m'; C_BOLD='\033[1m'; C_DIM='\033[2m'
  C_RED='\033[31m'; C_GREEN='\033[32m'; C_YELLOW='\033[33m'
  C_BLUE='\033[34m'; C_CYAN='\033[36m'; C_WHITE='\033[37m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''
  C_RED=''; C_GREEN=''; C_YELLOW=''
  C_BLUE=''; C_CYAN=''; C_WHITE=''
fi

log()   { printf '%b\n' "$*"; }
info()  { printf '%b%s%b\n' "${C_BLUE}→${C_RESET} " "$*" ''; }
ok()    { printf '%b%s%b\n' "${C_GREEN}✓${C_RESET} " "$*" ''; }
warn()  { printf '%b%s%b\n' "${C_YELLOW}⚠${C_RESET} " "$*" ''; }
err()   { printf '%b%s%b\n' "${C_RED}✗${C_RESET} " "$*" ''; }
die()   { err "$*"; exit 1; }

section() {
  printf '\n%b==== %s ====%b\n' "${C_BOLD}${C_WHITE}" "$*" "${C_RESET}"
}

# ------------------------------------------------------------------
# Usage
# ------------------------------------------------------------------
usage() {
  cat <<'EOF'
Install asdd-harness-kit into an existing repository.

Usage:
  ./scripts/install-into.sh <target-dir> [options]
  ./scripts/install-into.sh --interactive

Options:
  -i, --interactive       Prompt for target, runtimes, modules (default in TTY)
  --no-interactive        Never prompt, even in TTY
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

# ------------------------------------------------------------------
# State
# ------------------------------------------------------------------
DRY_RUN=0
FROM_GIT=0
FORCE=0
FORCE_BINDINGS=0
FORCE_MCP=0
SKIP_BINDINGS=0
SKIP_DOCS=0
INTERACTIVE=0
NO_INTERACTIVE=0
MODULES=""
RUNTIMES=""
KIT_DIR=""
TARGET=""
TMP_KIT=""
KIT_VERSIONS=""
INSTALLED_VERSIONS=""

# ------------------------------------------------------------------
# Interactive helpers
# ------------------------------------------------------------------
is_tty() { [[ -t 0 && -t 1 ]]; }

prompt() {
  local text="$1" default="${2:-}"
  if [[ -n "$default" ]]; then
    printf '%b%s%b [%s]: ' "${C_CYAN}" "$text" "${C_RESET}" "$default"
  else
    printf '%b%s%b: ' "${C_CYAN}" "$text" "${C_RESET}"
  fi
  local reply
  read -r reply
  if [[ -z "$reply" && -n "$default" ]]; then
    reply="$default"
  fi
  printf '%s\n' "$reply"
}

prompt_yn() {
  local text="$1" default="${2:-y}"
  local prompt_text
  if [[ "$default" == "y" ]]; then
    prompt_text="$text [Y/n]"
  else
    prompt_text="$text [y/N]"
  fi
  local reply
  reply="$(prompt "$prompt_text")"
  [[ -z "$reply" ]] && reply="$default"
  [[ "$reply" == [Yy]* ]]
}

pick_many() {
  local header="$1" ; shift
  local opts=("$@")
  log ""
  log "${C_BOLD}${header}${C_RESET}"
  local i
  for i in "${!opts[@]}"; do
    printf '  %b[%d]%b %s\n' "${C_DIM}" "$((i+1))" "${C_RESET}" "${opts[$i]}"
  done
  log "  ${C_DIM}[0] none${C_RESET}"
  local reply
  reply="$(prompt "Enter numbers separated by commas (e.g. 1,3)")"
  if [[ -z "$reply" || "$reply" == "0" ]]; then
    echo ""
    return
  fi
  local out="" idx
  local IFS=','; read -r -a nums <<< "$reply"
  for n in "${nums[@]}"; do
    n="$(echo "$n" | tr -d ' ')"
    idx=$((n-1))
    if [[ "$idx" -ge 0 && "$idx" -lt "${#opts[@]}" ]]; then
      [[ -n "$out" ]] && out="$out,"
      out="$out${opts[$idx]}"
    fi
  done
  echo "$out"
}

# ------------------------------------------------------------------
# Argument parsing
# ------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    -i|--interactive) INTERACTIVE=1; shift ;;
    --no-interactive) NO_INTERACTIVE=1; shift ;;
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

# Auto-enable interactive when TTY, no target, and not explicitly disabled
if [[ "$NO_INTERACTIVE" -eq 0 && -z "$TARGET" && "$INTERACTIVE" -eq 0 ]]; then
  if is_tty; then
    INTERACTIVE=1
  else
    { usage; die "target directory required (or use --interactive in a TTY)"; }
  fi
fi

# ------------------------------------------------------------------
# Cleanup
# ------------------------------------------------------------------
cleanup() {
  if [[ -n "${TMP_KIT:-}" && -d "${TMP_KIT}" ]]; then
    rm -rf "${TMP_KIT}"
  fi
}
trap cleanup EXIT

# ------------------------------------------------------------------
# Resolve kit source
# ------------------------------------------------------------------
resolve_kit() {
  if [[ "$FROM_GIT" -eq 1 ]]; then
    TMP_KIT="$(mktemp -d "${TMPDIR:-/tmp}/asdd-kit.XXXXXX")"
    info "Cloning $KIT_REMOTE_DEFAULT ($KIT_REF_DEFAULT) → $TMP_KIT"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      if [[ -f "$(cd "$(dirname "$0")/.." && pwd)/.harness/steering/domain-layer.md" ]]; then
        KIT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
        info "DRY-RUN from-git: using local kit $KIT_DIR"
        TMP_KIT=""
        return
      fi
      # Dry-run from a curl pipe with no local kit — we must clone to inspect files
      info "DRY-RUN from-git: cloning for file inspection"
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

# ------------------------------------------------------------------
# Interactive flow
# ------------------------------------------------------------------
detect_existing_runtimes() {
  local t="$1" found=""
  local -a runtimes=(cursor claude opencode kimi junie devin kiro)
  for r in "${runtimes[@]}"; do
    local dir=""
    case "$r" in
      cursor) dir="$t/.cursor" ;;
      claude) dir="$t/.claude" ;;
      opencode) dir="$t/.opencode" ;;
      kimi) dir="$t/.kimi-code" ;;
      junie) dir="$t/.junie" ;;
      devin) dir="$t/.devin" ;;
      kiro) dir="$t/.kiro" ;;
    esac
    [[ -d "$dir" ]] && found="$found${found:+,}$r"
  done
  echo "$found"
}

suggest_project_name() {
  local t="$1" name=""
  if [[ -d "$t/.git" ]]; then
    name="$(cd "$t" && git remote get-url origin 2>/dev/null | sed -n 's|.*/\([^/]*\)\.git|\1|p')"
  fi
  if [[ -z "$name" ]]; then
    name="$(basename "$t" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9][^a-z0-9]*/-/g; s/^-//; s/-$//')"
  fi
  echo "${name:-project}"
}

preflight_checks() {
  section "Pre-flight checks"
  local issues=0

  if ! command -v git >/dev/null 2>&1; then
    err "git is not installed"
    issues=$((issues+1))
  else
    ok "git found"
  fi

  if ! command -v node >/dev/null 2>&1; then
    warn "Node.js not found — verify step will be skipped"
    warn "  Install Node.js to enable harness invariant checks"
  else
    ok "Node.js found"
  fi

  if [[ -d "$TARGET/.harness" ]]; then
    warn "Existing .harness/ detected in target"
    if [[ "$FORCE" -eq 0 && "$INTERACTIVE" -eq 1 ]]; then
      if prompt_yn "Refresh existing portable files?" "n"; then
        FORCE=1
      fi
    fi
  fi

  if [[ "$issues" -gt 0 ]]; then
    die "Pre-flight checks failed"
  fi
}

run_interactive() {
  section "ASDD + Harness Kit Installer"
  log "${C_DIM}This wizard will guide you through installing the kit.${C_RESET}"

  # Target directory
  local default_target="$(pwd)"
  local reply
  reply="$(prompt "Target directory" "$default_target")"
  TARGET="$reply"
  TARGET="$(cd "$TARGET" 2>/dev/null && pwd)" || die "target not found: $reply"

  # Detect existing harness / runtimes
  local existing_runtimes
  existing_runtimes="$(detect_existing_runtimes "$TARGET")"

  # Runtimes
  log ""
  if [[ -n "$existing_runtimes" ]]; then
    info "Detected existing runtime directories: ${existing_runtimes}"
    if prompt_yn "Wire these runtimes?" "y"; then
      RUNTIMES="$existing_runtimes"
    fi
  fi
  if [[ -z "$RUNTIMES" ]]; then
    local picked
    picked="$(pick_many "Select IDE runtimes to wire:" cursor claude opencode kimi junie devin kiro)"
    RUNTIMES="$picked"
  fi
  [[ -z "$RUNTIMES" ]] && info "No runtimes selected — you can wire them later."

  # Modules
  local mod_picked
  mod_picked="$(pick_many "Select optional modules to enable:" bruno playwright-e2e web-ui http-api)"
  if [[ -n "$mod_picked" ]]; then
    MODULES="$mod_picked"
  else
    info "No modules selected — enable later with install-into.sh <target> --modules=<name>"
  fi

  # Force
  if [[ "$FORCE" -eq 0 ]]; then
    if prompt_yn "Force-refresh existing portable files (steering, agents, skills)?" "n"; then
      FORCE=1
    fi
  fi

  # Dry-run preview
  log ""
  if prompt_yn "Preview changes (dry-run) first?" "n"; then
    DRY_RUN=1
  fi
}

# ------------------------------------------------------------------
# Version tracking
# ------------------------------------------------------------------
init_version_tracking() {
  KIT_VERSIONS="$KIT_DIR/.harness/config/versions.json"
  INSTALLED_VERSIONS="$TARGET/.harness/config/installed-versions.json"
}

artifact_version() {
  local manifest="$1" rel_path="$2"
  if [[ -f "$manifest" ]] && command -v node >/dev/null 2>&1; then
    node -e "
      try {
        const v = require('$manifest');
        const path = '$rel_path';
        process.stdout.write(String(v.artifacts?.[path] || ''));
      } catch { process.stdout.write(''); }
    "
  fi
}

file_needs_update() {
  local src="$1"
  local rel_path="${src#$KIT_DIR/}"
  if [[ ! -f "$KIT_VERSIONS" ]] || [[ ! -f "$INSTALLED_VERSIONS" ]]; then
    return 1
  fi
  local kit_ver inst_ver
  kit_ver="$(artifact_version "$KIT_VERSIONS" "$rel_path")"
  inst_ver="$(artifact_version "$INSTALLED_VERSIONS" "$rel_path")"
  if [[ -z "$kit_ver" ]] || [[ -z "$inst_ver" ]]; then
    return 1
  fi
  [[ "$kit_ver" != "$inst_ver" ]]
}

# ------------------------------------------------------------------
# File operations
# ------------------------------------------------------------------
copy_file() {
  local src="$1" dest="$2" policy="${3:-create}"
  [[ -f "$src" ]] || die "missing kit file: $src"

  local do_copy=0
  if [[ ! -e "$dest" ]]; then
    do_copy=1
  elif [[ "$policy" == "refresh" && "$FORCE" -eq 1 ]]; then
    do_copy=1
  elif [[ "$policy" == "refresh" ]]; then
    if file_needs_update "$src"; then
      do_copy=1
    fi
  fi

  if [[ "$do_copy" -eq 0 ]]; then
    log "${C_DIM}KEEP${C_RESET}  $dest"
    return 0
  fi
  log "${C_BLUE}COPY${C_RESET}  $dest"
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
    [[ "$rel" == .DS_Store ]] && continue
    local_src="$src/$rel"
    local_dest="$dest/$rel"
    copy_file "$local_src" "$local_dest" "$policy"
  done < <(cd "$src" && find . -type f -print0)
}

# ------------------------------------------------------------------
# Install phases
# ------------------------------------------------------------------
install_portable_steering() {
  local f
  for f in domain-layer.md quality-gates.md manifest.md session-loop.md asdd-lite.md \
           codegraph.md codegraph-agents.md skills.md security-rules.md controls.md README.md; do
    copy_file "$KIT_DIR/.harness/steering/$f" "$TARGET/.harness/steering/$f" refresh
  done
  copy_tree "$KIT_DIR/.harness/steering/templates" "$TARGET/.harness/steering/templates" refresh
}

install_bindings() {
  [[ "$SKIP_BINDINGS" -eq 1 ]] && { info "Skipping bindings"; return 0; }
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
  copy_file "$KIT_DIR/.harness/scripts/harness-status.mjs" "$TARGET/.harness/scripts/harness-status.mjs" refresh
  copy_file "$KIT_DIR/.harness/scripts/init-slice.mjs" "$TARGET/.harness/scripts/init-slice.mjs" refresh
  copy_file "$KIT_DIR/.harness/config/project.schema.json" "$TARGET/.harness/config/project.schema.json" refresh
  copy_file "$KIT_DIR/.harness/config/README.md" "$TARGET/.harness/config/README.md" refresh
  copy_file "$KIT_DIR/.harness/features/feature_list.schema.json" "$TARGET/.harness/features/feature_list.schema.json" refresh
  copy_file "$KIT_DIR/.harness/features/feature.schema.json" "$TARGET/.harness/features/feature.schema.json" refresh
  copy_file "$KIT_DIR/scripts/harness-migrate.mjs" "$TARGET/scripts/harness-migrate.mjs" refresh
  copy_tree "$KIT_DIR/.harness/scripts/validators" "$TARGET/.harness/scripts/validators" refresh
  copy_file "$KIT_DIR/.harness/config/versions.json" "$TARGET/.harness/config/versions.json" refresh
  copy_file "$KIT_DIR/.harness/PROGRESS.md" "$TARGET/.harness/PROGRESS.md" create
  copy_file "$KIT_DIR/.harness/state/manifest.json" "$TARGET/.harness/state/manifest.json" create
  copy_file "$KIT_DIR/.harness/state/locks/README.md" "$TARGET/.harness/state/locks/README.md" create

  local d
  for d in specs features progress state/slices state/archive; do
    if [[ "$DRY_RUN" -eq 1 ]]; then
      log "${C_DIM}DIR${C_RESET}   $TARGET/.harness/$d"
      continue
    fi
    mkdir -p "$TARGET/.harness/$d"
    if [[ ! -e "$TARGET/.harness/$d/README.md" && -f "$KIT_DIR/.harness/$d/README.md" ]]; then
      cp "$KIT_DIR/.harness/$d/README.md" "$TARGET/.harness/$d/README.md"
      log "${C_BLUE}COPY${C_RESET}  $TARGET/.harness/$d/README.md"
    fi
  done
}

kit_version() {
  if command -v node >/dev/null 2>&1; then
    node -e "try { const p=require('$KIT_DIR/package.json'); process.stdout.write(p.version||'2.0.0'); } catch { process.stdout.write('2.0.0'); }"
  else
    echo "2.0.0"
  fi
}

install_project_adapter() {
  local config="$TARGET/.harness/config/project.json"
  local kit_ver
  kit_ver="$(kit_version)"
  local installed_at
  installed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  if [[ -e "$config" ]]; then
    if command -v node >/dev/null 2>&1; then
      log "${C_BLUE}MERGE${C_RESET}  $config (kit.version + kit.installed_at)"
      [[ "$DRY_RUN" -eq 1 ]] && return 0
      node --input-type=module - "$config" "$kit_ver" "$installed_at" <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs';
const [dest, kitVer, installedAt] = process.argv.slice(2);
const data = JSON.parse(readFileSync(dest, 'utf8'));
data.kit ??= {};
data.kit.version = kitVer;
data.kit.installed_at = installedAt;
writeFileSync(dest, `${JSON.stringify(data, null, 2)}\n`);
EOF
      return 0
    fi
    log "${C_DIM}KEEP${C_RESET}  $config (node unavailable — cannot patch kit.version)"
    return 0
  fi

  local project_id
  project_id="$(suggest_project_name "$TARGET")"
  [[ -n "$project_id" ]] || project_id="project"
  log "${C_BLUE}CREATE${C_RESET} $config"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  mkdir -p "$(dirname "$config")"
  cat >"$config" <<EOF
{
  "schema_version": "1.0",
  "project_id": "$project_id",
  "kit": {
    "name": "asdd-harness-kit",
    "source": "$KIT_REMOTE_DEFAULT",
    "ref": "$KIT_REF_DEFAULT",
    "version": "$kit_ver",
    "installed_at": "$installed_at"
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
  # Scaffold domain model and operational logs
  copy_file "$KIT_DIR/docs/architecture/domain-model.md" "$TARGET/docs/architecture/domain-model.md" create
  copy_file "$KIT_DIR/docs/agent-failure-log.md" "$TARGET/docs/agent-failure-log.md" create
  copy_file "$KIT_DIR/docs/dissent-log.md" "$TARGET/docs/dissent-log.md" create
}

remove_runtime_docs() {
  if [[ ! -e "$TARGET/runtimes/README.md" ]]; then
    return 0
  fi
  # Safety: only remove if the README identifies this as the kit's runtime recipes
  if ! grep -q "asdd-harness-kit\|runtime recipes\|ASDD" "$TARGET/runtimes/README.md" 2>/dev/null; then
    warn "$TARGET/runtimes/README.md does not look like kit runtime recipes — skipping removal"
    return 0
  fi
  log "${C_YELLOW}REMOVE${C_RESET} $TARGET/runtimes (runtime recipes remain in asdd-harness-kit)"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  rm -rf "$TARGET/runtimes"
}

remove_module_sources() {
  if [[ -e "$TARGET/.agents/modules" ]]; then
    log "${C_YELLOW}REMOVE${C_RESET} $TARGET/.agents/modules (modules remain in asdd-harness-kit)"
    if [[ "$DRY_RUN" -eq 0 ]]; then
      rm -rf "$TARGET/.agents/modules"
    fi
  fi
  if [[ -e "$TARGET/scripts/enable-module.sh" ]]; then
    log "${C_YELLOW}REMOVE${C_RESET} $TARGET/scripts/enable-module.sh (use the kit installer to enable modules)"
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
    info "Skills index name+description (dry-run)"
    return 0
  fi
  if [[ ! -f "$TARGET/.harness/scripts/check-skills-index.mjs" ]]; then
    warn "Skills index script missing — skipping"
    return 0
  fi
  info "Updating skills index"
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
    log "${C_BOLD}MODULE${C_RESET} $m"
    local old_force=$FORCE
    FORCE=1
    enable_one_module "$m"
    FORCE=$old_force
  done

  # Record enabled modules in project.json
  local config="$TARGET/.harness/config/project.json"
  if [[ -f "$config" ]] && command -v node >/dev/null 2>&1; then
    node --input-type=module - "$config" "$list" <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs';
const [dest, moduleList] = process.argv.slice(2);
const data = JSON.parse(readFileSync(dest, 'utf8'));
data.modules ??= {};
for (const m of moduleList.split(',')) {
  const key = m.trim();
  if (key) data.modules[key] = true;
}
writeFileSync(dest, `${JSON.stringify(data, null, 2)}\n`);
EOF
  fi
}

# ------------------------------------------------------------------
# Runtime wiring
# ------------------------------------------------------------------
wire_runtime_cursor() {
  log "${C_BOLD}RUNTIME${C_RESET} cursor"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  mkdir -p "$TARGET/.cursor/agents" "$TARGET/.cursor/rules"
  if [[ -L "$TARGET/.cursor/skills" || ! -e "$TARGET/.cursor/skills" ]]; then
    rm -f "$TARGET/.cursor/skills" 2>/dev/null || true
    ln -sfn ../.agents/skills "$TARGET/.cursor/skills"
    log "${C_BLUE}LINK${C_RESET}  $TARGET/.cursor/skills → ../.agents/skills"
  else
    log "${C_DIM}KEEP${C_RESET}  $TARGET/.cursor/skills"
  fi
  local f base
  for f in "$TARGET/.agents/agents"/asdd-*.md; do
    [[ -f "$f" ]] || continue
    base="$(basename "$f")"
    ln -sfn "../../.agents/agents/$base" "$TARGET/.cursor/agents/$base"
    log "${C_BLUE}LINK${C_RESET}  $TARGET/.cursor/agents/$base"
  done
  if [[ ! -e "$TARGET/.cursor/mcp.json" ]]; then
    ln -sfn ../.agents/mcp/mcp.json "$TARGET/.cursor/mcp.json"
    log "${C_BLUE}LINK${C_RESET}  $TARGET/.cursor/mcp.json"
  else
    log "${C_DIM}KEEP${C_RESET}  $TARGET/.cursor/mcp.json"
  fi
  copy_file "$KIT_DIR/runtimes/cursor/asdd-steering.mdc" "$TARGET/.cursor/rules/asdd-steering.mdc" refresh
  install_cursor_verify_hook
}

install_cursor_verify_hook() {
  local dest="$TARGET/.cursor/hooks.json"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "${C_DIM}HOOK${C_RESET}  $dest stop → node .harness/scripts/verify-on-stop.mjs"
    return 0
  fi
  if ! command -v node >/dev/null 2>&1; then
    warn "Node.js not found — skipping Cursor verify-on-stop hook merge"
    if [[ ! -e "$dest" ]]; then
      cp "$KIT_DIR/.cursor/hooks.json" "$dest"
      log "${C_BLUE}COPY${C_RESET}  $dest"
    fi
    return 0
  fi
  mkdir -p "$TARGET/.cursor"
  if [[ ! -e "$dest" ]]; then
    cp "$KIT_DIR/.cursor/hooks.json" "$dest"
    log "${C_BLUE}COPY${C_RESET}  $dest"
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
  log "${C_BOLD}RUNTIME${C_RESET} claude"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  mkdir -p "$TARGET/.claude/agents"
  if [[ -L "$TARGET/.claude/skills" || ! -e "$TARGET/.claude/skills" ]]; then
    rm -f "$TARGET/.claude/skills" 2>/dev/null || true
    ln -sfn ../.agents/skills "$TARGET/.claude/skills"
    log "${C_BLUE}LINK${C_RESET}  $TARGET/.claude/skills"
  else
    log "${C_DIM}KEEP${C_RESET}  $TARGET/.claude/skills"
  fi
  local f base
  for f in "$TARGET/.agents/agents"/asdd-*.md; do
    [[ -f "$f" ]] || continue
    base="$(basename "$f")"
    ln -sfn "../../.agents/agents/$base" "$TARGET/.claude/agents/$base"
    log "${C_BLUE}LINK${C_RESET}  $TARGET/.claude/agents/$base"
  done
  if [[ ! -e "$TARGET/.mcp.json" ]]; then
    ln -sfn .agents/mcp/mcp.json "$TARGET/.mcp.json"
    log "${C_BLUE}LINK${C_RESET}  $TARGET/.mcp.json"
  else
    log "${C_DIM}KEEP${C_RESET}  $TARGET/.mcp.json"
  fi
  if [[ ! -e "$TARGET/CLAUDE.md" ]]; then
    printf '%s\n' 'Follow [`AGENTS.md`](AGENTS.md) (ASDD + Harness INIT, locks, SoT under `.harness/`).' >"$TARGET/CLAUDE.md"
    log "${C_BLUE}COPY${C_RESET}  $TARGET/CLAUDE.md"
  else
    log "${C_DIM}KEEP${C_RESET}  $TARGET/CLAUDE.md"
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
    log "${C_BLUE}LINK${C_RESET}  $TARGET/$runtime_dir/agents/$base"
  done
}

link_runtime_skills() {
  local runtime_dir="$1"
  local path="$TARGET/$runtime_dir/skills"
  if [[ -L "$path" || ! -e "$path" ]]; then
    rm -f "$path" 2>/dev/null || true
    ln -sfn ../.agents/skills "$path"
    log "${C_BLUE}LINK${C_RESET}  $path"
  else
    log "${C_DIM}KEEP${C_RESET}  $path"
  fi
}

link_runtime_mcp() {
  local target_path="$1"
  local source_path="$2"
  if [[ -L "$target_path" || ! -e "$target_path" ]]; then
    rm -f "$target_path" 2>/dev/null || true
    mkdir -p "$(dirname "$target_path")"
    ln -sfn "$source_path" "$target_path"
    log "${C_BLUE}LINK${C_RESET}  $target_path"
  else
    log "${C_DIM}KEEP${C_RESET}  $target_path"
  fi
}

link_runtime_dir() {
  local target_path="$1"
  local source_path="$2"
  if [[ -L "$target_path" || ! -e "$target_path" ]]; then
    rm -f "$target_path" 2>/dev/null || true
    mkdir -p "$(dirname "$target_path")"
    ln -sfn "$source_path" "$target_path"
    log "${C_BLUE}LINK${C_RESET}  $target_path"
  else
    log "${C_DIM}KEEP${C_RESET}  $target_path"
  fi
}

wire_runtime_opencode() {
  log "${C_BOLD}RUNTIME${C_RESET} opencode"
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
    log "${C_BLUE}COPY${C_RESET}  $TARGET/opencode.json"
  else
    log "${C_DIM}KEEP${C_RESET}  $TARGET/opencode.json"
  fi
  if command -v node >/dev/null 2>&1 && [[ -f "$TARGET/.agents/mcp/sync-runtime-mcp.cjs" ]]; then
    (cd "$TARGET" && node .agents/mcp/sync-runtime-mcp.cjs)
  else
    warn "Node or MCP projection script unavailable — skip OpenCode MCP projection"
  fi
}

wire_runtime_kimi() {
  log "${C_BOLD}RUNTIME${C_RESET} kimi"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  mkdir -p "$TARGET/.kimi-code"
  link_runtime_dir "$TARGET/.kimi-code/agents" "../.agents/agents"
  link_runtime_skills ".kimi-code"
  link_runtime_mcp "$TARGET/.kimi-code/mcp.json" "../.agents/mcp/mcp.json"
}

wire_runtime_junie() {
  log "${C_BOLD}RUNTIME${C_RESET} junie"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  link_runtime_agent_files ".junie"
  link_runtime_skills ".junie"
  link_runtime_mcp "$TARGET/.junie/mcp/mcp.json" "../../.agents/mcp/mcp.json"
}

wire_runtime_devin() {
  log "${C_BOLD}RUNTIME${C_RESET} devin"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  link_runtime_agent_files ".devin"
  link_runtime_skills ".devin"
  link_runtime_mcp "$TARGET/.devin/mcp_config.json" "../.agents/mcp/mcp.json"
}

wire_runtime_kiro() {
  log "${C_BOLD}RUNTIME${C_RESET} kiro"
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

# ------------------------------------------------------------------
# Version manifest
# ------------------------------------------------------------------
install_version_manifest() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "${C_DIM}COPY${C_RESET}  $TARGET/.harness/config/installed-versions.json"
    return 0
  fi
  if [[ -f "$KIT_VERSIONS" ]]; then
    mkdir -p "$(dirname "$INSTALLED_VERSIONS")"
    cp "$KIT_VERSIONS" "$INSTALLED_VERSIONS"
    log "${C_BLUE}COPY${C_RESET}  $INSTALLED_VERSIONS"
  else
    warn "Kit version manifest not found — skipping version tracking"
  fi
}

# ------------------------------------------------------------------
# Verify
# ------------------------------------------------------------------
verify() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    info "Skipping verify (dry-run)"
    return
  fi
  if command -v node >/dev/null 2>&1; then
    info "Verifying project configuration"
    (cd "$TARGET" && node .harness/scripts/check-project-config.mjs) || die "project configuration failed"
    info "Verifying harness invariants"
    (cd "$TARGET" && node .harness/scripts/check-invariants.mjs) || die "invariants failed"
  else
    warn "Node.js not found — skipping invariant checks"
  fi
}

# ------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------
print_summary() {
  section "Summary"
  ok "Kit installed into $TARGET"
  log ""
  log "${C_BOLD}Installed:${C_RESET}"
  log "  • Portable steering contracts  → .harness/steering/"
  log "  • Agent definitions            → .agents/agents/"
  log "  • Skills catalog               → .agents/skills/"
  log "  • Harness scripts              → .harness/scripts/"
  log "  • Project adapter              → .harness/config/project.json"

  if [[ -n "$RUNTIMES" && "$RUNTIMES" != "none" ]]; then
    log "  • Runtime wiring               → $RUNTIMES"
  fi
  if [[ -n "$MODULES" ]]; then
    log "  • Modules enabled              → $MODULES"
  fi

  log ""
  log "${C_BOLD}Next steps:${C_RESET}"
  log "  1. Fill bindings (if still stubs):"
  log "       .harness/steering/product.md"
  log "       .harness/steering/structure.md"
  log "       .harness/steering/tech.md"
  log "       .harness/steering/domain-layer.project.md"
  log "       .harness/steering/quality-gates.project.md"
  log "  2. Read AGENTS.md"
  log "  3. Start Discovery: .harness/specs/<slice>/intent.md"

  if [[ -n "$RUNTIMES" && "$RUNTIMES" != "none" ]]; then
    log ""
    log "${C_DIM}Runtime-specific notes:${C_RESET}"
    if [[ "$RUNTIMES" == *cursor* ]]; then
      log "  Cursor:  verify-on-stop hook active in .cursor/hooks.json"
    fi
    if [[ "$RUNTIMES" == *claude* ]]; then
      log "  Claude:  read CLAUDE.md for session instructions"
    fi
    if [[ "$RUNTIMES" == *opencode* ]]; then
      log "  OpenCode: config written to opencode.json"
    fi
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log ""
    warn "This was a dry-run. Re-run without --dry-run to apply."
  fi
}

# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------
main() {
  resolve_kit

  if [[ "$INTERACTIVE" -eq 1 ]]; then
    run_interactive
  fi

  [[ -n "$TARGET" ]] || { usage; die "target directory required"; }
  TARGET="$(cd "$TARGET" 2>/dev/null && pwd)" || die "target not found: $TARGET"
  init_version_tracking

  if [[ "$INTERACTIVE" -eq 1 ]]; then
    preflight_checks
    log ""
    if ! prompt_yn "Proceed with installation?" "y"; then
      info "Aborted."
      exit 0
    fi
  fi

  section "Installing asdd-harness-kit"
  log "${C_DIM}Kit:${C_RESET}    $KIT_DIR"
  log "${C_DIM}Target:${C_RESET} $TARGET"
  [[ "$DRY_RUN" -eq 1 ]] && log "${C_DIM}Mode:${C_RESET}   dry-run"

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
  install_version_manifest
  verify

  print_summary
}

main
