// `asdd uninstall [dir] [--dry-run] [--json]`: remove what `asdd install` put in a project and the project did not
// change. Kit files and unedited seeds go (by the hashes in installed-versions.json); kit links go; the kit's entries
// leave mcp.json and the runtime hooks. The project's own work stays: specs, features, state, filled bindings, and
// every file it changed.
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { fileHash } from './install/context.mjs';
import { CliError } from './paths.mjs';
import { c, log, ok, setQuiet, warn } from './ui.mjs';

const VERSIONS = '.harness/config/installed-versions.json';
const KIT_MCP_SERVERS = { knowledge: 'tools/knowledge/', 'spec-drift': 'tools/spec-drift/', 'jev-gate': 'tools/jev-gate/' };
// Pre-CLI scripts, the old project copy (.harness/cli), and the project resolver (b=node_modules/.bin/asdd; … exec "$b" <verb>).
const KIT_HOOK = /\.harness\/scripts\/(verify-on-stop|command-gate|jev-command-gate)\.mjs|\.harness\/cli\/bin\/asdd\.mjs (verify|gate)\b|^b=node_modules\/\.bin\/asdd;.*exec "\$b" (verify|gate)$/;
/** Merged with the project's own content: the kit's entries are taken out, the file stays. */
const MERGED = ['.agents/mcp/mcp.json', '.cursor/hooks.json', '.claude/settings.json'];
/** Project state the kit created but the project now owns. */
const PROJECT_STATE = ['.harness/config/project.json', 'opencode.json'];
/** .gitignore lines the installer adds for its own generated folders (.env.local stays: it guards secrets). */
const KIT_IGNORES = ['.harness/node_modules', '.harness/knowledge', '.harness/state/learning/signals'];

/** Written by the installer (not copied), so not in kit_files. */
const GENERATED = ['.agents/mcp/mcp.opencode.json', '.agents/mcp/mcp.codex.toml'];
const CLAUDE_MD = 'Follow [`AGENTS.md`](AGENTS.md) (ASDD + Harness INIT, SoT under `.harness/`).';

const isLink = (p) => {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/** Pure: what uninstall does with each path. */
export function planUninstall(target, record) {
  const plan = [];
  const add = (path, action, reason) => plan.push({ path, action, ...(reason ? { reason } : {}) });
  for (const [rel, hash] of Object.entries({ ...(record.kit_files || {}), ...(record.seeded_files || {}) })) {
    const abs = join(target, rel);
    if (!existsSync(abs)) continue;
    if (fileHash(abs) === hash) add(rel, 'remove');
    else add(rel, 'keep', 'changed since the kit wrote it');
  }
  for (const rel of record.managed_files || []) {
    const abs = join(target, rel);
    if (isLink(abs) && readlinkSync(abs).includes('.agents/')) add(rel, 'unlink');
  }
  for (const rel of GENERATED) if (existsSync(join(target, rel))) add(rel, 'remove');
  const claudeMd = join(target, 'CLAUDE.md');
  if (existsSync(claudeMd) && !isLink(claudeMd)) {
    if (readFileSync(claudeMd, 'utf8').trim() === CLAUDE_MD) add('CLAUDE.md', 'remove');
    else add('CLAUDE.md', 'keep', 'changed since the kit wrote it');
  }
  for (const rel of MERGED) if (existsSync(join(target, rel))) add(rel, 'unmerge');
  // Left by older kits (sqlite-vec in .harness/): the kit's own package, lock, and install.
  if (readJson(join(target, '.harness/package.json'))?.name === 'asdd-harness-deps') {
    for (const rel of ['.harness/package.json', '.harness/package-lock.json', '.harness/node_modules']) {
      if (existsSync(join(target, rel))) add(rel, 'remove');
    }
  }
  const gi = join(target, '.gitignore');
  if (existsSync(gi) && readFileSync(gi, 'utf8').split(/\r?\n/).some((l) => KIT_IGNORES.includes(l))) add('.gitignore', 'unmerge');
  for (const rel of PROJECT_STATE) if (existsSync(join(target, rel))) add(rel, 'keep', 'project state');
  return plan;
}

function unmerge(file) {
  if (file.endsWith('.gitignore')) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => !KIT_IGNORES.includes(l));
    const text = lines.join('\n').replace(/\n+$/, '');
    if (text.trim() === '' || text.trim() === '.env.local') rmSync(file);
    else writeFileSync(file, `${text}\n`);
    return true;
  }
  const data = readJson(file);
  if (!data) return false;
  let changed = false;
  if (data.mcpServers) {
    for (const [name, prefix] of Object.entries(KIT_MCP_SERVERS)) {
      if ((data.mcpServers[name]?.args ?? []).some((a) => String(a).startsWith(prefix))) {
        delete data.mcpServers[name];
        changed = true;
      }
    }
    // The pre-skill kit codegraph entry (a project's own codegraph server stays).
    if ((data.mcpServers.codegraph?.args ?? []).some((a) => String(a).endsWith('.agents/mcp/bin/codegraph-mcp.cjs'))) {
      delete data.mcpServers.codegraph;
      changed = true;
    }
  }
  for (const [key, list] of Object.entries(data.hooks ?? {})) {
    if (!Array.isArray(list)) continue;
    const kept = list
      .map((e) => (Array.isArray(e?.hooks) ? { ...e, hooks: e.hooks.filter((h) => !KIT_HOOK.test(String(h?.command ?? ''))) } : e))
      .filter((e) => !(Array.isArray(e?.hooks) ? e.hooks.length === 0 : KIT_HOOK.test(String(e?.command ?? ''))));
    if (kept.length !== list.length || JSON.stringify(kept) !== JSON.stringify(list)) changed = true;
    if (kept.length) data.hooks[key] = kept;
    else delete data.hooks[key];
  }
  if (data.hooks && !Object.keys(data.hooks).length) delete data.hooks;
  const empty = Object.keys(data).every((k) => k === 'version' || (k === 'mcpServers' && !Object.keys(data.mcpServers).length));
  if (empty) rmSync(file);
  else if (changed) writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return changed || empty;
}

