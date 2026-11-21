/**
 * asdd kit versions — scan the kit and produce cli/versions.json (installed as .harness/config/versions.json)
 *
 * Usage:
 *   asdd kit versions                 # restamp at package.json version
 *   asdd kit versions bump <version>  # set the project version, then restamp
 *
 * Every artifact installed into client projects carries the project version.
 * The installer refreshes a client file only when its version changes, so one
 * version per release means every kit-owned file is refreshed on upgrade —
 * nothing stays stale because a per-file bump was missed.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { registryFiles } from '../install/registry.mjs';
import { parseCommand } from '../harness/commands.mjs';

/** The kit checkout this CLI belongs to. */
const KIT = join(import.meta.dirname, '../../..');

function readJson(p) {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function getKitVersion(root = KIT) {
  const pkg = readJson(join(root, 'package.json'));
  return pkg?.version || '2.0.0';
}

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (entry.isFile() && !entry.name.startsWith('.')) {
      yield path; // skip .DS_Store, ._*, dotfiles — never shippable artifacts
    }
  }
}

function collectArtifacts(root = KIT) {
  const artifacts = {};
  const version = getKitVersion(root);
  const record = (rel) => {
    if (/\.(test|spec)\./.test(rel)) return; // kit tests are not installed into clients
    const p = join(root, rel);
    if (existsSync(p) && statSync(p).isFile()) artifacts[rel] = version; // files-table dir mounts are not artifacts
  };

  // Registry files table: every installer-owned src is a shipped artifact (steering, bindings, doc stubs,
  // scaffold pieces, examples, AGENTS.md, versions.json, the registry itself — the former explicit lists).
  for (const f of registryFiles(root)) record(f.src);

  // Portable steering and its templates (cli/steering)
  for (const path of walk(join(root, 'cli/steering'))) {
    record(relative(root, path));
  }

  // The CLI itself is not copied into projects: asdd is the npm package (a devDependency, or global).

  // The .harness/ skeleton projects get (config schema and README, models.json, feature schema, folder READMEs)
  for (const path of walk(join(root, 'cli/scaffold'))) {
    record(relative(root, path));
  }

  // Agents
  for (const path of walk(join(root, 'cli/agents'))) {
    record(relative(root, path));
  }

  // Skills
  for (const path of walk(join(root, 'cli/skills'))) {
    record(relative(root, path));
  }

  // Modular rules (cli/rules → .agents/rules on install)
  for (const path of walk(join(root, 'cli/rules'))) {
    record(relative(root, path));
  }

  // MCP launchers + README (projects get an empty mcp.json seed; tools/* servers stay in the kit)
  for (const path of walk(join(root, 'cli/mcp'))) {
    record(relative(root, path));
  }

  // Contribution-point registry (installed as .harness/config/contribution-points.json)
  for (const path of walk(join(root, 'cli/registry'))) {
    record(relative(root, path));
  }

  // Shipped but never installed (kit-side docs; not a files-table row)
  record('docs/architecture/knowledge-scaling.md');

  // Runtime recipes copied by the runtime wirer, not the files table (only files that get copied, not symlinked)
  for (const f of ['asdd-steering.mdc']) {
    if (existsSync(join(root, 'cli/runtimes/cursor', f))) {
      record(`cli/runtimes/cursor/${f}`);
    }
  }
  record('cli/runtimes/cursor/hooks.json');

  // Modules
  for (const path of walk(join(root, 'cli/modules'))) {
    record(relative(root, path));
  }

  return artifacts;
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Set the project version in package.json and the root of package-lock.json. */
function setProjectVersion(version, root = KIT) {
  const pkgPath = join(root, 'package.json');
  const pkg = readJson(pkgPath);
  pkg.version = version;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  const lockPath = join(root, 'package-lock.json');
  const lock = readJson(lockPath);
  if (lock) {
    lock.version = version;
    if (lock.packages?.['']) lock.packages[''].version = version;
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  }
}

/**
 * Non-mutating freshness check (`asdd kit versions --check`): recomputes the
 * artifact set and kit version, then verifies cli/versions.json and the
 * self-installed .harness/config/versions.json against it. Returns problems[].
 */
export function checkVersions(root = KIT) {
  const problems = [];
  const wantVersion = getKitVersion(root);
  const wantArtifacts = collectArtifacts(root);
  const docPath = join(root, 'cli/versions.json');
  const installedPath = join(root, '.harness/config/versions.json');
  const doc = readJson(docPath);
  if (!doc) {
    problems.push(`missing cli/versions.json — run asdd kit versions`);
  } else {
    if (doc.kit_version !== wantVersion) {
      problems.push(`cli/versions.json kit_version ${doc.kit_version} != package.json ${wantVersion}`);
    }
    const have = doc.artifacts ?? {};
    for (const rel of Object.keys(wantArtifacts)) {
      if (!(rel in have)) problems.push(`cli/versions.json missing artifact ${rel}`);
      else if (have[rel] !== wantVersion) problems.push(`cli/versions.json ${rel} pinned at ${have[rel]} != ${wantVersion}`);
    }
    for (const rel of Object.keys(have)) {
      if (!(rel in wantArtifacts)) problems.push(`cli/versions.json lists removed artifact ${rel}`);
    }
  }
  if (existsSync(installedPath)) {
    const digest = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
    if (!existsSync(docPath) || digest(installedPath) !== digest(docPath)) {
      problems.push(`installed copy .harness/config/versions.json differs from cli/versions.json — run asdd kit self`);
    }
  } else {
    problems.push(`missing installed copy .harness/config/versions.json — run asdd kit self`);
  }
  return problems;
}

/** `asdd kit versions [bump <version>] [--check]` */
export function run(argv = []) {
  const outPath = join(KIT, 'cli/versions.json');
  const { values, positionals: args } = parseCommand('kit versions', argv);

  if (values.check) {
    const problems = checkVersions();
    if (problems.length) {
      for (const p of problems) console.error(`FAIL  ${p}`);
      return 1;
    }
    console.log(`OK    cli/versions.json — ${Object.keys(collectArtifacts()).length} artifacts @ ${getKitVersion()}`);
    return 0;
  }

  if (args[0] === 'bump') {
    const version = args[1];
    if (!SEMVER.test(version ?? '')) {
      console.error('Usage: asdd kit versions bump <version>   (e.g. 3.6.0)');
      return 1;
    }
    setProjectVersion(version);
    console.log(`BUMP  project → ${version}`);
  } else if (args.length) {
    console.error('Usage: asdd kit versions [bump <version>] [--check]');
    return 1;
  }

  const kitVersion = getKitVersion();
  const artifacts = collectArtifacts();
  const doc = {
    schema_version: '1.0',
    kit_version: kitVersion,
    generated_at: new Date().toISOString(),
    artifacts,
  };
  writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`WRITE ${relative(KIT, outPath)} — ${Object.keys(artifacts).length} artifacts @ ${kitVersion}`);
  return 0;
}
