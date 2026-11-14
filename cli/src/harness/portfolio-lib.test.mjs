/** REQ-002 — portfolio read-only multi-repo */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildPortfolio } from './portfolio-lib.mjs';

function readStamp(p) {
  return `${statSync(p).mtimeMs}:${readFileSync(p, 'utf8').length}`;
}

test('REQ-002 summarizes sibling harness registries without writing', () => {
  const root = mkdtempSync(join(tmpdir(), 'asdd-portfolio-'));
  try {
    const a = join(root, 'repo-a');
    const b = join(root, 'repo-b');
    mkdirSync(join(a, '.harness/state'), { recursive: true });
    mkdirSync(join(b, '.harness/state'), { recursive: true });
    writeFileSync(
      join(a, '.harness/state/registry.json'),
      JSON.stringify({
        schema_version: '3.0',
        slices: [
          { slice_id: 'x', status: 'DONE', mode: 'lite' },
          { slice_id: 'y', status: 'in_progress', mode: 'escalated' },
        ],
      }),
    );
    writeFileSync(
      join(b, '.harness/state/registry.json'),
      JSON.stringify({ schema_version: '3.0', slices: [{ slice_id: 'z', status: 'DONE', mode: 'hotfix' }] }),
    );
    mkdirSync(join(root, '.harness/config'), { recursive: true });
    writeFileSync(
      join(root, '.harness/config/portfolio.json'),
      JSON.stringify({
        repos: [
          { id: 'a', path: 'repo-a' },
          { id: 'b', path: 'repo-b' },
          { id: 'missing', path: 'nope' },
        ],
      }),
    );

    const before = readStamp(join(a, '.harness/state/registry.json'));
    const report = buildPortfolio(root);
    assert.equal(report.repos.filter((r) => r.ok).length, 2);
    const ra = report.repos.find((r) => r.id === 'a');
    assert.equal(ra.slice_count, 2);
    assert.equal(ra.by_status.DONE, 1);
    assert.ok(report.warns.some((w) => /missing/.test(w)));
    assert.equal(readStamp(join(a, '.harness/state/registry.json')), before, 'must not write sibling repos');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
