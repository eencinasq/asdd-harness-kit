import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { Finding, RuleMeta, RulePack } from '../analysis.types.ts';
import { countBy } from './count-by.ts';
import { buildDriftReport } from './drift-report.ts';
import { packsForMode, UnknownPackError } from './pack-selection.ts';
import { buildPackSummaries } from './pack-summary.ts';

const rule = (id: string, pack: string, severity: RuleMeta['severity']): RuleMeta => ({
	id,
	pack,
	severity,
	message: id,
	category: 'architecture',
	adr: null,
	mode: 'search',
});
const finding = (checkId: string, pack: string, severity: Finding['severity']): Finding => ({
	checkId,
	pack,
	severity,
	path: 'src/a.ts',
	startLine: 1,
	endLine: 1,
	message: 'm',
	category: 'architecture',
	adr: null,
});

const catalog = [
	rule('no-infra', 'boundaries', 'ERROR'),
	rule('no-any', 'quality', 'WARNING'),
	rule('taint', 'quality', 'INFO'),
];
const findings = [finding('no-infra', 'boundaries', 'ERROR'), finding('no-any', 'quality', 'WARNING')];

const pack = (id: string, kind: RulePack['kind'], set: string): RulePack => ({
	id,
	kind,
	set,
	path: `/r/${id}`,
	files: [`/r/${id}.yml`],
});
const AVAILABLE = [
	pack('architecture', 'set', 'architecture'),
	pack('boundaries', 'file', 'architecture'),
	pack('standards', 'set', 'standards'),
	pack('quality', 'file', 'standards'),
	pack('root-rules', 'file', ''),
];

describe('drift report', () => {
	test('separates drifting from clean rules, errors first', () => {
		const report = buildDriftReport(catalog, findings);
		assert.equal(report.totalRules, 3);
		assert.equal(report.driftingRules, 2);
		assert.equal(report.cleanRules, 1);
		assert.equal(report.topDrifts[0]?.ruleId, 'no-infra');
	});
});

describe('pack summaries', () => {
	test('curated label when known, generic otherwise', () => {
		const rows = buildPackSummaries(findings, countBy(catalog, 'pack'));
		assert.deepEqual(
			rows.map((r) => [r.id, r.title, r.status]),
			[
				['boundaries', 'Boundaries', 'findings'],
				['quality', 'Quality', 'findings'],
			],
		);
		assert.equal(rows[1]?.description, '2 rules');
	});
});

describe('pack selection', () => {
	test('picks packs by mode unless packs are given', () => {
		assert.deepEqual(
			packsForMode('spec-drift', AVAILABLE).map((p) => p.id),
			['architecture', 'standards', 'root-rules'],
		);
		assert.deepEqual(
			packsForMode('standards', AVAILABLE).map((p) => p.id),
			['standards'],
		);
		assert.deepEqual(
			packsForMode('architecture', AVAILABLE, ['quality']).map((p) => p.id),
			['quality'],
		);
	});

	test('spec-drift-depth REQ-003: architecture mode includes the dependencies set, alone when Semgrep has none', () => {
		const deps = pack('dependencies', 'set', 'dependencies');
		assert.deepEqual(
			packsForMode('architecture', [...AVAILABLE, deps]).map((p) => p.id),
			['architecture', 'dependencies'],
		);
		assert.deepEqual(
			packsForMode('architecture', [deps]).map((p) => p.id),
			['dependencies'],
		);
		assert.deepEqual(
			packsForMode('standards', [...AVAILABLE, deps]).map((p) => p.id),
			['standards'],
		);
	});

	test('unknown packs and missing sets fail with what exists', () => {
		assert.throws(
			() => packsForMode('all', AVAILABLE, ['nope']),
			(e: unknown) => e instanceof UnknownPackError && /Available: architecture, boundaries/.test(e.message),
		);
		assert.throws(
			() => packsForMode('architecture', [pack('quality', 'file', '')], undefined, '.semgrep'),
			/No \.semgrep\/architecture\//,
		);
	});
});
