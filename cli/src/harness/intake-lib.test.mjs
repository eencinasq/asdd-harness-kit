/**
 * intent-intake — REQ-001…REQ-004: parse and validate tracker Intent items, re-check grounding, import them as slices.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { groundingFindings, parseIntentItem, parseRef, renderIntentMd, staleRefs, validateIntentItem } from './intake-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const INTAKE = join(HERE, 'intake.mjs');

export function item({ block = {}, drop = [], grounding, fitness = 'fit' } = {}) {
  const keys = {
    intent_format: '1',
    slice_id: 'checkout-saved-cards',
    mode: 'lite',
    pitch: 'PROD-120',
    scope_id: 'SCOPE-02',
    betting_state: 'bet',
    cycle: '2026-C4',
    appetite: '6 weeks for the whole pitch',
    reference_slices: 'payments-tokenize',
    decided_by: 'maria.po',
    ...block,
  };
  for (const k of drop) delete keys[k];
  const rows = grounding ?? [
    '| Reuse | Card tokenization | REQ:payments-tokenize/REQ-003, path:src/payments/tokenize.ts |',
    '| Extend | Payment step | slice:payments-tokenize, path:src/checkout/PaymentStep.tsx#L40 |',
    '| New | Saved-cards list | none |',
  ];
  return [
    '```asdd-intent',
    ...Object.entries(keys).map(([k, v]) => `${k}: ${v}`),
    '```',
    '',
    '## Problem',
    'Returning buyers retype their card.',
    '',
    '## Desired Outcome',
    'A returning buyer pays with a saved card.',
    '',
    '## Appetite',
    '6 weeks for the whole pitch.',
    '- payments-tokenize: 4 features',
    '',
    '## Must-have outcomes',
    '- **MH-01:** When a buyer has a saved card, the checkout shall offer it.',
    '',
    '## No-gos',
    '- No new payment provider.',
    '',
    '## Grounding',
    '',
    '| Kind | What | Evidence |',
    '|---|---|---|',
    ...rows,
    '',
    '## Intent fitness',
    '- one_outcome: yes',
    '- lite_fit: yes',
    '- ears_ready: yes',
    '- self_contained: yes',
    `- status: ${fitness}`,
    '- decided_by: maria.po',
    '',
  ].join('\n');
}

/** A temp repo where the item's evidence resolves. */
export function repo({ manifest = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'asdd-intake-'));
  const w = (rel, text) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  w('.harness/specs/payments-tokenize/requirements.md', '- **REQ-003.** The system shall tokenize cards.\n');
  mkdirSync(join(root, '.harness/state/slices/payments-tokenize/sessions'), { recursive: true });
  w('src/payments/tokenize.ts', 'export {};\n');
  w('src/checkout/PaymentStep.tsx', 'export {};\n');
  if (manifest) w('.harness/state/manifest.json', `${JSON.stringify({ schema_version: '3.0', active_slices: [] })}\n`);
  return root;
}

test('intent-intake REQ-001 a valid item parses with no errors', () => {
  const parsed = parseIntentItem(item());
  assert.deepEqual(validateIntentItem(parsed).errors, []);
  assert.equal(parsed.block.slice_id, 'checkout-saved-cards');
  assert.equal(parsed.grounding.length, 3);
  assert.deepEqual(parsed.grounding[0].refs.map((r) => r.kind), ['REQ', 'path']);
});