/** Remove now-empty folders from `dir` up to (not including) `target`. */
function prune(target, dir) {
  for (let d = dir; d.startsWith(`${target}/`); d = dirname(d)) {
    try {
      if (readdirSync(d).length) return;
      rmdirSync(d);
    } catch {
      return;
    }
  }
}

/** @returns {number} exit status */
export function uninstall(argv) {
  const json = argv.includes('--json');
  const dryRun = argv.includes('--dry-run');
  const unknown = argv.filter((a) => a.startsWith('-') && !['--json', '--dry-run'].includes(a));
  if (unknown.length) throw new CliError(`unknown option: ${unknown[0]} (accepted: --dry-run, --json)`, 2);
  if (json) setQuiet(true);
  const target = resolve(argv.find((a) => !a.startsWith('-')) ?? '.');
  const record = readJson(join(target, VERSIONS));
  if (!record) {
    if (json) process.stdout.write(`${JSON.stringify({ ok: true, target, removed: [], kept: [], nothing: true })}\n`);
    else log(`nothing to remove: ${VERSIONS} is missing, so asdd has not installed anything in ${target}`);
    return 0;
  }
  if (!record.kit_files) {
    throw new CliError('this install predates file hashes: run asdd install once (it records them), then asdd uninstall');
  }
  const plan = planUninstall(target, record);
  for (const step of plan) {
    const label = step.action === 'keep' ? c.dim('KEEP') : step.action === 'unmerge' ? c.blue('EDIT') : c.yellow('REMOVE');
    log(`${label}  ${step.path}${step.reason ? ` (${step.reason})` : step.action === 'unmerge' ? ' (kit entries only)' : ''}`);
    if (dryRun) continue;
    const abs = join(target, step.path);
    if (step.action === 'remove' || step.action === 'unlink') {
      rmSync(abs, { recursive: true, force: true });
      prune(target, dirname(abs));
    } else if (step.action === 'unmerge') {
      unmerge(abs);
    }
  }
  const removed = plan.filter((s) => s.action === 'remove' || s.action === 'unlink').map((s) => s.path);
  const kept = plan.filter((s) => s.action === 'keep').map((s) => s.path);
  if (!dryRun) {
    rmSync(join(target, VERSIONS), { force: true });
    for (const tool of ['knowledge', 'spec-drift', 'jev-gate']) {
      // A built server's dist/ and node_modules/ are the kit's too once its source is gone.
      const dir = join(target, 'tools', tool);
      if (existsSync(dir) && !existsSync(join(dir, 'package.json'))) {
        for (const sub of ['dist', 'node_modules', '.gitignore', '.nvmrc']) rmSync(join(dir, sub), { recursive: true, force: true });
        prune(target, join(dir, 'x'));
      }
    }
  }
  if (json) process.stdout.write(`${JSON.stringify({ ok: true, target, dryRun, removed, kept })}\n`);
  else if (dryRun) log(`dry run: ${removed.length} path(s) would be removed, ${kept.length} kept; nothing was changed`);
  else {
    ok(`asdd-harness-kit removed from ${target}: ${removed.length} path(s) removed, ${kept.length} kept`);
    if (kept.length) warn('Kept files are yours now (changed, or project state); delete them by hand if you do not want them.');
  }
  return 0;
}
