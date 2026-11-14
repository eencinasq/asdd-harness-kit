import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { countBy } from '../../domain/count-by.ts';
import { SemgrepAnalyzer } from './semgrep.analyzer.ts';
import { normalizeCheckId, parseFindings, parseSemgrepJson, parseTestOutput } from './semgrep-output.ts';
import { packIdFromFile, parseRuleCatalog, toSeverity } from './semgrep-rules.ts';

const BOUNDARIES_YAML = `rules:
  - id: mmlc.arch.boundary.no-infra-in-domain
    languages: [typescript]
    severity: ERROR
    message: >-
      Domain must not import
      infrastructure.
    metadata:
      category: architecture
      mmlc:
        adr: ADR-0010
    pattern: import "infra"
`;

// A different team's layout: plain ids, adr directly in metadata, no category.
const OTHER_YAML = `rules:
- id: no-explicit-any
  languages: [typescript]
  severity: warning
  message: Avoid any
  metadata: { adr: [ADR-7, ADR-9] }
  pattern: any
- id: taint-sql
  mode: taint
  languages: [typescript]
  severity: INFO
  message: tainted
  pattern-sources: [{ pattern: req.body }]
  pattern-sinks: [{ pattern: db.query(...) }]
`;

const catalog = [
	...parseRuleCatalog(BOUNDARIES_YAML, { pack: 'boundaries', set: 'architecture' }),
	...parseRuleCatalog(OTHER_YAML, { pack: 'quality', set: 'standards' }),
];

const SEMGREP_JSON = JSON.stringify({
	results: [
		{
			check_id: 'semgrep.architecture.mmlc.arch.boundary.no-infra-in-domain',
			path: 'src/domain/a.ts',
			start: { line: 3 },
			end: { line: 3 },
			extra: { severity: 'error', message: 'nope', metadata: { mmlc: { adr: 'ADR-0010' } } },
		},
		{
			check_id: 'semgrep.standards.no-explicit-any',
			path: 'src/b.ts',
			start: { line: 1 },
			end: { line: 1 },
			extra: { severity: 'WARNING', message: 'x' },
		},
	],
});

describe('rule catalog (YAML)', () => {
	test('reads ids, severities, folded messages, ADRs and taint mode from any layout', () => {
		assert.equal(catalog.length, 3);
		assert.equal(catalog[0]?.message, 'Domain must not import infrastructure.');
		assert.equal(catalog[0]?.adr, 'ADR-0010');
		assert.equal(catalog[1]?.severity, 'WARNING');
		assert.equal(catalog[1]?.adr, 'ADR-7, ADR-9');
		assert.equal(catalog[1]?.category, 'standards', 'falls back to the set name');
		assert.equal(catalog[2]?.mode, 'taint');
	});

	test('invalid YAML yields no rules instead of failing the scan', () => {
		assert.deepEqual(parseRuleCatalog('rules: [unclosed', { pack: 'x', set: '' }), []);
	});
});

describe('semgrep output', () => {
	test('maps config-prefixed check ids back to declared rule ids (any naming scheme)', () => {
		assert.equal(
			normalizeCheckId('semgrep.architecture.mmlc.arch.boundary.no-infra-in-domain', catalog),
			'mmlc.arch.boundary.no-infra-in-domain',
		);
		assert.equal(normalizeCheckId('semgrep.standards.no-explicit-any', catalog), 'no-explicit-any');
		assert.equal(normalizeCheckId('some.unknown-rule', catalog), 'some.unknown-rule');
	});

	test('attributes findings to the pack (file) that declares the rule', () => {
		const findings = parseFindings(parseSemgrepJson(SEMGREP_JSON), catalog);
		assert.deepEqual(countBy(findings, 'pack'), { boundaries: 1, quality: 1 });
		assert.equal(findings[0]?.adr, 'ADR-0010');
		assert.equal(findings[1]?.adr, 'ADR-7, ADR-9', 'ADR from the catalog when the result has none');
	});

	test('treats invalid semgrep output as no results', () => {
		assert.equal(parseSemgrepJson('not json'), undefined);
		assert.deepEqual(parseFindings(undefined, catalog), []);
	});
});

describe('rule files', () => {
	test('derives pack ids from file names', () => {
		assert.equal(packIdFromFile('01-boundaries.yml'), 'boundaries');
		assert.equal(packIdFromFile('coding-standards.yaml'), 'coding-standards');
	});

	test('maps old and new Semgrep severities onto ERROR / WARNING / INFO', () => {
		assert.deepEqual(
			['CRITICAL', 'high', 'Error', 'MEDIUM', 'warning', 'LOW', 'INFO', 'odd'].map((s) => toSeverity(s)),
			['ERROR', 'ERROR', 'ERROR', 'WARNING', 'WARNING', 'INFO', 'INFO', 'INFO'],
		);
	});
});

describe('rule-coverage REQ-003/004: rule tests', () => {
	test('semgrep --test output → passed / failed per annotated rule, and the files with errors', () => {
		const out = JSON.stringify({
			config_missing_tests: ['.semgrep/standards/x.yml'],
			config_with_errors: [{ file: '.semgrep/broken.yml' }],
			results: {
				'.semgrep/architecture/a.yml': {
					checks: { 'demo.ok': { passed: true }, 'demo.bad': { passed: false } },
				},
			},
		});
		assert.deepEqual(parseTestOutput(out), {
			byRule: { 'demo.ok': 'passed', 'demo.bad': 'failed' },
			invalidFiles: ['.semgrep/broken.yml'],
		});
		assert.equal(parseTestOutput('not json'), undefined);
	});

	test('the authoring guide requires a test file per rule file and semgrep --test', () => {
		const guide = new SemgrepAnalyzer({} as never).authoringGuide().join('\n');
		assert.match(guide, /ruleid: <rule id>/);
		assert.match(guide, /ok: <rule id>/);
		assert.match(guide, /semgrep --test \.semgrep/);
	});
});
