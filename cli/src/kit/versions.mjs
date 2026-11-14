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
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/** The kit checkout this CLI belongs to. */
const root = join(import.meta.dirname, '../../..');
const outPath = join(root, 'cli/versions.json');

function readJson(p) {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function getKitVersion() {
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

function collectArtifacts() {
  const artifacts = {};
  const version = getKitVersion();
  const record = (rel) => {
    if (/\.(test|spec)\./.test(rel)) return; // kit tests are not installed into clients
    if (existsSync(join(root, rel))) artifacts[rel] = version; // listed files may be retired
  };

  // Portable steering and its templates (cli/steering)
  for (const path of walk(join(root, 'cli/steering'))) {
    record(relative(root, path));
  }

  // Domain model stub (the kit's own docs/architecture/domain-model.md is never shipped)
  for (const f of ['domain-model.md', 'agent-failure-log.md', 'dissent-log.md']) record(`cli/templates/docs/${f}`);

  // Binding stubs (the kit's own .harness/steering bindings are never shipped)
  for (const f of [
    'product.md', 'structure.md', 'tech.md', 'domain-layer.project.md',
    'quality-gates.project.md', 'design-system.md',
  ]) {
    record(`cli/templates/bindings/${f}`);
  }

  // The CLI itself is not copied into projects: asdd is the npm package (a devDependency, or global).

  // The .harness/ skeleton projects get (config schema and README, models.json, feature schema, folder READMEs)
  for (const path of walk(join(root, 'cli/scaffold'))) {
    record(relative(root, path));
  }
  record('cli/versions.json');

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

  // Docs
  for (const f of [
    'knowledge-base/README.md',
  ]) {
    record(`docs/${f}`);
  }
  for (const f of [
    'architecture/knowledge-scaling.md',
  ]) {
    record(`docs/${f}`);
  }

  // Root kit files
  record('cli/AGENTS.md');

  // Audit + CI examples (copied into .harness/)
  record('.github/CODEOWNERS.harness.example');
  record('.github/workflows/harness-audit.yml.example');

  // Runtime recipes (only files that get copied, not symlinked)
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
function setProjectVersion(version) {
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

/** `asdd kit versions [bump <version>]` */
export function run(args = []) {

  if (args[0] === 'bump') {
    const version = args[1];
    if (!SEMVER.test(version ?? '')) {
      console.error('Usage: asdd kit versions bump <version>   (e.g. 3.6.0)');
      return 1;
    }
    setProjectVersion(version);
    console.log(`BUMP  project → ${version}`);
  } else if (args.length) {
    console.error('Usage: asdd kit versions [bump <version>]');
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
  console.log(`WRITE ${relative(root, outPath)} — ${Object.keys(artifacts).length} artifacts @ ${kitVersion}`);
  return 0;
}
