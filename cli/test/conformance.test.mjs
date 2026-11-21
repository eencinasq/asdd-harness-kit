import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFixture } from './conformance/runner.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'conformance', 'fixtures');

for (const name of readdirSync(FIXTURES).filter((n) => n.endsWith('.json')).sort()) {
  const fixture = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
  test(`conformance: ${fixture.name}`, { timeout: 180000 }, () => {
    const r = runFixture(fixture);
    assert.ok(r.ok, `${fixture.name} failed:\n${(r.failures ?? [r.detail]).join('\n')}\nlog: ${r.log?.join(' | ')}\nstdout: ${r.stdout ?? ''}`);
  });
}
