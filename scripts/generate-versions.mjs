#!/usr/bin/env node
/**
 * generate-versions.mjs — scan the kit and produce .harness/config/versions.json
 *
 * Usage:
 *   node scripts/generate-versions.mjs                 # restamp at package.json version
 *   node scripts/generate-versions.mjs bump <version>  # set the project version, then restamp
 *
 * Every artifact installed into client projects carries the project version.
 * The installer refreshes a client file only when its version changes, so one
 * version per release means every kit-owned file is refreshed on upgrade —
 * nothing stays stale because a per-file bump was missed.
 */
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const outPath = join(root, '.harness/config/versions.json');

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

  // Portable steering (individual files)
  for (const f of [
    'domain-layer.md', 'quality-gates.md', 'manifest.md', 'session-loop.md',
    'asdd-lite.md', 'codegraph.md', 'codegraph-agents.md', 'knowledge.md',
    'jev.md', 'skills.md', 'spec-drift.md',
    'security-rules.md', 'controls.md', 'README.md',
  ]) {
    record(`.harness/steering/${f}`);
  }

  // Portable steering templates
  for (const path of walk(join(root, '.harness/steering/templates'))) {
    record(relative(root, path));
  }

  // Bindings
  for (const f of [
    'product.md', 'structure.md', 'tech.md', 'domain-layer.project.md',
    'quality-gates.project.md', 'design-system.md',
  ]) {
    record(`.harness/steering/${f}`);
  }

  // Harness scripts
  for (const f of [
    'check-invariants.mjs', 'check-skills-index.mjs', 'verify-on-stop.mjs',
    'check-project-config.mjs', 'harness-status.mjs', 'init-slice.mjs',
    'escalate-slice.mjs', 'sync-state.mjs',
    'jev-client.mjs', 'jev-gates.mjs', 'jev-command-gate.mjs',
    'jev-client.test.mjs', 'jev-command-gate.test.mjs',
    'env-loader.mjs',
    'knowledge-lib.mjs', 'knowledge-store.mjs', 'knowledge-store-sqlite.mjs',
    'sync-knowledge.mjs', 'sync-knowledge.test.mjs',
    'drift-lib.mjs', 'drift-lib.test.mjs', 'check-spec-drift.mjs',
    'audit-lib.mjs', 'audit-codebase.mjs', 'audit-codebase.test.mjs', 'audit-triage.mjs',
    'semgrep-lib.mjs', 'semgrep-lib.test.mjs',
  ]) {
    record(`.harness/scripts/${f}`);
  }

  // Harness validators
  for (const path of walk(join(root, '.harness/scripts/validators'))) {
    record(relative(root, path));
  }

  // Config
  for (const f of ['project.schema.json', 'README.md', 'versions.json', 'models.json']) {
    record(`.harness/config/${f}`);
  }

  // Features schema
  record('.harness/features/feature.schema.json');

  // Agents
  for (const path of walk(join(root, '.agents/agents'))) {
    record(relative(root, path));
  }

  // Skills
  for (const path of walk(join(root, '.agents/skills'))) {
    record(relative(root, path));
  }

  // MCP
  for (const path of walk(join(root, '.agents/mcp'))) {
    record(relative(root, path));
  }

  // Docs
  for (const f of [
    'self-healing-log.md',
    'knowledge-base/README.md',
  ]) {
    record(`docs/${f}`);
  }
  for (const f of [
    'architecture/domain-model.md', 'architecture/knowledge-scaling.md',
    'agent-failure-log.md', 'dissent-log.md',
  ]) {
    record(`docs/${f}`);
  }

  // Root kit files
  record('AGENTS.md');
  record('scripts/install-into.sh');
  record('scripts/test-install-into.sh');
  record('scripts/test-lifecycle.sh');
  record('scripts/test-full-flow.sh');

  // Audit + CI examples (copied into .harness/)
  record('.harness/audits/README.md');
  record('.github/CODEOWNERS.harness.example');
  record('.github/workflows/harness-audit.yml.example');

  // Runtime recipes (only files that get copied, not symlinked)
  for (const f of ['asdd-steering.mdc']) {
    if (existsSync(join(root, 'runtimes/cursor', f))) {
      record(`runtimes/cursor/${f}`);
    }
  }
  for (const f of ['hooks.json']) {
    if (existsSync(join(root, '.cursor', f))) {
      record(`.cursor/${f}`);
    }
  }

  // Modules
  for (const path of walk(join(root, '.agents/modules'))) {
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

function main() {
  const args = process.argv.slice(2);

  if (args[0] === 'bump') {
    const version = args[1];
    if (!SEMVER.test(version ?? '')) {
      console.error('Usage: node scripts/generate-versions.mjs bump <version>   (e.g. 3.6.0)');
      process.exit(1);
    }
    setProjectVersion(version);
    console.log(`BUMP  project → ${version}`);
  } else if (args.length) {
    console.error('Usage: node scripts/generate-versions.mjs [bump <version>]');
    process.exit(1);
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
}

main();
