import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRACKER_TYPES, validateTrackerConfig } from './tracker-config.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const valid = {
  jira: { type: 'jira', project: 'PROD', site: 'acme.atlassian.net', pitch: { issue_type: 'Epic' }, intent: { issue_type: 'Story', label: 'asdd-intent' } },
  linear: { type: 'linear', project: 'ENG', pitch: { container: 'project' }, intent: { label: 'asdd-intent' } },
  github: { type: 'github', project: 'acme/shop', pitch: { label: 'asdd:pitch' }, intent: { label: 'asdd:intent' } },
};

test('tracker-binding REQ-001: a valid tracker block of each type passes', () => {
  assert.deepEqual([...TRACKER_TYPES], ['jira', 'linear', 'github']);
  for (const [type, cfg] of Object.entries(valid)) assert.deepEqual(validateTrackerConfig(cfg), [], type);
  assert.deepEqual(validateTrackerConfig({ ...valid.linear, pitch: { container: 'issue', label: 'pitch' } }), []);
  assert.deepEqual(validateTrackerConfig({ ...valid.jira, intent: { label: 'asdd-intent' } }), [], 'jira intent: label alone is enough');
});

test('tracker-binding REQ-001: an unknown type or a non-object block fails', () => {
  assert.match(validateTrackerConfig({ ...valid.jira, type: 'trello' }).join('\n'), /tracker\.type must be one of jira, linear, github/);
  assert.match(validateTrackerConfig('jira').join('\n'), /tracker must be an object/);
  assert.match(validateTrackerConfig({ project: 'PROD' }).join('\n'), /tracker\.type must be one of/);
});

test('tracker-binding REQ-001: each missing required field fails, per type', () => {
  const missing = (cfg, path) => {
    const copy = structuredClone(cfg);
    const keys = path.split('.');
    const last = keys.pop();
    delete keys.reduce((o, k) => o[k], copy)[last];
    return validateTrackerConfig(copy).join('\n');
  };
  assert.match(missing(valid.jira, 'project'), /tracker\.project must be a non-empty string/);
  assert.match(missing(valid.jira, 'site'), /tracker\.site must be a non-empty string/);
  assert.match(missing(valid.jira, 'pitch.issue_type'), /tracker\.pitch\.issue_type must be a non-empty string/);
  assert.match(validateTrackerConfig({ ...valid.jira, intent: {} }).join('\n'), /tracker\.intent needs issue_type or label/);
  assert.match(missing(valid.linear, 'intent.label'), /tracker\.intent\.label must be a non-empty string/);
  assert.match(missing(valid.linear, 'pitch.container'), /tracker\.pitch\.container must be "project" or "issue"/);
  assert.match(validateTrackerConfig({ ...valid.linear, pitch: { container: 'issue' } }).join('\n'), /tracker\.pitch\.label must be a non-empty string/);
  assert.match(missing(valid.github, 'pitch.label'), /tracker\.pitch\.label must be a non-empty string/);
  assert.match(missing(valid.github, 'intent'), /tracker\.intent must be an object/);
});

test('tracker-binding REQ-001: project must match its type format', () => {
  assert.match(validateTrackerConfig({ ...valid.jira, project: 'prod' }).join('\n'), /jira project key/);
  assert.match(validateTrackerConfig({ ...valid.linear, project: 'eng team' }).join('\n'), /linear team key/);
  assert.match(validateTrackerConfig({ ...valid.github, project: 'shop' }).join('\n'), /owner\/repo/);
});

test('tracker-binding REQ-001: asdd check-config FAILs on a bad tracker block and passes without one', () => {
  const root = mkdtempSync(join(tmpdir(), 'tracker-config-'));
  try {
    for (const d of ['.harness/steering', '.harness/specs', '.harness/state', '.harness/features', '.harness/config']) mkdirSync(join(root, d), { recursive: true });
    writeFileSync(join(root, '.harness/PROGRESS.md'), '# Progress\n');
    for (const b of ['product', 'structure', 'tech', 'domain-layer.project', 'quality-gates.project']) writeFileSync(join(root, `.harness/steering/${b}.md`), `# ${b}\n`);
    const base = {
      schema_version: '1.0', project_id: 'demo', harness_version: '2.0', mode: 'lite',
      paths: { steering: '.harness/steering', specs: '.harness/specs', state: '.harness/state', features: '.harness/features', progress_index: '.harness/PROGRESS.md' },
      bindings: { product: '.harness/steering/product.md', structure: '.harness/steering/structure.md', tech: '.harness/steering/tech.md', domain_layer: '.harness/steering/domain-layer.project.md', quality_gates: '.harness/steering/quality-gates.project.md' },
      commands: { invariants: 'asdd check' }, modules: {}, capabilities: {},
    };
    const run = (cfg) => {
      writeFileSync(join(root, '.harness/config/project.json'), JSON.stringify(cfg));
      return spawnSync(process.execPath, [join(here, 'check-project-config.mjs')], { cwd: root, encoding: 'utf8' });
    };
    assert.equal(run(base).status, 0, 'no tracker block: unchanged');
    assert.equal(run({ ...base, tracker: valid.github }).status, 0);
    const bad = run({ ...base, tracker: { ...valid.github, type: 'trello' } });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /FAIL {2}\.harness\/config\/project\.json\.tracker\.type must be one of/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
