// `asdd install` options: parsing and help.
import { CliError } from '../paths.mjs';

export const RUNTIMES = ['cursor', 'claude', 'opencode', 'kimi', 'junie', 'devin', 'kiro'];
export const MODULES = ['bruno', 'playwright-e2e', 'web-ui', 'http-api'];

export const INSTALL_HELP = `Install or upgrade asdd-harness-kit in an existing repository.

Usage:
  asdd install <target-dir> [options]
  asdd install --interactive

Options:
  -i, --interactive       Prompt for target, runtimes, modules (default in TTY)
  --no-interactive        Never prompt, even in TTY
  --from-git              Clone the kit into a temp dir and install from it
  --kit-dir <path>        Kit source (default: the kit this CLI belongs to)
  --modules=<list>        bruno,playwright-e2e,web-ui,http-api — or "all"
  --runtime=<name>        cursor | claude | opencode | kimi | junie | devin | kiro
                          comma-separated values or none (default: none)
  --force                 Overwrite portable kit files that already exist
  --force-bindings        Overwrite product/structure/tech/*.project.md (DANGEROUS)
  --force-mcp             Replace .agents/mcp/mcp.json with the empty project seed (tools/* MCP servers stay in the kit)
  --skip-bindings         Do not create binding stubs
  --skip-docs             Skip AGENTS.md / docs copy
  --skip-deps             No effect (kept for scripts): the harness installs no npm packages
  --rehome-colliding-skills
                          Recovery UX for skill collisions: move consumer-authored
                          skill dirs that collide with kit names to
                          .agents/skills.local/<name>/ (preserved, not scanned),
                          then proceed. Never overwrites consumer files.
  --dry-run               Print actions only
  --pr                    In a git repository: install on a new branch from origin's default branch,
                          commit, push, and open a pull request with gh (the working tree must be clean)
  --json                  Print one JSON object on stdout (the result, or the error) instead of progress lines
  -h, --help              Show help

Safe defaults: never overwrites existing bindings, PROGRESS, slice state, specs,
or mcp.json. Kit-owned files are refreshed when their version changes, except a
file this project changed since the kit wrote it (SKIP; --force overwrites).
An older kit than the one installed is refused (--force downgrades).
Bindings still kept unless --force-bindings. Undo with: asdd uninstall <dir>.
`;

const FLAGS = {
  '-i': 'interactive',
  '--interactive': 'interactive',
  '--no-interactive': 'noInteractive',
  '--dry-run': 'dryRun',
  '--from-git': 'fromGit',
  '--force': 'force',
  '--force-bindings': 'forceBindings',
  '--force-mcp': 'forceMcp',
  '--skip-bindings': 'skipBindings',
  '--skip-docs': 'skipDocs',
  '--skip-deps': 'skipDeps',
  '--rehome-colliding-skills': 'rehomeColliding',
  '--pr': 'pr',
  '--json': 'json',
};
const VALUES = { '--kit-dir': 'kitDir', '--modules': 'modules', '--runtime': 'runtimes' };

/** @returns {Record<string, any>} the parsed options; `help: true` when help was asked for. */
export function parseInstallArgs(argv) {
  const o = { modules: '', runtimes: '', kitDir: '', target: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') return { ...o, help: true };
    if (FLAGS[arg]) {
      o[FLAGS[arg]] = true;
      continue;
    }
    const eq = arg.indexOf('=');
    const name = eq > 0 ? arg.slice(0, eq) : arg;
    if (VALUES[name]) {
      const value = eq > 0 ? arg.slice(eq + 1) : argv[(i += 1)];
      if (!value && (eq < 0 || name === '--kit-dir')) throw new CliError(`${name} needs a ${name === '--kit-dir' ? 'path' : 'value'}`);
      o[VALUES[name]] = value ?? '';
      continue;
    }
    if (arg.startsWith('-')) throw new CliError(`unknown option: ${arg}`);
    if (o.target) throw new CliError(`unexpected argument: ${arg}`);
    o.target = arg;
  }
  return o;
}

/** Comma list → trimmed, non-empty entries. */
export const list = (value) =>
  String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
