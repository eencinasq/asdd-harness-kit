#!/usr/bin/env node
/**
 * generate-versions.mjs — scan the kit and produce .harness/config/versions.json
 *
 * Usage:
 *   node scripts/generate-versions.mjs [bump <path> [version]]
 *
 * Without args: regenerates the manifest from current disk state.
 * With "bump <path> [version]": bumps the version of a single artifact.
 */
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
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
    } else if (entry.isFile()) {
      yield path;
    }
  }
}

function collectArtifacts() {
  const artifacts = {};
  const record = (rel) => {
    artifacts[rel] = getKitVersion();
  };

  // Portable steering (individual files)
  for (const f of [
    'domain-layer.md', 'quality-gates.md', 'manifest.md', 'session-loop.md',
    'asdd-lite.md', 'codegraph.md', 'codegraph-agents.md', 'skills.md',
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
  ]) {
    record(`.harness/scripts/${f}`);
  }

  // Harness validators
  for (const path of walk(join(root, '.harness/scripts/validators'))) {
    record(relative(root, path));
  }

  // Config
  for (const f of ['project.schema.json', 'README.md', 'versions.json']) {
    record(`.harness/config/${f}`);
  }

  // Features schemas
  for (const f of ['feature_list.schema.json', 'feature.schema.json']) {
    record(`.harness/features/${f}`);
  }

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
    'asdd-harness-portability.md', 'asdd-and-harness-engineering.md',
    'pipeline-documentation.md', 'shape-up-asdd-harness-integration.md',
  ]) {
    record(`docs/${f}`);
  }
  for (const f of [
    'architecture/domain-model.md', 'agent-failure-log.md', 'dissent-log.md',
  ]) {
    record(`docs/${f}`);
  }

  // Root kit files
  record('AGENTS.md');
  record('scripts/install-into.sh');
  record('scripts/harness-migrate.mjs');

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

function main() {
  const args = process.argv.slice(2);
  const existing = readJson(outPath) || {};
  const kitVersion = getKitVersion();

  if (args[0] === 'bump') {
    const relPath = args[1];
    if (!relPath) {
      console.error('Usage: node scripts/generate-versions.mjs bump <path> [version]');
      process.exit(1);
    }
    const newVersion = args[2] || kitVersion;
    const doc = {
      schema_version: '1.0',
      kit_version: existing.kit_version || kitVersion,
      generated_at: new Date().toISOString(),
      artifacts: { ...(existing.artifacts || {}) },
    };
    doc.artifacts[relPath] = newVersion;
    writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`BUMP  ${relPath} → ${newVersion}`);
    return;
  }

  const artifacts = collectArtifacts();
  const doc = {
    schema_version: '1.0',
    kit_version: kitVersion,
    generated_at: new Date().toISOString(),
    artifacts,
  };

  // Preserve existing versions for files that haven't changed
  if (existing.artifacts) {
    for (const [path, version] of Object.entries(existing.artifacts)) {
      if (artifacts[path] && version !== kitVersion) {
        // Keep the older version unless the file content changed
        const fullPath = join(root, path);
        if (existsSync(fullPath)) {
          const mtime = statSync(fullPath).mtime.toISOString();
          if (mtime <= existing.generated_at) {
            artifacts[path] = version;
          }
        }
      }
    }
  }

  writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`WRITE ${outPath} — ${Object.keys(artifacts).length} artifacts @ ${kitVersion}`);
}

main();
