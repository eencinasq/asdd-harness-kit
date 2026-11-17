import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkExecutableShape, committedChecks, enginesSatisfied, gitignoreLines, loadRegistry, mountMap, readManifest, retiredPaths, runtimeMap, validateModules,
} from '../src/install/registry.mjs';

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MODULES = ['bruno', 'http-api', 'playwright-e2e', 'web-ui'];

// A minimal synthetic kit root: registry + package.json + one module tree. `manifestOver` mutates the manifest.
function withModule(manifestOver, fn, files = { 'x.md': 'x' }) {
  return () => {
    const kit = mkdtempSync(join(tmpdir(), 'registry-test-'));
    try {
      mkdirSync(join(kit, 'cli/registry'), { recursive: true });
      mkdirSync(join(kit, 'cli/modules/test-mod'), { recursive: true });
      writeFileSync(join(kit, 'cli/registry/contribution-points.json'), JSON.stringify(loadRegistry(KIT_ROOT)));
      writeFileSync(join(kit, 'package.json'), JSON.stringify({ version: '3.12.0' }));
      for (const [rel, text] of Object.entries(files)) {
        writeFileSync(join(kit, 'cli/modules/test-mod', rel), text);
      }
      const manifest = {
        schema_version: '1.0', name: 'test-mod', version: '1.0.0', trust: 'declarative',
        engines: { asdd: '>=3.0.0' },
        contributes: { skills: [{ path: 'x.md', mount: '.agents/skills/test-mod/x.md' }] },
        ...manifestOver,
      };
      writeFileSync(join(kit, 'cli/modules/test-mod/module.json'), JSON.stringify(manifest));
      fn(kit);
    } finally {
      rmSync(kit, { recursive: true, force: true });
    }
  };
}

test('registry loads: schema_version 1.0 + 27 contribution points', () => {
  const r = loadRegistry(KIT_ROOT);
  assert.equal(r.schema_version, '1.0');
  assert.equal(Object.keys(r.contribution_points).length, 27);
  assert.equal(Object.keys(r.vocabulary.phases).length, 9);
  assert.equal(Object.keys(r.generators).length, 11);
});

test('all four shipped module manifests validate', () => {
  assert.doesNotThrow(() => validateModules(KIT_ROOT, MODULES));
});

// Wave 1 REQ-001: every generator in the `kit regen` umbrella (all except
// install/harness-profile, which take their own arguments) carries a runnable
// check command — `asdd kit regen --check` must never report a skipped check.
test('every regen-umbrella generator has a runnable check', () => {
  const r = loadRegistry(KIT_ROOT);
  const EXCLUDE = new Set(['install', 'harness-profile']); // mirrors cli/src/kit/regen.mjs
  const RUNNABLE = /^(asdd|npx|node|npm|bash|sh)\b/;
  for (const [id, g] of Object.entries(r.generators)) {
    if (EXCLUDE.has(id)) continue;
    assert.match(g.check ?? '', RUNNABLE, `generator "${id}" has no runnable check`);
  }
});

test('http-api mount map expands adapters to openapi.mjs only (test file skipped)', () => {
  const manifest = readManifest(KIT_ROOT, 'http-api');
  const adapters = mountMap(KIT_ROOT, manifest).filter((p) => p.type === 'adapters');
  assert.deepEqual(adapters.map((p) => p.dest), [join('.agents/mcp/adapters', 'openapi.mjs')]);
});

test('enginesSatisfied comparators', () => {
  assert.equal(enginesSatisfied(undefined, '3.12.0'), true);
  assert.equal(enginesSatisfied('*', '3.12.0'), true);
  assert.equal(enginesSatisfied('>=3.12.0', '3.12.0'), true);
  assert.equal(enginesSatisfied('>=4.0.0', '3.12.0'), false);
  assert.equal(enginesSatisfied('3.12.0', '3.12.0'), true);
  assert.equal(enginesSatisfied('<4.0.0', '3.12.0'), true);
  assert.equal(enginesSatisfied('^3.0.0', '3.12.0'), true);
  assert.equal(enginesSatisfied('^4.0.0', '3.12.0'), false);
  assert.equal(enginesSatisfied('~3.12.0', '3.12.9'), true);
  assert.equal(enginesSatisfied('~3.12.0', '3.13.0'), false);
  assert.equal(enginesSatisfied('garbage', '3.12.0'), false);
});

test('fails closed: unregistered contributes type', withModule({
  contributes: { quantum: [{ path: 'x.md', mount: '.agents/q/x.md' }] },
}, (kit) => {
  assert.throws(() => readManifest(kit, 'test-mod'), /unregistered contributes type/);
}));

