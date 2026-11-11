import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { diffForFiles, reReviewSection, withoutDuplicates } from '../context/review-context.ts';
import {
	activateNextGroup,
	completeGroup,
	coverageSummary,
	initProgress,
	lineRanges,
	reviewStage,
	withRequirementsStep,
	withVerificationStep,
} from '../coverage/coverage.ts';
import type { ReviewFinding } from '../engine/types.ts';
import { buildPublishMetrics, parseMetricsLog, summarizeMetrics } from '../metrics/review-metrics.ts';
import type { ReviewUnitsView } from '../pr-review.types.ts';
import {
	applyVerification,
	draftFindings,
	findingExcerpt,
	verificationInstruction,
	verificationReportSection,
} from './verification.ts';

const finding = (over: Partial<ReviewFinding>): ReviewFinding => ({
	path: 'src/a.ts',
	content: 'JSON.parse throws on invalid input; the handler returns 500.',
	startLine: 6,
	endLine: 6,
	severity: 'high',
	category: 'bug',
	...over,
});

describe('verification pass', () => {
	const findings = [
		finding({ confidence: 80, evidence: 'called from the POST handler' }),
		finding({ path: 'src/b.ts', severity: 'medium' }),
		finding({ path: 'src/c.ts' }),
	];

	test('the instruction lists every finding with its id, confidence and evidence', () => {
		const text = verificationInstruction(findings);
		assert.match(text, /F1 \[high · confidence 80\] src\/a\.ts:6/);
		assert.match(text, /evidence: called from the POST handler/);
		assert.match(text, /F3 \[high\] src\/c\.ts:6/);
	});

	test('each finding comes with the code around it, so the verifier rarely needs to read files', () => {
		const file = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n');
		const excerpt = findingExcerpt(file, { startLine: 6, endLine: 7 });
		assert.equal(excerpt.split('\n').length, 12, 'lines 1-12: 5 before, the finding, 5 after');
		assert.match(excerpt, /^ {4}1 {2}line 1\n/);
		assert.match(excerpt, /\n {3}12 {2}line 12$/);
		const text = verificationInstruction(findings, [excerpt]);
		assert.match(text, /F1 [^\n]*\n[\s\S]*<code path="src\/a\.ts" source="untrusted">\n {4}1 {2}line 1/);
		assert.equal(text.match(/<code /g)?.length, 1, 'no excerpt when the file could not be read');
	});

	test('every finding needs a verdict; ids are case-insensitive', () => {
		const partial = applyVerification(findings, [
			{ id: 'f1', verdict: 'confirmed' },
			{ id: 'F9', verdict: 'rejected' },
		]);
		assert.deepEqual(partial.missing, ['F2', 'F3']);
		assert.deepEqual(partial.unknown, ['F9']);
	});

	test('rejected findings are dropped, plausible ones go to the summary', () => {
		const { findings: verified } = applyVerification(findings, [
			{ id: 'F1', verdict: 'confirmed' },
			{ id: 'F2', verdict: 'plausible', note: 'depends on caller' },
			{ id: 'F3', verdict: 'rejected', note: 'guarded in middleware' },
		]);
		const drafted = draftFindings(verified);
		assert.equal(drafted.length, 2);
		assert.equal(drafted[1]?.severity, 'low', 'plausible → summary');
		assert.match(drafted[1]?.content ?? '', /^Worth a look \(unconfirmed\):/);
		assert.match(
			verificationReportSection(verified),
			/1 confirmed · 1 plausible .* 1 rejected[\s\S]*src\/c\.ts:6.*guarded in middleware/,
		);
	});

	test('coverage: groups → verification → requirements → done', () => {
		const units = {
			groups: [{ label: 'g', files: ['src/a.ts'], ruleDocId: 'r', rulePattern: '*', ruleMarkdown: '' }],
		} as unknown as ReviewUnitsView;
		let progress = initProgress(units, 'pending');
		progress = withVerificationStep(completeGroup(progress, { groupIndex: 0, newFindings: [finding({})] }).progress);
		assert.equal(reviewStage(progress), 'verification');
		assert.equal(progress.complete, false);
		progress = withVerificationStep({
			...progress,
			findings: applyVerification(progress.findings, [{ id: 'F1', verdict: 'confirmed' }]).findings,
		});
		assert.equal(reviewStage(progress), 'requirements');
		assert.equal(withRequirementsStep(progress, 'done').complete, true);

		const clean = withVerificationStep(completeGroup(initProgress(units), { groupIndex: 0, newFindings: [] }).progress);
		assert.equal(clean.verification, undefined, 'nothing to verify');
		assert.equal(clean.complete, true);
	});
});

