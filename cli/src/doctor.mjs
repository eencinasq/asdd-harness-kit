// `asdd doctor [dir] [--json]`: what the kit needs on this machine and, in a project, the state of its install.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';

import { describe, ignoreReport } from './install/ignored.mjs';
import { localAsdd, versionFit } from './pin.mjs';
import { VERSION } from './paths.mjs';

const MIN_NODE = 22;

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

const version = (cmd, args = ['--version']) => {
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  if (res.status !== 0 && res.error) return null;
  if (res.status !== 0) return null;
  const line = `${res.stdout || res.stderr}`.trim().split('\n')[0];
  return line || null;
};

const SEMGREP_CONFIGS = ['.semgrep.yml', '.semgrep.yaml', 'semgrep.yml', '.semgrep/architecture.yml'];

/** @returns {{ id: string, level: 'ok'|'warn'|'fail', detail: string }[]} */
export function checks(dir) {
  const out = [];
  const add = (id, level, detail) => out.push({ id, level, detail });
  const node = process.versions.node.split('.').map(Number);

  add('node', node[0] >= MIN_NODE ? 'ok' : 'fail', node[0] >= MIN_NODE ? process.versions.node : `${process.versions.node}; the kit needs Node.js ${MIN_NODE} or newer`);
  const git = version('git');
  add('git', git ? 'ok' : 'fail', git ?? 'not found; install git');
  const npm = version('npm');
  add('npm', npm ? 'ok' : 'warn', npm ? `npm ${npm}` : 'not found; needed only for npx asdd-harness-kit');

  const codegraph = version('codegraph');
  const semgrepBin = process.env.HARNESS_SEMGREP || 'semgrep';
  const semgrep = version(semgrepBin);

  const project = readJson(join(dir, '.harness/config/project.json'));
  // Codegraph: agents explore code through the codegraph skill (the CLI). A project can require it.
  const cgRequired = project?.capabilities?.codegraph?.required === true;
  const cgMissing = cgRequired ? 'fail' : 'warn';
  if (!codegraph) {
    add('codegraph', cgMissing, `not found; the codegraph skill needs it: npm i -g codegraph${cgRequired ? ' (capabilities.codegraph.required)' : ''}`);
  } else if (!existsSync(join(dir, '.codegraph'))) {
    add('codegraph', project ? cgMissing : 'ok', project ? `codegraph ${codegraph} but no .codegraph/ index here; run: codegraph init` : `codegraph ${codegraph}`);
  } else {
    add('codegraph', 'ok', `codegraph ${codegraph}, index .codegraph/ present (codegraph status for freshness)`);
  }

  // Semgrep: architecture / audit scans (asdd audit, spec-drift verify_architecture_rules). A project can require it.
  const sgRequired = project?.capabilities?.semgrep?.required === true;
  const sgMissing = sgRequired ? 'fail' : 'warn';
  const configPath = SEMGREP_CONFIGS.find((rel) => existsSync(join(dir, rel)));
  if (!semgrep) {
    add(
      'semgrep',
      sgMissing,
      `not found; install Semgrep for architecture scans (pipx install semgrep, or set HARNESS_SEMGREP)${sgRequired ? ' (capabilities.semgrep.required)' : ''}`,
    );
  } else if (project && !configPath) {
    add(
      'semgrep',
      'ok',
      `${semgrepBin} ${semgrep}; no .semgrep.yml here — audit can generate rules from architecture bindings`,
    );
  } else if (configPath) {
    add('semgrep', 'ok', `${semgrepBin} ${semgrep}, config ${configPath}`);
  } else {
    add('semgrep', 'ok', `${semgrepBin} ${semgrep}`);
  }

  // GitHub CLI: only needed for `asdd install --pr` (ASDD_GH overrides the binary).
  const ghBin = process.env.ASDD_GH || 'gh';
  const gh = version(ghBin);
  const ghRequired = project?.capabilities?.gh?.required === true;
  const ghMissing = ghRequired ? 'fail' : 'warn';
  if (!gh) {
    add(
      'gh',
      ghMissing,
      `not found; needed for asdd install --pr (install GitHub CLI, or set ASDD_GH)${ghRequired ? ' (capabilities.gh.required)' : ''}`,
    );
  } else {
    add('gh', 'ok', `${ghBin} ${gh}`);
  }

  if (!project) {
    add('project', 'warn', `${dir} has no .harness/config/project.json; run: asdd install ${dir}`);
    return out;
  }
  if (existsSync(join(dir, '.harness/.installing'))) {
    add('install', 'fail', 'an install was interrupted (.harness/.installing); review git status, then: asdd install --force');
  }
  const record = readJson(join(dir, '.harness/config/installed-versions.json'));
  if (record?.skipped_files?.length) {
    add('changed', 'warn', `${record.skipped_files.length} kit file(s) changed here were not updated: ${record.skipped_files.slice(0, 3).join(', ')}${record.skipped_files.length > 3 ? ', …' : ''} (asdd install --force takes the kit version)`);
  } else if (record && !record.kit_files) {
    add('changed', 'warn', 'this install predates file hashes; run asdd install once so changed kit files are protected and asdd uninstall works');
  }
  // asdd is a Node package, never copied into the project: its devDependency (pinned by the lockfile), or a global one.
  const installed = project.kit?.version ?? null;
  const onPath = (process.env.PATH ?? '').split(delimiter).some((d) => existsSync(join(d, 'asdd')));
  const local = localAsdd(dir);
  if (existsSync(join(dir, 'cli/steering/domain-layer.md')) && existsSync(join(dir, 'cli/bin/asdd.mjs'))) {
    add('cli', 'ok', 'kit repo: it runs cli/ itself (node cli/bin/asdd.mjs); its .harness/ is installed from cli/ (asdd kit self)');
  } else if (local) {
    const fit = versionFit(local.version, installed);
    add('cli', fit.level, `devDependency asdd ${local.version} (node_modules/asdd-harness-kit; hooks and a global asdd run it)${fit.level === 'ok' ? '' : `: ${fit.message}`}`);
  } else if (onPath) {
    const fit = versionFit(VERSION, installed);
    add('cli', fit.level, `global asdd ${VERSION} (no devDependency; hooks run the asdd on the PATH)${fit.level === 'ok' ? '' : `: ${fit.message}`}`);
  } else {
    add('cli', 'fail', 'asdd is not installed for this project, so its hooks fail closed: npm i -D asdd-harness-kit (pinned per project) or npm i -g asdd-harness-kit');
  }
  if (existsSync(join(dir, '.harness/cli'))) add('legacy-cli', 'warn', '.harness/cli/ is a CLI copy from an older kit; asdd install removes it (asdd is a Node package now)');
  // Committed harness files a .gitignore rule hides never reach the other clones (or CI).
  const ignored = ignoreReport(dir, Array.isArray(project.runtimes) ? project.runtimes : []);
  if (ignored.harness.length) {
    add('gitignore', 'fail', `ignored, so never committed: ${describe(ignored.harness)}; remove those rules from .gitignore`);
  } else if (ignored.runtime.length) {
    add('gitignore', 'warn', `runtime hook files are ignored, so other clones run without the hooks: ${describe(ignored.runtime)}`);
  } else {
    add('gitignore', 'ok', 'no ignore rule hides a committed harness file');
  }
  if (existsSync(join(dir, '.harness/scripts'))) add('legacy', 'warn', '.harness/scripts/ is still there (pre-CLI layout); asdd install removes the kit files there');
  add('kit', installed === VERSION ? 'ok' : 'warn', installed === VERSION ? `installed ${installed}` : `installed ${installed ?? 'unknown'}, this CLI is ${VERSION}; run: asdd install ${dir}`);
  add('bindings', project.bindings_complete ? 'ok' : 'warn', project.bindings_complete ? 'complete' : 'still stubs; fill .harness/steering/{product,structure,tech,domain-layer.project,quality-gates.project}.md');

  // The knowledge index needs no npm package: node:sqlite is built into Node >= 22.5 (else the JSONL backend).
  const sqlite = node[0] > 22 || (node[0] === 22 && node[1] >= 5);
  add('knowledge', sqlite ? 'ok' : 'warn', sqlite ? 'node:sqlite built in (no npm packages needed)' : `Node ${process.versions.node} has no node:sqlite: the knowledge index stays on JSONL`);
  if (existsSync(join(dir, '.harness/node_modules'))) {
    add('harness-deps', 'warn', '.harness/node_modules is left from an older kit; asdd install removes it (the harness needs no npm packages)');
  }
  return out;
}

/** @returns {number} exit status: 1 when any check fails */
export function doctor(argv) {
  const json = argv.includes('--json');
  const dir = resolve(argv.find((a) => !a.startsWith('-')) ?? '.');
  const results = checks(dir);
  const failed = results.some((r) => r.level === 'fail');
  if (json) process.stdout.write(`${JSON.stringify({ version: VERSION, dir, ok: !failed, checks: results })}\n`);
  else for (const { id, level, detail } of results) process.stdout.write(`${level === 'ok' ? 'ok  ' : level === 'warn' ? 'warn' : 'FAIL'}  ${id}: ${detail}\n`);
  return failed ? 1 : 0;
}
