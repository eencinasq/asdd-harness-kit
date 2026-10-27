import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionsFor, kindOf, mergePage, messageFor, nextOffset, payloadOf, resolveMode, traceSummary, viewModel } from './model.js';

const finding = (id, severity, check = 'DRIFT-01') => ({ id, check, severity, slice_id: 's1', node: null, paths: ['src/x.js'], message: `${id} msg` });

test('REQ-027: payload comes from structuredContent, else the JSON text fallback', () => {
  assert.deepEqual(payloadOf({ structuredContent: { a: 1 }, content: [{ type: 'text', text: '{"a":2}' }] }), { a: 1 });
  assert.deepEqual(payloadOf({ content: [{ type: 'text', text: '{"a":2}' }] }), { a: 2 });
  assert.equal(payloadOf({ content: [{ type: 'text', text: 'not json' }] }), null);
});

test('REQ-026: view model per tool, findings sorted by severity', () => {
  const diff = viewModel({ mode: 'author', findings: [finding('A', 'warn'), finding('B', 'fail')], suppressed: [{}], summary: { drift_level: 'blocking' }, architecture: { status: 'unconfigured' } });
  assert.equal(diff.kind, 'diff');
  assert.deepEqual(diff.findings.map((f) => f.id), ['B', 'A']);
  assert.equal(diff.suppressed, 1);
  assert.deepEqual(diff.unconfigured, ['architecture']);
  const compliance = viewModel({ adapters: { ears: { status: 'pass', findings: [] }, openapi: { status: 'fail', findings: [finding('C', 'fail', 'CONTRACT')] } }, summary: {} });
  assert.equal(compliance.kind, 'compliance');
  assert.equal(compliance.findings[0].adapter, 'openapi');
  assert.deepEqual(compliance.adapters.map((a) => a.status), ['pass', 'fail']);
  assert.equal(kindOf({ findings: [], hotspots: [] }), 'audit');
  const architecture = viewModel({
    status: 'fail',
    semgrep: { status: 'fail', source: 'generated', yaml: 'rules: []\n' },
    findings: [{ ...finding('S', 'fail', 'SEMGREP'), fix: 'import { Db } from "./port.js";', line: 3 }],
  });
  assert.equal(architecture.kind, 'architecture');
  assert.equal(architecture.findings[0].fix, 'import { Db } from "./port.js";');
  assert.equal(architecture.semgrep.source, 'generated');
  assert.deepEqual(architecture.unconfigured, []);
  const missing = viewModel({ status: 'error', semgrep: { status: 'unavailable', message: 'semgrep is not installed' }, findings: [] });
  assert.deepEqual(missing.unconfigured, ['semgrep']);
  const audit = viewModel({
    hotspots: [],
    unconfigured: ['semgrep'],
    semgrep: { status: 'fail', source: 'selected', path: '.semgrep.yml' },
    findings: [{ ...finding('S', 'fail', 'SEMGREP'), rule: 'layers.domain', code: 'import pg from "pg";', fix: 'import { Db } from "./port.js";', line: 1 }],
  });
  assert.equal(audit.kind, 'audit');
  assert.equal(audit.semgrep.path, '.semgrep.yml');
  assert.equal(audit.findings[0].fix, 'import { Db } from "./port.js";');
  assert.equal(audit.findings[0].code, 'import pg from "pg";');
  assert.deepEqual(audit.unconfigured, ['semgrep']);
});

test('REQ-026: every view lists its checks and a level, like spec compliance', () => {
  const arch = viewModel({ status: 'pass', command: 'node gate.mjs', exit_code: 0, semgrep: { status: 'unconfigured' }, findings: [] });
  assert.deepEqual(arch.checks.map((c) => `${c.id}:${c.status}`), ['gate:pass', 'semgrep:unconfigured']);
  assert.equal(arch.level, 'clean');
  assert.equal(arch.showCompliance, false);
  const noGate = viewModel({ status: 'unconfigured', binding: 'domain-layer.project.md → Gate command', semgrep: { status: 'unconfigured' }, findings: [] });
  assert.equal(noGate.checks[0].status, 'unconfigured');
  assert.equal(noGate.level, 'warning');
  assert.equal(viewModel({ status: 'fail', command: 'x', exit_code: 1, semgrep: { status: 'pass' }, findings: [] }).level, 'blocking');

  const audit = viewModel({
    summary: { drift_level: 'blocking', spec_compliance: 0.5 },
    hotspots: [],
    commands: [{ name: 'architecture', status: 'pass' }, { name: 'deps', status: 'fail' }],
    semgrep: { status: 'pass' },
    findings: [finding('A', 'fail', 'DRIFT-03'), { ...finding('V', 'advisory', 'SPEC-VERDICT'), source: 'inferential', verdict: 'violated' }],
  });
  assert.deepEqual(audit.checks.map((c) => `${c.id}:${c.status}`), ['architecture:pass', 'deps:fail', 'semgrep:pass', 'inferential:pass']);
  assert.equal(audit.checks.at(-1).label, 'inferential: 1 verdict');
  assert.deepEqual(audit.sources, { computational: 1, inferential: 1 });
  const notJudged = viewModel({ summary: {}, hotspots: [], commands: [], findings: [finding('A', 'fail')] });
  assert.equal(notJudged.checks.at(-1).status, 'unconfigured');
  assert.equal(notJudged.checks.at(-1).label, 'inferential: not run');

  const compliance = viewModel({ slice_id: 's1', adapters: { ears: { status: 'pass', spec_compliance: 0.75, findings: [] }, openapi: { status: 'fail', findings: [finding('C', 'fail', 'CONTRACT')] } } });
  assert.equal(compliance.summary.spec_compliance, 0.75);
  assert.equal(compliance.level, 'blocking');
  assert.equal(compliance.showCompliance, true);
});

