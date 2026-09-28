#!/usr/bin/env bash
# Enable an optional module: bruno | playwright-e2e | web-ui | http-api
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOD="${1:-}"
if [[ -z "$MOD" ]]; then
  echo "Usage: $0 <bruno|playwright-e2e|web-ui|http-api>"
  exit 1
fi
case "$MOD" in
  bruno)
    cp "$ROOT/.agents/modules/bruno/asdd-integration-tester.md" "$ROOT/.agents/agents/"
    echo "Installed asdd-integration-tester. Add api-test.md steering if needed."
    ;;
  playwright-e2e)
    cp "$ROOT/.agents/modules/playwright-e2e/asdd-e2e-tester.md" "$ROOT/.agents/agents/"
    echo "Installed asdd-e2e-tester. Add playwright to .agents/mcp/mcp.json."
    ;;
  web-ui)
    cp -R "$ROOT/.agents/modules/web-ui/skills/"* "$ROOT/.agents/skills/"
    echo "Installed frontend-ui-engineering + browser-testing-with-devtools. Fill design-system.md."
    ;;
  http-api)
    cp -R "$ROOT/.agents/modules/http-api/skills/"* "$ROOT/.agents/skills/"
    echo "Installed api-and-interface-design."
    ;;
  *)
    echo "Unknown module: $MOD"
    exit 1
    ;;
esac
echo "Re-run runtime symlinks: see runtimes/README.md"
