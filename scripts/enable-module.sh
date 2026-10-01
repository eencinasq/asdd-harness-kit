#!/usr/bin/env bash
# Enable optional modules in a consuming project from this kit.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-}"
MOD="${2:-}"
if [[ -z "$TARGET" || -z "$MOD" ]]; then
  echo "Usage: $0 <target-dir> <bruno|playwright-e2e|web-ui|http-api>[,...] [install options]"
  exit 1
fi
shift 2
exec "$ROOT/scripts/install-into.sh" "$TARGET" --modules="$MOD" "$@"