describe('review context', () => {
	const DIFF = [
		'diff --git a/src/a.ts b/src/a.ts',
		'--- a/src/a.ts',
		'+++ b/src/a.ts',
		'@@ -1 +1,2 @@',
		'+const x = 1;',
		'diff --git a/docs/List Tasks (v1).yml b/docs/List Tasks (v1).yml',
		'+++ b/docs/List Tasks (v1).yml',
		'+name: x',
		'',
	].join('\n');

	test('a group gets only its files’ diff, as untrusted data', () => {
		const block = diffForFiles(DIFF, ['docs/List Tasks (v1).yml']);
		assert.match(block, /^<diff files="1" source="untrusted">\ndiff --git a\/docs\/List Tasks \(v1\)\.yml/);
		assert.doesNotMatch(block, /src\/a\.ts/);
		assert.equal(diffForFiles(DIFF, ['nope.ts']), '');
	});

	test('over budget, whole files are left out and named (never a file cut mid-line)', () => {
		const both = ['src/a.ts', 'docs/List Tasks (v1).yml'];
		const block = diffForFiles(DIFF, both, 100);
		assert.match(block, /diff --git a\/src\/a\.ts/);
		assert.doesNotMatch(block, /name: x/);
		assert.match(block, /not shown: docs\/List Tasks \(v1\)\.yml\. Read them with pr_review_read_file/);

		const cut = diffForFiles(DIFF, ['src/a.ts'], 50);
		assert.match(cut, /\n--- a\/src\/a\.ts\n\[diff budget reached — not shown: src\/a\.ts \(rest of the file\)/);
	});

	test('findings that repeat a comment already on the same lines are dropped', () => {
		const { kept, duplicates } = withoutDuplicates(
			[finding({}), finding({ path: 'src/b.ts', content: 'Missing await on save().' })],
			[{ path: 'src/a.ts', line: 7, author: 'ana', body: 'JSON.parse throws on invalid input, handler returns 500' }],
		);
		assert.equal(kept.length, 1);
		assert.equal(duplicates[0]?.of.author, 'ana');
	});

	test('re-review section: changed files and previous comments to re-check', () => {
		const text = reReviewSection({
			previousHeadSha: 'abcdef1234',
			changedSinceLastReview: ['src/a.ts'],
			previousComments: [{ path: 'src/a.ts', line: 6, side: 'RIGHT', body: 'Validate input.' }],
		});
		assert.match(
			text,
			/Previous review at `abcdef12`[\s\S]*Changed since then .*src\/a\.ts[\s\S]*src\/a\.ts:6: Validate input\./,
		);
		assert.match(reReviewSection({ previousHeadSha: 'x', previousComments: [] }), /history rewritten\?/);
	});
});

describe('review quality metrics', () => {
	const record = buildPublishMetrics({
		project: 'demo',
		pr: 42,
		revision: 1,
		pending: false,
		event: 'COMMENT',
		suggestedEvent: 'REQUEST_CHANGES',
		check: {
			warnings: [],
			eventChanged: true,
			hasOriginal: true,
			summaryChange: { kind: 'edited', key: 'summary' },
			changes: [
				{ kind: 'unchanged', key: 'src/a.ts:6-6' },
				{ kind: 'removed', key: 'src/b.ts:3-3' },
				{ kind: 'added', key: 'src/c.ts:1-1' },
			],
		},
		findings: [
			finding({ verdict: 'confirmed' }),
			finding({ path: 'src/b.ts', startLine: 3, endLine: 3, severity: 'medium', verdict: 'confirmed' }),
		],
		ruleOfFile: (p) => (p === 'src/a.ts' ? 'rules/ts' : 'rules/generic'),
		now: new Date('2026-11-09T10:00:00Z'),
	});

	test('per review: kept / removed / added, by severity and rule', () => {
		assert.deepEqual(record.comments, { drafted: 2, kept: 1, edited: 0, removed: 1, added: 1 });
		assert.deepEqual(record.bySeverity['medium'], { drafted: 1, kept: 0, edited: 0, removed: 1 });
		assert.deepEqual(record.byRule['rules/ts'], { drafted: 1, kept: 1, edited: 0, removed: 0 });
		assert.equal(record.summaryEdited, true);
	});

	test('summary across reviews, tolerant of corrupt log lines', () => {
		const records = parseMetricsLog(`${JSON.stringify(record)}\nnot json\n${JSON.stringify(record)}\n`);
		assert.equal(records.length, 2);
		const text = summarizeMetrics(records);
		assert.match(text, /over 2 published review/);
		assert.match(text, /Inline comments: 4 drafted · kept 50% · edited 0% · removed 50%/);
		assert.match(text, /verdict changed by the human: 2/);
		assert.match(summarizeMetrics([]), /No published reviews recorded yet/);
	});
});

describe('compact loop context', () => {
	test('commentable lines are sent as ranges', () => {
		assert.equal(lineRanges([9, 1, 2, 3, 7, 10, 3]), '1-3, 7, 9-10');
		assert.equal(lineRanges([4]), '4');
		assert.equal(lineRanges([]), '');
	});

	test('the coverage summary stays a few lines however many groups there are', () => {
		const groups = Array.from({ length: 30 }, (_, i) => ({
			label: `g${i}`,
			files: [`src/f${i}.ts`],
			ruleDocId: 'r',
			rulePattern: '*',
			ruleMarkdown: '',
		}));
		const progress = activateNextGroup(initProgress({ groups, rightLinesByPath: {} } as unknown as ReviewUnitsView));
		const summary = coverageSummary(progress);
		assert.deepEqual(summary.split('\n'), [
			'Coverage: 0/30 groups done · 0 finding(s) · complete=false',
			'In review: [0] g0',
			`Pending: ${Array.from({ length: 12 }, (_, i) => `[${i + 1}] g${i + 1}`).join(', ')}, +17 more`,
		]);
	});
});
