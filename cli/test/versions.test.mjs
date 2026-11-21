import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkVersions } from '../src/kit/versions.mjs';

// A minimal synthetic kit root: package.json + registry + one shipped file.
function withKit(artifacts, fn) {
  return () => {
    const kit = mkdtempSync(join(tmpdir(), 'versions-test-'));
    try {
      mkdirSync(join(kit, 'cli/registry'), { recursive: true });
      mkdirSync(join(kit, 'cli/steering'), { recursive: true });
      writeFileSync(join(kit, 'package.json'), JSON.stringify({ version: '9.9.9' }));
      writeFileSync(join(kit, 'cli/registry/contribution-points.json'), JSON.stringify({
        schema_version: '1.0',
        contribution_points: {},
        files: [{ src: 'cli/steering/a.md', dest: '.harness/steering/a.md', class: 'steering', install: 'refresh', self: true }],
      }));
      writeFileSync(join(kit, 'cli/steering/a.md'), '# a');
      for (const [rel, doc] of Object.entries(artifacts ?? {})) {
        mkdirSync(join(kit, rel.split('/').slice(0, -1).join('/')), { recursive: true });
        writeFileSync(join(kit, rel), JSON.stringify(doc));
      }
      fn(kit);
    } finally {
      rmSync(kit, { recursive: true, force: true });
    }
  };
}

const freshDoc = { schema_version: '1.0', kit_version: '9.9.9', generated_at: 't', artifacts: { 'cli/steering/a.md': '9.9.9', 'cli/registry/contribution-points.json': '9.9.9' } };

test('checkVersions passes when cli/versions.json + installed copy match the recomputed set', withKit({
  'cli/versions.json': freshDoc,
  '.harness/config/versions.json': freshDoc,
}, (kit) => {
  assert.deepEqual(checkVersions(kit), []);
}));

test('checkVersions fails when cli/versions.json is missing', withKit({}, (kit) => {
  assert.ok(checkVersions(kit).some((p) => /missing.*versions\.json/.test(p)), checkVersions(kit).join(', '));
}));

test('checkVersions fails on artifact drift (missing/extra/stale entries)', withKit({
  'cli/versions.json': { ...freshDoc, artifacts: { 'cli/steering/a.md': '8.0.0', 'stale/file.md': '9.9.9' } },
  '.harness/config/versions.json': freshDoc,
}, (kit) => {
  const problems = checkVersions(kit).join('\n');
  assert.match(problems, /cli\/steering\/a\.md/);
  assert.match(problems, /cli\/registry\/contribution-points\.json/);
  assert.match(problems, /stale\/file\.md/);
}));

test('checkVersions fails when the installed copy diverges from cli/versions.json', withKit({
  'cli/versions.json': freshDoc,
  '.harness/config/versions.json': { ...freshDoc, kit_version: '8.0.0' },
}, (kit) => {
  assert.ok(checkVersions(kit).some((p) => /installed copy|differ/.test(p)), checkVersions(kit).join(', '));
}));

test('checkVersions fails on kit_version drift vs package.json', withKit({
  'cli/versions.json': { ...freshDoc, kit_version: '8.0.0' },
  '.harness/config/versions.json': freshDoc,
}, (kit) => {
  assert.ok(checkVersions(kit).some((p) => /kit_version/.test(p)), checkVersions(kit).join(', '));
}));