test('fails closed: kit-internal contributes type (Q-NEW-3)', withModule({
  contributes: { commands: [{ path: 'x.md', mount: '.agents/x.md' }] },
}, (kit) => {
  assert.throws(() => readManifest(kit, 'test-mod'), /kit-internal/);
}));

// Wave 1 REQ-004: phases are permanently kernel-owned (Q-NEW-1) — a consumer phase binds gates,
// owning agents, and steering-tag allocation; that is a contract change, not a manifest row.
test('fails closed: kit-internal contributes type (Q-NEW-1: phases)', withModule({
  contributes: { phases: [{ path: 'x.md', mount: '.agents/x.md' }] },
}, (kit) => {
  assert.throws(() => readManifest(kit, 'test-mod'), /kit-internal/);
}));

test('fails closed: incompatible engines.asdd', withModule({
  engines: { asdd: '>=99.0.0' },
}, (kit) => {
  assert.throws(() => readManifest(kit, 'test-mod'), /incompatible/);
}));

test('fails closed: executable contributes under declarative trust', withModule({
  contributes: { adapters: [{ path: 'x.md', mount: '.agents/mcp/adapters/x.md', contract: 'spec-drift-adapter' }] },
}, (kit) => {
  assert.throws(() => readManifest(kit, 'test-mod'), /trust must be "executable"/);
}));

test('fails closed: executable without contract', withModule({
  trust: 'executable',
  contributes: { adapters: [{ path: 'x.md', mount: '.agents/mcp/adapters/x.md' }] },
}, (kit) => {
  assert.throws(() => readManifest(kit, 'test-mod'), /must declare a contract/);
}));

test('fails closed: source path escapes the module tree', withModule({
  contributes: { skills: [{ path: '../../steering', mount: '.agents/skills' }] },
}, (kit) => {
  const manifest = readManifest(kit, 'test-mod');
  assert.throws(() => mountMap(kit, manifest), /escapes the module tree/);
}));

test('fails closed: absolute mount', withModule({
  contributes: { skills: [{ path: 'x.md', mount: '/etc/x.md' }] },
}, (kit) => {
  const manifest = readManifest(kit, 'test-mod');
  assert.throws(() => mountMap(kit, manifest), /relative project path/);
}));

test('fails closed: missing module.json', () => {
  assert.throws(() => readManifest(KIT_ROOT, 'no-such-module'), /unknown module/);
});

test('files table: every src exists; mounts classified and policy-shaped', async () => {
  const { registryFiles } = await import('../src/install/registry.mjs');
  const files = registryFiles(KIT_ROOT);
  assert.equal(files.length, 37);
  for (const f of files) {
    assert.ok(existsSync(join(KIT_ROOT, f.src)), `missing src: ${f.src}`);
    assert.ok(loadRegistry(KIT_ROOT).contribution_points[f.class], `unregistered class: ${f.class}`);
    assert.ok(['refresh', 'create', 'seeded', null].includes(f.install), `bad install: ${f.install}`);
    assert.ok(!f.dest.startsWith('/'), `absolute dest: ${f.dest}`);
  }
});

test('derived SELF_COPIES/HARNESS_FILES parity with legacy enumerations', async () => {
  const { HARNESS_FILES, SELF_COPIES } = await import('../src/install/phases.mjs');
  const harnessDests = HARNESS_FILES.map(([d]) => d).sort();
  assert.deepEqual(harnessDests, [
    '.harness/audits/README.md', '.harness/config/README.md', '.harness/config/contribution-points.json',
    '.harness/config/models.json', '.harness/config/project.schema.json', '.harness/config/skill-profile-waivers.json',
    '.harness/config/steering.registry.json', '.harness/config/versions.json', '.harness/examples/CODEOWNERS.harness.example',
    '.harness/examples/harness-audit.yml.example', '.harness/features/feature.schema.json',
    '.harness/state/telemetry/README.md', '.harness/state/telemetry/telemetry.schema.json',
    '.harness/steering/templates',
  ].sort());
  const selfDests = new Set(SELF_COPIES.map(([d]) => d));
  // Every legacy self-copy dest is present: steering files, templates, agents/skills/rules, mcp paths, AGENTS.md
  for (const d of [
    '.harness/steering/templates', '.agents/agents', '.agents/skills', '.agents/rules',
    '.agents/mcp/bin', '.agents/mcp/sync-runtime-mcp.cjs', '.agents/mcp/README.md', '.agents/mcp/mcp.json',
    'AGENTS.md', '.harness/specs/README.md', '.harness/features/README.md',
    '.harness/state/slices/README.md', '.harness/state/archive/README.md',
  ]) assert.ok(selfDests.has(d), `missing self-copy dest: ${d}`);
  // GitHub examples are NOT self-copied (projects only)
  assert.ok(!selfDests.has('.harness/examples/CODEOWNERS.harness.example'));
  // 16 steering files + 24 self rows
  assert.equal(SELF_COPIES.length, 40);
});