test('intent-intake REQ-001 missing keys and headings are each named', () => {
  const text = item({ drop: ['cycle', 'decided_by'] }).replace('## No-gos\n- No new payment provider.\n', '');
  const { errors } = validateIntentItem(parseIntentItem(text));
  assert.ok(errors.some((e) => /missing key: cycle/.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => /missing key: decided_by/.test(e)));
  assert.ok(errors.some((e) => /missing heading: ## No-gos/.test(e)));
});

test('intent-intake REQ-001 block values, fitness, and grounding rules are enforced', () => {
  const bad = (opts, re) => {
    const { errors } = validateIntentItem(parseIntentItem(item(opts)));
    assert.ok(errors.some((e) => re.test(e)), `${re} not in:\n${errors.join('\n')}`);
  };
  bad({ block: { mode: 'big' } }, /mode/);
  bad({ block: { betting_state: 'shaped' } }, /betting_state/);
  bad({ block: { slice_id: 'Bad Id' } }, /slice_id/);
  bad({ block: { intent_format: '2' } }, /intent_format/);
  bad({ fitness: 'not_fit' }, /Intent fitness/);
  bad({ grounding: [] }, /at least one row/);
  bad({ grounding: ['| Maybe | x | none |'] }, /Kind/);
  bad({ grounding: ['| Reuse | x | none |'] }, /needs evidence/);
  bad({ grounding: ['| New | x | ticket:42 |'] }, /unknown ref/);
  bad({ grounding: ['| Extend | x | path:../secrets |'] }, /inside the repository/);
  bad({ grounding: ['| Extend | x | path:/etc/passwd |'] }, /inside the repository/);
  assert.equal(parseIntentItem('no block here').block, null);
  assert.ok(validateIntentItem(parseIntentItem('no block here')).errors.some((e) => /asdd-intent/.test(e)));
});

test('intent-intake REQ-001 unknown block keys are warnings, not errors', () => {
  const { errors, warnings } = validateIntentItem(parseIntentItem(item({ block: { colour: 'blue' } })));
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((w) => /colour/.test(w)));
});

test('intent-intake REQ-003 refs resolve against the repository; stale ones are listed', () => {
  const root = repo();
  try {
    assert.deepEqual(parseRef('path:src/a.ts#L3'), { kind: 'path', value: 'src/a.ts', raw: 'path:src/a.ts#L3' });
    assert.deepEqual(staleRefs(root, parseIntentItem(item()).grounding), []);
    const stale = staleRefs(root, parseIntentItem(item({ grounding: [
      '| Reuse | gone | REQ:payments-tokenize/REQ-099, slice:nope, path:src/missing.ts |',
    ] })).grounding);
    assert.deepEqual(stale.map((s) => s.ref), ['REQ:payments-tokenize/REQ-099', 'slice:nope', 'path:src/missing.ts']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('intent-intake REQ-002 intent.md carries the sections and a generated Source', () => {
  const md = renderIntentMd(parseIntentItem(item()), { ref: 'https://acme.atlassian.net/browse/PROD-131', stale: [] });
  assert.match(md, /^# Intent: checkout-saved-cards\n/);
  assert.match(md, /## Source\n[\s\S]*Tracker URL:\*\* https:\/\/acme\.atlassian\.net\/browse\/PROD-131/);
  assert.match(md, /\*\*Pitch ID:\*\* PROD-120/);
  assert.match(md, /\*\*Betting state:\*\* `bet`/);
  for (const h of ['## Problem', '## Desired Outcome', '## Grounding', '## Intent fitness']) assert.ok(md.includes(h), h);
  assert.ok(!md.includes('```asdd-intent'), 'the machine block is not copied');
});

test('intent-intake REQ-004 groundingFindings: legacy intents are silent, bad refs are reported', () => {
  const root = repo();
  try {
    assert.deepEqual(groundingFindings(root, '# Intent: x\n\n## Problem\nlegacy\n'), []);
    const md = renderIntentMd(parseIntentItem(item()), { ref: 'u', stale: [] });
    assert.deepEqual(groundingFindings(root, md), []);
    rmSync(join(root, 'src/payments/tokenize.ts'));
    const f = groundingFindings(root, md);
    assert.equal(f.length, 1);
    assert.match(f[0], /path:src\/payments\/tokenize\.ts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function runIntake(root, args, input) {
  return spawnSync(process.execPath, [INTAKE, ...args], { cwd: root, encoding: 'utf8', input });
}

test('intent-intake REQ-002 asdd intake creates the slice in the suggested mode with intent.md and a source block', () => {
  const root = repo();
  try {
    writeFileSync(join(root, 'item.md'), item({ block: { mode: 'full' } }));
    const r = runIntake(root, ['--from', 'item.md', '--ref', 'https://acme.atlassian.net/browse/PROD-131']);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const intent = readFileSync(join(root, '.harness/specs/checkout-saved-cards/intent.md'), 'utf8');
    assert.match(intent, /Tracker URL:\*\* https:\/\/acme\.atlassian\.net\/browse\/PROD-131/);
    const sessions = join(root, '.harness/state/slices/checkout-saved-cards/sessions');
    const first = JSON.parse(readFileSync(join(sessions, readdirSync(sessions).sort()[0]), 'utf8'));
    assert.equal(first.mode, 'full');
    assert.equal(first.source.tracker_url, 'https://acme.atlassian.net/browse/PROD-131');
    assert.equal(first.source.pitch_id, 'PROD-120');
    assert.equal(first.source.scope_id, 'SCOPE-02');
    // A second intake of the same slice is refused
    const again = runIntake(root, ['--from', 'item.md', '--ref', 'u']);
    assert.notEqual(again.status, 0);
    assert.match(again.stderr, /already exists/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('intent-intake REQ-001 REQ-003 asdd intake rejects invalid items and stops on stale refs unless --accept-stale', () => {
  const root = repo();
  try {
    const bad = runIntake(root, ['--from', '-', '--ref', 'u'], item({ drop: ['cycle'] }));
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /missing key: cycle/);
    assert.ok(!existsSync(join(root, '.harness/specs/checkout-saved-cards')), 'nothing written');

    const staleItem = item({ grounding: ['| Reuse | gone | path:src/missing.ts |'] });
    const stopped = runIntake(root, ['--from', '-', '--ref', 'u'], staleItem);
    assert.notEqual(stopped.status, 0);
    assert.match(stopped.stderr, /stale.*path:src\/missing\.ts/s);
    assert.ok(!existsSync(join(root, '.harness/state/slices/checkout-saved-cards')));

    const dry = runIntake(root, ['--from', '-', '--ref', 'u', '--accept-stale', '--dry-run', '--json'], staleItem);
    assert.equal(dry.status, 0, dry.stderr);
    const plan = JSON.parse(dry.stdout);
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.stale.map((s) => s.ref), ['path:src/missing.ts']);
    assert.ok(!existsSync(join(root, '.harness/state/slices/checkout-saved-cards')), 'dry run writes nothing');

    const ok = runIntake(root, ['--from', '-', '--ref', 'u', '--accept-stale'], staleItem);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(readFileSync(join(root, '.harness/specs/checkout-saved-cards/intent.md'), 'utf8'), /Stale at intake:\*\* path:src\/missing\.ts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('intent-intake REQ-002 --from accepts only a local file or stdin', () => {
  const root = repo();
  try {
    const r = runIntake(root, ['--from', 'https://example.com/item.md', '--ref', 'u']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /local file or "-"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('intent-intake REQ-004 the validator reports stale grounding: WARN by default, FAIL with drift.intent_evidence fail', async () => {
  const { default: validate } = await import('./validators/intent-evidence.mjs');
  const root = repo();
  try {
    writeFileSync(join(root, 'item.md'), item());
    assert.equal(runIntake(root, ['--from', 'item.md', '--ref', 'u']).status, 0);
    const manifest = JSON.parse(readFileSync(join(root, '.harness/state/manifest.json'), 'utf8'));
    const run = (project) => {
      mkdirSync(join(root, '.harness/config'), { recursive: true });
      writeFileSync(join(root, '.harness/config/project.json'), JSON.stringify(project));
      const out = { fail: [], warn: [] };
      validate({ root, manifest, fail: (m) => out.fail.push(m), warn: (m) => out.warn.push(m) });
      return out;
    };
    assert.deepEqual(run({}), { fail: [], warn: [] });
    rmSync(join(root, 'src/checkout/PaymentStep.tsx'));
    const w = run({});
    assert.equal(w.fail.length, 0);
    assert.match(w.warn[0], /INTENT-EVIDENCE checkout-saved-cards: .*path:src\/checkout\/PaymentStep\.tsx/);
    const f = run({ drift: { intent_evidence: 'fail' } });
    assert.equal(f.warn.length, 0);
    assert.equal(f.fail.length, 1);
    // Closed slices hold historical evidence
    writeFileSync(join(root, '.harness/state/slices/checkout-saved-cards/manifest.json'), JSON.stringify({ status: 'DONE' }));
    assert.deepEqual(run({ drift: { intent_evidence: 'fail' } }), { fail: [], warn: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('intake-fitness-format REQ-001 the template fitness bullet (**status:** fit) is accepted; other values are not', () => {
  for (const line of ['- **status:** fit', '- **status**: fit', '- status: fit']) {
    const text = item().replace(/^- status: fit$/m, line);
    assert.deepEqual(validateIntentItem(parseIntentItem(text)).errors, [], line);
  }
  const unfit = item().replace(/^- status: fit$/m, '- **status:** unfit');
  assert.ok(validateIntentItem(parseIntentItem(unfit)).errors.includes('## Intent fitness: status must be fit'));
});
