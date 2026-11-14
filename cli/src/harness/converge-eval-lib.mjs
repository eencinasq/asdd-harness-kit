/**
 * Deterministic EARS / converge eval batch (ASDD-ROADMAP P3.5).
 * Fixtures under cli/eval/converge-ears/cases/*.json.
 */
import { existsSync, readdirSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runConverge } from './converge-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CASES_DIR = join(HERE, '../../eval/converge-ears/cases');

/**
 * Cheap EARS-shaped checks on requirement text (no LLM).
 * Codes: EARS-01 missing SHALL/MUST verb; EARS-02 no observable subject/system.
 */
export function judgeEarsRequirement(text) {
  const t = String(text || '');
  const codes = [];
  if (!/\b(SHALL|MUST|shall|must)\b/.test(t)) codes.push('EARS-01');
  if (!/\b(system|service|api|user|agent|harness|kit|cli|feature)\b/i.test(t)) codes.push('EARS-02');
  return codes;
}

/**
 * @param {object} c case fixture
 * @returns {{ id: string, actual: string[], expected: string[], ok: boolean, extra: string[], missing: string[] }}
 */
export function runCase(c) {
  const expected = new Set(Array.isArray(c.expected_codes) ? c.expected_codes : []);
  const actual = new Set();

  for (const req of c.requirements || []) {
    for (const code of judgeEarsRequirement(req.text)) actual.add(code);
  }

  const root = mkdtempSync(join(tmpdir(), 'converge-eval-'));
  try {
    const sliceId = c.slice_id || 'eval';
    mkdirSync(join(root, '.harness/specs', sliceId), { recursive: true });
    mkdirSync(join(root, '.harness/features'), { recursive: true });
    mkdirSync(join(root, 'test'), { recursive: true });

    const specLines = (c.requirements || []).map((r) => {
      const must = r.must === false ? 'SHOULD' : 'MUST';
      return `- **${r.id} (${must}).** ${r.text}`;
    });
    writeFileSync(join(root, '.harness/specs', sliceId, 'spec.md'), `# ${sliceId}\n\n${specLines.join('\n')}\n`);

    const testBody = Array.isArray(c.test_mentions) ? c.test_mentions.join('\n') : String(c.test_file || '');
    writeFileSync(join(root, 'test/eval.test.mjs'), `${testBody}\n`);

    const features = Array.isArray(c.features) ? c.features : [];
    writeFileSync(
      join(root, '.harness/features', `${sliceId}.features.json`),
      JSON.stringify({ schema_version: '1.0', slice_id: sliceId, source_tasks: 'x', features }, null, 2),
    );

    const slices = [
      {
        slice_id: sliceId,
        status: 'in_progress',
        phase: 'implementation',
        features,
      },
    ];
    const result = runConverge({
      root,
      slices,
      tests: ['test/eval.test.mjs'],
      strict: Boolean(c.strict),
    });
    for (const f of result.findings) actual.add(f.code);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  const actualList = [...actual].sort();
  const expectedList = [...expected].sort();
  const missing = expectedList.filter((x) => !actual.has(x));
  const extra = actualList.filter((x) => !expected.has(x));
  return {
    id: c.id || 'anonymous',
    actual: actualList,
    expected: expectedList,
    ok: missing.length === 0 && extra.length === 0,
    missing,
    extra,
    clean: Boolean(c.clean),
  };
}

export function loadCases(dir = DEFAULT_CASES_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((n) => JSON.parse(readFileSync(join(dir, n), 'utf8')));
}

export function runEvalSuite(opts = {}) {
  const dir = opts.casesDir || DEFAULT_CASES_DIR;
  const cases = opts.cases || loadCases(dir);
  const results = cases.map((c) => runCase(c));
  const failed = results.filter((r) => !r.ok);
  const clean = results.filter((r) => r.clean).length;
  return {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    clean,
    results,
    ok: failed.length === 0 && results.length >= 6 && clean >= 2,
  };
}

export function formatEvalReport(suite) {
  const lines = [
    `== converge-eval ==`,
    `  cases   ${suite.passed}/${suite.total} pass  (clean fixtures: ${suite.clean})`,
  ];
  for (const r of suite.results) {
    if (r.ok) lines.push(`  OK   ${r.id}`);
    else lines.push(`  FAIL ${r.id}  missing=[${r.missing}] extra=[${r.extra}] actual=[${r.actual}]`);
  }
  if (suite.total < 6) lines.push('  FAIL  need ≥6 cases');
  if (suite.clean < 2) lines.push('  FAIL  need ≥2 clean cases');
  return `${lines.join('\n')}\n`;
}
