/* biome-ignore-all lint/suspicious/noExplicitAny: assertions reach into open view-model shapes. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	actionsFor,
	kindOf,
	mergePage,
	messageFor,
	nextOffset,
	type Payload,
	payloadOf,
	resolveMode,
	traceSummary,
	triageCommand,
	viewModel,
} from './model.ts';

const view = (payload: Payload): any => viewModel(payload);
const finding = (id: string, severity: string, check = 'DRIFT-01') => ({
	id,
	check,
	severity,
	slice_id: 's1',
	node: null,
	paths: ['src/x.js'],
	message: `${id} msg`,
});

test('REQ-004: payload comes from structuredContent, else the JSON text fallback', () => {
	assert.deepEqual(payloadOf({ structuredContent: { a: 1 }, content: [{ type: 'text', text: '{"a":2}' }] }), { a: 1 });
	assert.deepEqual(payloadOf({ content: [{ type: 'text', text: '{"a":2}' }] }), { a: 2 });
	assert.equal(payloadOf({ content: [{ type: 'text', text: 'not json' }] }), null);
});

test('REQ-004: view model per tool, findings sorted by severity', () => {
	const diff = view({
		mode: 'author',
		findings: [finding('A', 'warn'), finding('B', 'fail')],
		suppressed: [{}],
		summary: { drift_level: 'blocking' },
		architecture: { status: 'unconfigured' },
	});
	assert.equal(diff.kind, 'diff');
	assert.deepEqual(
		diff.findings.map((f: any) => f.id),
		['B', 'A'],
	);
	assert.equal(diff.suppressed, 1);
	assert.deepEqual(diff.unconfigured, ['architecture']);
	const compliance = view({
		adapters: {
			ears: { status: 'pass', findings: [] },
			openapi: { status: 'fail', findings: [finding('C', 'fail', 'CONTRACT')] },
		},
		summary: {},
	});
	assert.equal(compliance.kind, 'compliance');
	assert.equal(compliance.findings[0].adapter, 'openapi');
	assert.deepEqual(
		compliance.adapters.map((a: any) => a.status),
		['pass', 'fail'],
	);
	assert.equal(kindOf({ findings: [], hotspots: [] }), 'audit');
	const architecture = view({
		status: 'fail',
		semgrep: { status: 'fail', source: 'generated', yaml: 'rules: []\n' },
		findings: [{ ...finding('S', 'fail', 'SEMGREP'), fix: 'import { Db } from "./port.js";', line: 3 }],
	});
	assert.equal(architecture.kind, 'architecture');
	assert.equal(architecture.findings[0].fix, 'import { Db } from "./port.js";');
	assert.equal(architecture.semgrep.source, 'generated');
	assert.deepEqual(architecture.unconfigured, []);
	const missing = view({
		status: 'error',
		semgrep: { status: 'unavailable', message: 'semgrep is not installed' },
		findings: [],
	});
	assert.deepEqual(missing.unconfigured, ['semgrep']);
	const audit = view({
		hotspots: [],
		unconfigured: ['semgrep'],
		semgrep: { status: 'fail', source: 'selected', path: '.semgrep.yml' },
		findings: [
			{
				...finding('S', 'fail', 'SEMGREP'),
				rule: 'layers.domain',
				code: 'import pg from "pg";',
				fix: 'import { Db } from "./port.js";',
				line: 1,
			},
		],
	});
	assert.equal(audit.kind, 'audit');
	assert.equal(audit.semgrep.path, '.semgrep.yml');
	assert.equal(audit.findings[0].fix, 'import { Db } from "./port.js";');
	assert.equal(audit.findings[0].code, 'import pg from "pg";');
	assert.deepEqual(audit.unconfigured, ['semgrep']);
});

test('REQ-004: every view lists its checks and a level, like spec compliance', () => {
	const arch = view({
		status: 'pass',
		command: 'node gate.mjs',
		exit_code: 0,
		semgrep: { status: 'unconfigured' },
		findings: [],
	});
	assert.deepEqual(
		arch.checks.map((c: any) => `${c.id}:${c.status}`),
		['gate:pass', 'semgrep:unconfigured'],
	);
	assert.equal(arch.level, 'clean');
	assert.equal(arch.showCompliance, false);
	const noGate = view({
		status: 'unconfigured',
		binding: 'domain-layer.project.md → Gate command',
		semgrep: { status: 'unconfigured' },
		findings: [],
	});
	assert.equal(noGate.checks[0].status, 'unconfigured');
	assert.equal(noGate.level, 'warning');
	assert.equal(
		view({ status: 'fail', command: 'x', exit_code: 1, semgrep: { status: 'pass' }, findings: [] }).level,
		'blocking',
	);

	const audit = view({
		summary: { drift_level: 'blocking', spec_compliance: 0.5 },
		hotspots: [],
		commands: [
			{ name: 'architecture', status: 'pass' },
			{ name: 'deps', status: 'fail' },
		],
		semgrep: { status: 'pass' },
		findings: [
			finding('A', 'fail', 'DRIFT-03'),
			{ ...finding('V', 'advisory', 'SPEC-VERDICT'), source: 'inferential', verdict: 'violated' },
		],
	});
	assert.deepEqual(
		audit.checks.map((c: any) => `${c.id}:${c.status}`),
		['architecture:pass', 'deps:fail', 'semgrep:pass', 'inferential:pass'],
	);
	assert.equal(audit.checks.at(-1).label, 'inferential: 1 verdict');
	assert.deepEqual(audit.sources, { computational: 1, inferential: 1 });
	const notJudged = view({ summary: {}, hotspots: [], commands: [], findings: [finding('A', 'fail')] });
	assert.equal(notJudged.checks.at(-1).status, 'unconfigured');
	assert.equal(notJudged.checks.at(-1).label, 'inferential: not run');

	const compliance = view({
		slice_id: 's1',
		adapters: {
			ears: { status: 'pass', spec_compliance: 0.75, findings: [] },
			openapi: { status: 'fail', findings: [finding('C', 'fail', 'CONTRACT')] },
		},
	});
	assert.equal(compliance.summary.spec_compliance, 0.75);
	assert.equal(compliance.level, 'blocking');
	assert.equal(compliance.showCompliance, true);
});

test('REQ-004: a cut result shows full totals and merges page results', () => {
	const cut = {
		summary: {},
		hotspots: [],
		commands: [],
		findings: [finding('A', 'fail')],
		recurring: 1,
		page: {
			token: 'p1',
			offset: 0,
			count: 1,
			total: 3,
			by_severity: { fail: 1, warn: 2 },
			by_source: { computational: 2, inferential: 1 },
		},
	};
	let vm = view(cut);
	assert.equal(vm.total, 3);
	assert.equal(vm.loaded, 1);
	assert.deepEqual(vm.counts, { fail: 1, warn: 2, advisory: 0 });
	assert.deepEqual(vm.sources, { computational: 2, inferential: 1 });
	assert.equal(nextOffset(cut), 1);
	const merged = mergePage(cut, {
		findings: [finding('A', 'fail'), finding('B', 'warn'), finding('C', 'warn')],
		next: null,
	});
	assert.equal(nextOffset(merged), null);
	vm = view(merged as Payload);
	assert.equal(vm.loaded, 3);
	assert.deepEqual(
		vm.findings.map((f: any) => f.id),
		['A', 'B', 'C'],
	);
	assert.equal(nextOffset({ findings: [] }), null);
});

test('REQ-004: every payload field reaches the view model', () => {
	const arch = view({
		status: 'fail',
		command: 'node check.mjs',
		exit_code: 1,
		output: 'src/a.js:1: bad',
		message: 'm',
		findings: [],
		sources: [{ id: 'domain-layer', path: '.harness/steering/domain-layer.md', filled: true }],
		semgrep: { status: 'pass', source: 'generated' },
	});
	assert.deepEqual(arch.details.architecture, {
		status: 'fail',
		command: 'node check.mjs',
		binding: null,
		exit_code: 1,
		output: 'src/a.js:1: bad',
		output_truncated: false,
		message: 'm',
		sources: [{ id: 'domain-layer', path: '.harness/steering/domain-layer.md', filled: true }],
		generate_prompt: null,
	});
	const audit = view({
		generated_at: '2026-10-20',
		commit: 'abc',
		path: '.harness/audits/x.json',
		summary: {},
		hotspots: [],
		findings: [finding('A', 'warn')],
		commands: [{ name: 'architecture', command: 'x', status: 'pass', exit_code: 0 }],
		notes: ['no base'],
		recurring: ['A'],
		reports: ['.harness/audits/x.json'],
	});
	assert.deepEqual(audit.details.meta, [
		['generated', '2026-10-20'],
		['commit', 'abc'],
		['report', '.harness/audits/x.json'],
	]);
	assert.deepEqual(audit.details.notes, ['no base']);
	assert.equal(audit.details.recurring, 1);
	assert.equal(audit.details.reports.length, 1);
	assert.equal(audit.findings[0].recurring, true);
	const diff = view({
		mode: 'review',
		findings: [],
		summary: {},
		architecture: { status: 'pass', command: 'c', sources: [] },
	});
	assert.deepEqual(diff.details.meta, [['mode', 'review']]);
	assert.equal(diff.details.architecture.command, 'c');

	const ci = view({
		provider: 'github',
		suggested_path: '.github/workflows/harness-gates.yml',
		content: 'name: x',
		note: 'n',
	});
	assert.equal(ci.kind, 'ci');
	assert.equal(ci.ci.content, 'name: x');
	const one = view({ finding: finding('A', 'fail'), trace: { nodes: [{ id: 'req:s1:REQ-001' }], edges: [] } });
	assert.equal(one.kind, 'finding');
	assert.equal(one.trace.nodes[0].id, 'req:s1:REQ-001');
});

test('REQ-004: actions depend on mode and only produce messages for the host', () => {
	assert.equal(resolveMode('audit_diff', { mode: 'review' }, {}), 'review');
	assert.equal(resolveMode('audit_report', {}, {}), 'review');
	assert.equal(resolveMode('verify_spec_compliance', {}, {}), 'author');
	assert.deepEqual(
		actionsFor('author').map((a: any) => a.id),
		['task'],
	);
	assert.deepEqual(
		actionsFor('review').map((a: any) => [a.id, Boolean(a.command)]),
		[
			['comment', false],
			['dismiss', true],
			['confirm', true],
		],
	);
	const f = finding('AUD-12345678', 'fail');
	assert.match(messageFor('task', f), /AUD-12345678/);
	assert.match(messageFor('comment', f), /Do not post/);
	assert.match(traceSummary({ indexed: false }), /asdd knowledge sync/);
});

test('spec-drift-apps REQ-003: triage is a command for a terminal, never a message to the model', () => {
	const f = finding('AUD-12345678', 'fail');
	assert.equal(
		triageCommand('dismiss', f, { reason: 'ADR-7 "intended"' }),
		'asdd triage AUD-12345678 --dismiss --reason "ADR-7 \\"intended\\""',
	);
	assert.equal(triageCommand('confirm', f), 'asdd triage AUD-12345678 --confirm');
	assert.equal(triageCommand('confirm', f, { reason: ' real ' }), 'asdd triage AUD-12345678 --confirm --reason "real"');
	assert.throws(() => messageFor('dismiss', f), /triage command/);
	assert.throws(() => messageFor('confirm', f), /triage command/);
});

test('spec-drift-apps REQ-002: a learning_report result is the read-only learning view', () => {
	const payload = {
		summary: { patterns: 2, open: 1, in_flight: 1, verified: 0, proposals: 1, unsigned_failures: 0 },
		patterns: [{ id: 'LP-1', status: 'open', next: 'asdd learn --propose LP-1' }],
		proposals: [
			{ id: 'SP-001', file: 'x', status: 'proposed', missing: ['success criterion is unfilled'], next: 'edit x' },
		],
		commands_note: 'This server writes nothing.',
	};
	assert.equal(kindOf(payload), 'learning');
	const vm = view(payload);
	assert.equal(vm.kind, 'learning');
	assert.equal(vm.learning.patterns[0].next, 'asdd learn --propose LP-1');
	assert.deepEqual(vm.learning.proposals[0].missing, ['success criterion is unfilled']);
	assert.equal(vm.learning.note, 'This server writes nothing.');
	assert.equal(
		kindOf({ mode: 'author', findings: [], learning: { patterns: [], open: 0 } }),
		'diff',
		'audit_diff keeps its kind',
	);
});

test('spec-drift-empty REQ-004: a no_data result is the "No data" view, not an error', () => {
	const noData = { reason: 'No audit report in .harness/audits/ yet.', next: 'Run asdd audit.' };
	for (const payload of [
		{ no_data: noData, findings: [], reports: [] },
		{ mode: 'author', no_data: noData, findings: [], suppressed: [] },
		{ slice_id: 's1', adapters: {}, summary: {}, findings: [], no_data: noData },
	]) {
		const vm = view(payload);
		assert.deepEqual(vm.noData, noData);
		assert.equal(vm.error, undefined);
		assert.deepEqual(vm.findings, []);
	}
});

test('spec-drift-empty REQ-003: an architecture check with no rules carries the agent prompt to the view', () => {
	const arch = {
		status: 'unconfigured',
		semgrep: { status: 'unconfigured' },
		sources: [],
		generate_prompt: '# Generate',
	};
	assert.equal(view(arch).details.architecture.generate_prompt, '# Generate');
	const diff = { mode: 'author', findings: [], architecture: { ...arch } };
	assert.equal(view(diff).details.architecture.generate_prompt, '# Generate');
	assert.equal(view({ ...arch, generate_prompt: undefined }).details.architecture.generate_prompt, null);
});

test('review-quality REQ-005: the learning view carries team review quality', () => {
	const reviews = { reviews: 3, drafted: 7, kept: 4, edited: 0, removed: 3, acceptance: 4 / 7, by_rule: [] };
	const vm = view({ summary: {}, patterns: [], proposals: [], commands_note: 'n', review_quality: reviews });
	assert.equal(vm.kind, 'learning');
	assert.deepEqual(vm.learning.reviews, reviews);
	assert.equal(view({ summary: {}, patterns: [], proposals: [], commands_note: 'n' }).learning.reviews, null);
});

test('spec-drift-depth REQ-001: a traceability_matrix result is the traceability view, also when empty', () => {
	const row = { slice: 's', req_id: 'REQ-001', title: 't', features: [], tests: [], prs: [], gaps: ['no-feature'] };
	const payload = { matrix: [row], totals: { requirements: 1, with_gaps: 1 }, markdown: '| x |\n', note: 'n' };
	assert.equal(kindOf(payload), 'traceability');
	const vm = view(payload);
	assert.equal(vm.traceability.rows[0].req_id, 'REQ-001');
	assert.equal(vm.traceability.totals.with_gaps, 1);
	assert.equal(vm.traceability.markdown, '| x |\n');
	const empty = view({
		matrix: [],
		totals: null,
		no_data: { reason: 'No knowledge index', next: 'asdd knowledge sync' },
	});
	assert.equal(empty.kind, 'traceability');
	assert.equal(empty.noData.next, 'asdd knowledge sync');
});