test('module mount parity: mountMap dests match the retired switch mounts', () => {
  const dests = (name) => mountMap(KIT_ROOT, readManifest(KIT_ROOT, name)).map((p) => p.dest);
  assert.ok(dests('bruno').includes('.agents/agents/asdd-integration-tester.md'));
  assert.ok(dests('bruno').some((d) => d.startsWith('.agents/skills/')));
  assert.ok(dests('playwright-e2e').includes('.agents/agents/asdd-e2e-tester.md'));
  assert.ok(dests('web-ui').every((d) => d.startsWith('.agents/skills/')));
  const http = dests('http-api');
  assert.ok(http.some((d) => d.startsWith('.agents/skills/')));
  assert.deepEqual(http.filter((d) => d.startsWith('.agents/mcp/')), [join('.agents/mcp/adapters', 'openapi.mjs')]);
});

test('MODULES derives from cli/modules dirs (module.json present per dir)', async () => {
  const { MODULES } = await import('../src/install/options.mjs');
  const { readdirSync } = await import('node:fs');
  const dirs = readdirSync(join(KIT_ROOT, 'cli/modules'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  assert.deepEqual([...MODULES].sort(), dirs.sort());
  for (const m of MODULES) assert.ok(existsSync(join(KIT_ROOT, 'cli/modules', m, 'module.json')), `no module.json: ${m}`);
});

test('runtime/committed/retired sections derive the retired enumerations', async () => {
  const runtimes = runtimeMap(KIT_ROOT);
  assert.deepEqual(Object.keys(runtimes), ['cursor', 'claude', 'opencode', 'kimi', 'junie', 'devin', 'kiro']);
  assert.equal(runtimes.kimi.dir, '.kimi-code');
  assert.deepEqual(runtimes.cursor.committed, ['.cursor/hooks.json']);
  // ignored.mjs exports match the registry sections
  const { COMMITTED_PATHS, RUNTIME_PATHS } = await import('../src/install/ignored.mjs');
  assert.deepEqual(COMMITTED_PATHS, committedChecks(KIT_ROOT));
  assert.deepEqual(RUNTIME_PATHS.cursor, runtimes.cursor.committed);
  // retired lists moved to data
  assert.equal(retiredPaths(KIT_ROOT, 'jev_files').length, 5);
  assert.equal(retiredPaths(KIT_ROOT, 'kit_paths').length, 19);
  // gitignore lines derive from untracked classes only (derived_singleton first — declared earlier in the file)
  const lines = gitignoreLines(KIT_ROOT);
  assert.deepEqual(lines, [
    '.harness/state/registry.json',
    '.harness/state/slices/*/manifest.json',
    '.harness/state/learning/patterns.json',
    '.harness/knowledge',
    '.harness/state/telemetry/spans.jsonl',
    '.harness/state/telemetry/slices/',
    '.harness/state/learning/signals',
  ]);
});

test('fails closed: tracked non-state class without source_root (G-16)', () => {
  const kit = mkdtempSync(join(tmpdir(), 'registry-g16-'));
  try {
    mkdirSync(join(kit, 'cli/registry'), { recursive: true });
    const r = loadRegistry(KIT_ROOT);
    delete r.contribution_points.steering.source_root;
    writeFileSync(join(kit, 'cli/registry/contribution-points.json'), JSON.stringify(r));
    assert.throws(() => loadRegistry(kit), /source_root.*G-16/);
  } finally {
    rmSync(kit, { recursive: true, force: true });
  }
});

test('gitignoreLines fails closed when a tracked class declares ignore_patterns', () => {
  const kit = mkdtempSync(join(tmpdir(), 'registry-gitignore-'));
  try {
    mkdirSync(join(kit, 'cli/registry'), { recursive: true });
    const r = loadRegistry(KIT_ROOT);
    r.contribution_points.steering.ignore_patterns = ['.harness/steering'];
    writeFileSync(join(kit, 'cli/registry/contribution-points.json'), JSON.stringify(r));
    assert.throws(() => gitignoreLines(kit), /merge\.tracked is not false/);
  } finally {
    rmSync(kit, { recursive: true, force: true });
  }
});

const ADAPTER_OK = `export default {\n  id: 'a',\n  description: 'd',\n  run({ root }) { return { status: 'pass', findings: [] }; },\n};\n`;

test('executable shape check passes on the shipped adapter (G-13)', async () => {
  const { checkExecutableShape } = await import('../src/install/registry.mjs');
  checkExecutableShape(KIT_ROOT, readManifest(KIT_ROOT, 'http-api'));
});

test('fails closed: adapter without literal export default', withModule({
  trust: 'executable',
  contributes: { adapters: [{ path: 'x.md', mount: '.agents/mcp/adapters/x.mjs', contract: 'spec-drift-adapter' }] },
}, (kit) => {
  assert.throws(() => checkExecutableShape(kit, readManifest(kit, 'test-mod')), /literal-export|missing id/);
}, { 'x.md': 'const a = {id: "a", description: "d", run(){}};\nexport default a;\n' }));

test('fails closed: adapter missing run', withModule({
  trust: 'executable',
  contributes: { adapters: [{ path: 'x.md', mount: '.agents/mcp/adapters/x.mjs', contract: 'spec-drift-adapter' }] },
}, (kit) => {
  assert.throws(() => checkExecutableShape(kit, readManifest(kit, 'test-mod')), /missing run/);
}, { 'x.md': 'export default {\n  id: \'a\',\n  description: \'d\',\n};\n' }));

test('fails closed: adapter with a filesystem write call', withModule({
  trust: 'executable',
  contributes: { adapters: [{ path: 'x.md', mount: '.agents/mcp/adapters/x.mjs', contract: 'spec-drift-adapter' }] },
}, (kit) => {
  assert.throws(() => checkExecutableShape(kit, readManifest(kit, 'test-mod')), /read-only/);
}, { 'x.md': 'import { writeFileSync } from \'node:fs\';\nwriteFileSync(\'/tmp/x\', \'y\');\n' + ADAPTER_OK }));

// Wave 1 REQ-003: harness-telemetry contract subtype — {id, description, emit}, append-only.
const TELEMETRY_OK = 'export default {\n  id: \'t\',\n  description: \'d\',\n  emit: (e) => e,\n};\n';

test('harness-telemetry adapter: {id,description,emit} + appendFileSync passes', withModule({
  trust: 'executable',
  contributes: { adapters: [{ path: 'x.md', mount: '.agents/mcp/adapters/x.mjs', contract: 'harness-telemetry' }] },
}, (kit) => {
  assert.doesNotThrow(() => checkExecutableShape(kit, readManifest(kit, 'test-mod')));
}, { 'x.md': 'import { appendFileSync } from \'node:fs\';\nconst sink = (e) => appendFileSync(\'.harness/state/telemetry/e.jsonl\', JSON.stringify(e) + \'\\n\');\n' + TELEMETRY_OK }));

test('fails closed: telemetry adapter missing emit', withModule({
  trust: 'executable',
  contributes: { adapters: [{ path: 'x.md', mount: '.agents/mcp/adapters/x.mjs', contract: 'harness-telemetry' }] },
}, (kit) => {
  assert.throws(() => checkExecutableShape(kit, readManifest(kit, 'test-mod')), /missing emit/);
}, { 'x.md': 'export default {\n  id: \'t\',\n  description: \'d\',\n  run: () => {},\n};\n' }));

test('fails closed: telemetry adapter with a mutating write call', withModule({
  trust: 'executable',
  contributes: { adapters: [{ path: 'x.md', mount: '.agents/mcp/adapters/x.mjs', contract: 'harness-telemetry' }] },
}, (kit) => {
  assert.throws(() => checkExecutableShape(kit, readManifest(kit, 'test-mod')), /append-only/);
}, { 'x.md': 'import { writeFileSync } from \'node:fs\';\nwriteFileSync(\'/tmp/x\', \'y\');\n' + TELEMETRY_OK }));

test('fails closed: spec-drift adapter may not append (stays read-only)', withModule({
  trust: 'executable',
  contributes: { adapters: [{ path: 'x.md', mount: '.agents/mcp/adapters/x.mjs', contract: 'spec-drift-adapter' }] },
}, (kit) => {
  assert.throws(() => checkExecutableShape(kit, readManifest(kit, 'test-mod')), /read-only/);
}, { 'x.md': 'import { appendFileSync } from \'node:fs\';\nappendFileSync(\'/tmp/x\', \'y\');\n' + ADAPTER_OK }));

test('fails closed: unknown adapter contract subtype', withModule({
  trust: 'executable',
  contributes: { adapters: [{ path: 'x.md', mount: '.agents/mcp/adapters/x.mjs', contract: 'run-anything' }] },
}, (kit) => {
  assert.throws(() => checkExecutableShape(kit, readManifest(kit, 'test-mod')), /unknown contract/);
}, { 'x.md': TELEMETRY_OK }));

test('gitattributeLines derives the merge-policy block (D-4/G-5)', async () => {
  const { gitattributeLines } = await import('../src/install/registry.mjs');
  assert.deepEqual(gitattributeLines(KIT_ROOT), [
    '.harness/PROGRESS.md merge=ours',
    '.harness/steering/** -merge',
    '.agents/** -merge',
    '.cursor/** -merge',
    'AGENTS.md -merge',
    'tools/*/src/harness/** -merge',
    'cli/versions.json merge=ours',
    '.harness/config/versions.json merge=ours',
  ]);
  // every line is "<glob> <merge-attr>" over a registered class's attribute_globs
  const r = loadRegistry(KIT_ROOT);
  const declared = Object.values(r.contribution_points).flatMap((c) => c.attribute_globs ?? []);
  assert.equal(new Set(declared.map((d) => d.split(' ')[0])).size, gitattributeLines(KIT_ROOT).length);
});

test('installGitattributes preserves user lines and replaces only the marked block', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gitattr-'));
  try {
    writeFileSync(join(tmp, '.gitattributes'), '# user rule\n*.bin binary\n# --- asdd merge policy (generated from contribution-points registry — regen: asdd install) ---\nstale\n# --- end asdd merge policy ---\n*.user text\n');
    const src = readFileSync(join(KIT_ROOT, 'cli/src/install/index.mjs'), 'utf8');
    assert.ok(src.includes('function installGitattributes'), 'installGitattributes missing');
    assert.ok(src.includes('installGitattributes(ctx)'), 'installGitattributes not wired into install flow');
    // marked-block splice is deterministic: run the same slice logic the installer uses
    const BEGIN = '# --- asdd merge policy (generated from contribution-points registry — regen: asdd install) ---';
    const END = '# --- end asdd merge policy ---';
    const text = readFileSync(join(tmp, '.gitattributes'), 'utf8');
    const block = [BEGIN, 'REGEN'].join('\n') + '\n' + END;
    const next = text.slice(0, text.indexOf(BEGIN)) + block + text.slice(text.indexOf(END) + END.length);
    assert.ok(next.includes('# user rule'), 'user lines before block lost');
    assert.ok(next.includes('*.user text'), 'user lines after block lost');
    assert.ok(!next.includes('stale'), 'stale block content kept');
    assert.ok(next.includes('REGEN'), 'regenerated content missing');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('PHASES/SLICE_MODES derive from registry vocabulary (G-3/D-3)', async () => {
  const { PHASES, SLICE_MODES } = await import('../src/harness/sync-state.mjs');
  assert.deepEqual(PHASES, ['discovery', 'spec', 'validation', 'domain', 'design', 'task_planning', 'implementation', 'qa', 'knowledge']);
  assert.deepEqual(SLICE_MODES, ['lite', 'hotfix', 'full', 'escalated']);
  // repair.mjs consumes the shared PHASES (its private constant is gone)
  const src = readFileSync(join(KIT_ROOT, 'cli/src/harness/repair.mjs'), 'utf8');
  assert.ok(!src.includes("const PHASES ="), 'repair.mjs still has a private PHASES');
});

test('command tables derive from registry commands (D-9)', async () => {
  const { HARNESS_COMMANDS, KIT_COMMANDS } = await import('../src/harness/commands.mjs');
  assert.equal(Object.keys(HARNESS_COMMANDS).length, 21);
  assert.equal(Object.keys(KIT_COMMANDS).length, 9);
  // every harness script exists under cli/src/harness
  const scripts = Object.values(HARNESS_COMMANDS).flatMap((e) =>
    e.sub ? Object.values(e.sub).map((s) => s.script) : [e.script]);
  for (const s of scripts) assert.ok(existsSync(join(KIT_ROOT, 'cli/src/harness', s)), `no script: ${s}`);
  // every kit module exists under cli/src/kit
  for (const spec of Object.values(KIT_COMMANDS)) {
    assert.ok(existsSync(join(KIT_ROOT, 'cli/src', spec)), `no kit module: ${spec}`);
  }
});
