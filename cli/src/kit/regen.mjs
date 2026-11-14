// `asdd kit regen [scope] [--check] [--json]` — the generator umbrella (D-6/G-4). The registry's `generators`
// section is the fleet's source of truth: each {id → run, check, owns}. Bare `kit regen` runs every kit-side
// generator; a scope selects one generator id or all generators owning a contribution class. `--check` runs each
// registered staleness check instead of the run command.
import { spawnSync } from 'node:child_process';
import { loadRegistry } from '../install/registry.mjs';
import { KIT_ROOT } from '../paths.mjs';
import { CliError } from '../paths.mjs';
import { err, ok, section, warn } from '../ui.mjs';

const BIN = join(KIT_ROOT, 'cli/bin/asdd.mjs');
import { join } from 'node:path';

// Project-side or session-driven entries are registry-visible but not part of the umbrella: install needs a
// target dir, harness-profile a slice id. Everything else regenerates kit artifacts in dependency order.
const EXCLUDE = new Set(['install', 'harness-profile']);
const ORDER = ['build', 'skills-index', 'runtime-steering', 'vendor', 'self', 'versions', 'sync-state', 'learn', 'sync-knowledge'];
// `check` values that are runnable commands, not notes (e.g. "bin stale-dist refusal").
const RUNNABLE = /^(asdd|npx|node|npm|bash|sh)\b/;

export function run(argv = []) {
  const jsonMode = argv.includes('--json');
  const checkMode = argv.includes('--check');
  const scope = argv.find((a) => !a.startsWith('-'));

  const registry = loadRegistry(KIT_ROOT);
  const generators = registry.generators ?? {};
  const eligible = Object.keys(generators).filter((id) => !EXCLUDE.has(id));

  let ids;
  if (!scope) {
    ids = [...ORDER.filter((id) => eligible.includes(id)), ...eligible.filter((id) => !ORDER.includes(id))];
  } else if (generators[scope]) {
    if (EXCLUDE.has(scope)) throw new CliError(`generator "${scope}" is not part of the regen umbrella (it takes its own arguments)`);
    ids = [scope];
  } else {
    ids = eligible.filter((id) => (generators[id].owns ?? []).includes(scope));
    if (!ids.length) {
      const classes = Object.keys(registry.contribution_points ?? {});
      throw new CliError(`unknown regen scope "${scope}" — a generator id (${eligible.join(', ')}) or a contribution class (${classes.join(', ')})`);
    }
    ids.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b) || a.localeCompare(b));
  }

  const commandFor = (cmd) => {
    const parts = cmd.trim().split(/\s+/);
    if (parts[0] === 'asdd') return { bin: process.execPath, argv: [BIN, ...parts.slice(1)] };
    if (parts[0] === 'npx' && parts[1] === 'asdd-harness-kit') return { bin: process.execPath, argv: [BIN, ...parts.slice(2)] };
    if (parts[0] === 'node') return { bin: process.execPath, argv: parts.slice(1) };
    return { bin: parts[0], argv: parts.slice(1), shell: true };
  };

  const results = [];
  section(`kit regen${checkMode ? ' --check' : ''}${scope ? ` [${scope}]` : ''} — ${ids.length} generator(s)`);
  for (const id of ids) {
    const g = generators[id];
    const cmd = checkMode ? g.check : g.run;
    // A null or note-style check (e.g. "bin stale-dist refusal") is skipped, not failed.
    if (!cmd || (checkMode && !RUNNABLE.test(cmd))) {
      warn(`${id}: no registered ${checkMode ? 'check' : 'run command'}${cmd ? ` (${cmd})` : ''}`);
      results.push({ id, skipped: true });
      continue;
    }
    const { bin, argv: args, shell } = commandFor(cmd);
    const res = spawnSync(bin, args, { cwd: KIT_ROOT, encoding: 'utf8', shell: Boolean(shell), stdio: jsonMode ? 'pipe' : 'inherit' });
    const status = res.status ?? 1;
    results.push({ id, ok: status === 0, command: cmd });
    if (status === 0) ok(id);
    else {
      err(`${id}: exit ${status} (${cmd})`);
      if (jsonMode) {
        if (res.stdout) process.stdout.write(res.stdout);
        if (res.stderr) process.stderr.write(res.stderr);
      }
    }
  }

  const failed = results.filter((r) => r.ok === false);
  if (jsonMode) console.log(JSON.stringify({ ok: failed.length === 0, check: checkMode, generators: results }, null, 2));
  return failed.length ? 1 : 0;
}