test('REQ-026: a cut result shows full totals and merges page results', () => {
  const cut = {
    summary: {}, hotspots: [], commands: [], findings: [finding('A', 'fail')], recurring: 1,
    page: { token: 'p1', offset: 0, count: 1, total: 3, by_severity: { fail: 1, warn: 2 }, by_source: { computational: 2, inferential: 1 } },
  };
  let vm = viewModel(cut);
  assert.equal(vm.total, 3);
  assert.equal(vm.loaded, 1);
  assert.deepEqual(vm.counts, { fail: 1, warn: 2, advisory: 0 });
  assert.deepEqual(vm.sources, { computational: 2, inferential: 1 });
  assert.equal(nextOffset(cut), 1);
  const merged = mergePage(cut, { findings: [finding('A', 'fail'), finding('B', 'warn'), finding('C', 'warn')], next: null });
  assert.equal(nextOffset(merged), null);
  vm = viewModel(merged);
  assert.equal(vm.loaded, 3);
  assert.deepEqual(vm.findings.map((f) => f.id), ['A', 'B', 'C']);
  assert.equal(nextOffset({ findings: [] }), null);
});

test('REQ-026: every payload field reaches the view model', () => {
  const arch = viewModel({
    status: 'fail', command: 'node check.mjs', exit_code: 1, output: 'src/a.js:1: bad', message: 'm', findings: [],
    sources: [{ id: 'domain-layer', path: '.harness/steering/domain-layer.md', filled: true }], semgrep: { status: 'pass', source: 'generated' },
  });
  assert.deepEqual(arch.details.architecture, {
    status: 'fail', command: 'node check.mjs', binding: null, exit_code: 1, output: 'src/a.js:1: bad', output_truncated: false, message: 'm',
    sources: [{ id: 'domain-layer', path: '.harness/steering/domain-layer.md', filled: true }],
  });
  const audit = viewModel({
    generated_at: '2026-10-20', commit: 'abc', path: '.harness/audits/x.json', summary: {}, hotspots: [], findings: [finding('A', 'warn')],
    commands: [{ name: 'architecture', command: 'x', status: 'pass', exit_code: 0 }], notes: ['no base'], recurring: ['A'], reports: ['.harness/audits/x.json'],
  });
  assert.deepEqual(audit.details.meta, [['generated', '2026-10-20'], ['commit', 'abc'], ['report', '.harness/audits/x.json']]);
  assert.deepEqual(audit.details.notes, ['no base']);
  assert.equal(audit.details.recurring, 1);
  assert.equal(audit.details.reports.length, 1);
  assert.equal(audit.findings[0].recurring, true);
  const diff = viewModel({ mode: 'review', findings: [], summary: {}, architecture: { status: 'pass', command: 'c', sources: [] } });
  assert.deepEqual(diff.details.meta, [['mode', 'review']]);
  assert.equal(diff.details.architecture.command, 'c');

  const ci = viewModel({ provider: 'github', suggested_path: '.github/workflows/harness-gates.yml', content: 'name: x', note: 'n' });
  assert.equal(ci.kind, 'ci');
  assert.equal(ci.ci.content, 'name: x');
  const one = viewModel({ finding: finding('A', 'fail'), trace: { nodes: [{ id: 'req:s1:REQ-001' }], edges: [] } });
  assert.equal(one.kind, 'finding');
  assert.equal(one.trace.nodes[0].id, 'req:s1:REQ-001');
});

test('REQ-026: actions depend on mode and only produce messages for the host', () => {
  assert.equal(resolveMode('audit_diff', { mode: 'review' }, {}), 'review');
  assert.equal(resolveMode('audit_report', {}, {}), 'review');
  assert.equal(resolveMode('verify_spec_compliance', {}, {}), 'author');
  assert.deepEqual(actionsFor('author').map((a) => a.id), ['task']);
  assert.deepEqual(actionsFor('review').map((a) => a.id), ['comment', 'dismiss']);
  const f = finding('AUD-12345678', 'fail');
  assert.match(messageFor('task', f), /AUD-12345678/);
  assert.match(messageFor('comment', f), /Do not post/);
  assert.match(messageFor('dismiss', f, { reason: 'ADR-7 "intended"' }), /audit-triage\.mjs AUD-12345678 --dismiss --reason "ADR-7 \\"intended\\""/);
  assert.match(traceSummary({ indexed: false }), /sync-knowledge/);
});
