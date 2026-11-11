/**
 * Golden fixtures for the review engine: diff parsing, anchoring, filtering, bundling, rules, the
 * quality gate, profiles, fingerprints and SARIF. Each case is a small diff and the exact result.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { diffForFiles, sinceLastReviewSection } from '../context/review-context.ts';
import { belongsToGroup } from '../coverage/coverage.ts';
import { bundleDiffs } from './bundle.ts';
import { deterministicFindings } from './checks.ts';
import { selectFiles } from './filter.ts';
import { findingsToCommentsMarkdown, suggestEvent } from './findings-format.ts';
import { parseHunks, rightSideLines } from './hunks.ts';
import { parseDiffText, unquoteGitPath } from './parse-diff.ts';
import { prepareReview } from './prepare.ts';
import { parseProfile, profiledSeverity } from './profile.ts';
import { anchorFinding, resolveFindings } from './resolve.ts';
import { findingsToSarif } from './sarif.ts';
import { loadSystemRules, parseRuleDoc, renderRuleDoc } from './system-rules.ts';
import type { ReviewFinding } from './types.ts';

const fileDiff = (path: string, hunks: string, header = ''): string =>
	`diff --git a/${path} b/${path}\n${header}--- a/${path}\n+++ b/${path}\n${hunks}`;

/** src/a.ts: lines 10-13 on the new side; 11 added. */
const A = fileDiff('src/a.ts', '@@ -10,3 +10,4 @@\n const a = 1;\n+const b = load(id);\n const c = 3;\n return b;\n');
const [aDiff] = parseDiffText(A);
const finding = (over: Partial<ReviewFinding>): ReviewFinding => ({
	path: 'src/a.ts',
	content: 'x',
	startLine: 0,
	endLine: 0,
	severity: 'high',
	...over,
});

describe('diff parsing', () => {
	test('git-quoted (non-ASCII) paths are decoded, and the next file still parses', () => {
		const diff = [
			'diff --git "a/src/caf\\303\\251.ts" "b/src/caf\\303\\251.ts"',
			'--- "a/src/caf\\303\\251.ts"',
			'+++ "b/src/caf\\303\\251.ts"',
			'@@ -1 +1,2 @@',
			' a',
			'+b',
			fileDiff('x.ts', '@@ -1 +1 @@\n-c\n+d\n'),
		].join('\n');
		assert.deepEqual(
			parseDiffText(diff).map((f) => f.newPath),
			['src/café.ts', 'x.ts'],
		);
		assert.equal(unquoteGitPath('"tab\\there \\"q\\""'), 'tab\there "q"');
		assert.equal(unquoteGitPath('plain/año.ts'), 'plain/año.ts');
	});

	test('a hunk ends when its line counts are used up', () => {
		assert.deepEqual(rightSideLines('@@ -1 +1 @@\n-a\n+b\n stray1\n stray2'), [1]);
		assert.equal(parseHunks('@@ -1,2 +1,2 @@\n a\n-b\n+c\n')[0]?.lines.length, 3);
	});

	test('added-only lines ("clean as you code")', () => {
		assert.deepEqual(rightSideLines(aDiff!.diff), [10, 11, 12, 13]);
		assert.deepEqual(rightSideLines(aDiff!.diff, { addedOnly: true }), [11]);
	});
});

describe('anchoring (precision first)', () => {
	test('the quoted code beats a wrong line number', () => {
		const result = anchorFinding(finding({ startLine: 5, endLine: 5, existingCode: 'return b;' }), aDiff!);
		assert.ok(result.ok);
		assert.equal(result.finding.startLine, 13);
		assert.match(result.note ?? '', /anchored on the quoted code at line 13 \(given 5\)/);
	});

	test('with several matches, the one nearest the given line wins', () => {
		const twice = parseDiffText(fileDiff('t.ts', '@@ -1,0 +1,5 @@\n+return x;\n+a();\n+b();\n+c();\n+return x;\n'))[0]!;
		const near = anchorFinding({ ...finding({ path: 't.ts', startLine: 4, existingCode: 'return x;' }) }, twice);
		assert.ok(near.ok);
		assert.equal(near.finding.startLine, 5);
	});

	test('never pinned to an unrelated line: no line and a missing quote is not anchored', () => {
		const result = anchorFinding(finding({ existingCode: 'not in the diff' }), aDiff!);
		assert.deepEqual(result, { ok: false, reason: 'the quoted code is not in the diff' });
		assert.equal(anchorFinding(finding({}), aDiff!).ok, false);
		assert.equal(anchorFinding(finding({ startLine: 40 }), aDiff!).ok, false, 'farther than 3 lines');
	});

	test('a suggestion survives only when its lines did not move', () => {
		const exact = anchorFinding(
			finding({
				startLine: 11,
				endLine: 11,
				existingCode: 'const b = load(id);',
				suggestionCode: 'const b = load(id)!;',
			}),
			aDiff!,
		);
		assert.ok(exact.ok);
		assert.equal(exact.finding.suggestionCode, 'const b = load(id)!;');

		const moved = anchorFinding(finding({ startLine: 8, endLine: 8, suggestionCode: 'x' }), aDiff!);
		assert.ok(moved.ok);
		assert.equal(moved.finding.startLine, 10);
		assert.equal(moved.finding.suggestionCode, undefined);
		assert.match(moved.note ?? '', /moved to 10; suggestion dropped/);
	});

	test('a range is trimmed to the diff, with a note', () => {
		const result = anchorFinding(finding({ startLine: 11, endLine: 30 }), aDiff!);
		assert.ok(result.ok);
		assert.deepEqual([result.finding.startLine, result.finding.endLine], [11, 13]);
		assert.match(result.note ?? '', /range 11-30 trimmed to 11-13/);
	});

	test('a finding on a renamed file’s old path gets the new path', () => {
		const renamed = parseDiffText(
			'diff --git a/old.ts b/new.ts\nsimilarity index 90%\nrename from old.ts\nrename to new.ts\n--- a/old.ts\n+++ b/new.ts\n@@ -1 +1 @@\n-a\n+b\n',
		);
		const { resolved, notes } = resolveFindings([finding({ path: 'old.ts', startLine: 1, endLine: 1 })], renamed);
		assert.equal(resolved[0]?.path, 'new.ts');
		assert.match(notes[0] ?? '', /path old\.ts → new\.ts \(renamed\)/);
	});

	test('added-lines-only profiles do not anchor on context lines', () => {
		assert.equal(anchorFinding(finding({ startLine: 10 }), aDiff!, { addedLinesOnly: true }).ok, true, 'snaps to 11');
		const quote = anchorFinding(finding({ existingCode: 'const a = 1;' }), aDiff!, { addedLinesOnly: true });
		assert.equal(quote.ok, false);
	});

	test('fingerprints follow the code, not the line number', () => {
		const before = anchorFinding(finding({ existingCode: 'return b;', ruleId: 'ts.x' }), aDiff!);
		const shifted = parseDiffText(
			fileDiff('src/a.ts', '@@ -20,3 +20,4 @@\n const a = 1;\n+const b = load(id);\n const c = 3;\n return b;\n'),
		)[0]!;
		const after = anchorFinding(finding({ existingCode: 'return b;', ruleId: 'ts.x' }), shifted);
		assert.ok(before.ok && after.ok);
		assert.notEqual(before.finding.startLine, after.finding.startLine);
		assert.equal(before.finding.fingerprint, after.finding.fingerprint);
		assert.match(before.finding.fingerprint ?? '', /^[0-9a-f]{16}$/);
	});
});

describe('quality gate', () => {
	test('APPROVE only with no findings and nothing left unreviewed', () => {
		assert.equal(suggestEvent([]), 'APPROVE');
		assert.equal(suggestEvent([], [{ path: 'big.json', reason: 'too-large' }]), 'COMMENT');
		assert.equal(suggestEvent([finding({ severity: 'low' })]), 'COMMENT');
		assert.equal(suggestEvent([finding({ severity: 'high' })]), 'REQUEST_CHANGES');
		const md = findingsToCommentsMarkdown({
			pr: 1,
			repo: 'o/r',
			headSha: 'h',
			findings: [],
			gaps: [{ path: '.env', reason: 'secret' }],
		});
		assert.match(md, /event: COMMENT/);
		assert.match(md, /\*\*Not reviewed\*\* \(check these by hand\):\n- `\.env` — secrets file/);
	});

	test('a committed secrets file is a deterministic finding (contents never sent); deleting one is fine', () => {
		const diff = `${fileDiff('.env', '@@ -0,0 +1 @@\n+API_KEY=sk-123\n', 'new file mode 100644\n')}${fileDiff('old/.env', '@@ -1 +0,0 @@\n-A=1\n', 'deleted file mode 100644\n')}`;
		const checks = deterministicFindings(selectFiles(parseDiffText(diff)));
		assert.equal(checks.length, 1);
		assert.equal(checks[0]?.path, '.env');
		assert.equal(checks[0]?.startLine, 1);
		assert.equal(checks[0]?.source, 'check');
		assert.doesNotMatch(JSON.stringify(checks), /sk-123/);
	});
});

describe('rules', () => {
	const rules = loadSystemRules();

	test('rule docs name this server’s tools, and every item has an id', () => {
		const text = rules.resolve('src/util.py');
		assert.doesNotMatch(text, /\bfile_read\b|\bcode_search\b/);
		assert.match(text, /pr_review_read_file/);
		assert.match(text, /^#### \[python\.mutable-default-arguments-and-shared-state\] Mutable Default Arguments/m);
	});

	test('a profile can drop items or whole docs', () => {
		const doc = parseRuleDoc('python.md', '#### Performance\n- a\n\n#### Security\n- b');
		assert.equal(renderRuleDoc(doc, ['python.performance']), '#### [python.security] Security\n- b');
		assert.equal(renderRuleDoc(doc, ['python']), '');
	});

	test('.m is Objective-C when the code says so, MATLAB otherwise', () => {
		assert.equal(
			rules.resolveDetail('ios/Foo.m', { content: '+#import <UIKit/UIKit.h>\n+@implementation Foo' }).docId,
			'objc.md',
		);
		assert.equal(rules.resolveDetail('lab/solve.m', { content: '+x = linspace(0, 1);' }).docId, 'matlab.md');
	});

	test('test files are reviewed with the tests checklist unless the profile opts out', () => {
		assert.equal(rules.resolveDetail('src/a.spec.ts').docId, 'tests.md');
		const diff = parseDiffText(fileDiff('src/a.spec.ts', '@@ -0,0 +1 @@\n+it("x", () => {});\n'));
		assert.equal(selectFiles(diff)[0]?.reason, 'none');
		assert.equal(selectFiles(diff, { reviewTests: false })[0]?.reason, 'default-path');
		assert.equal(
			selectFiles(parseDiffText(fileDiff('test/fixtures/a.json', '@@ -0,0 +1 @@\n+{}\n')))[0]?.reason,
			'default-path',
		);
	});
});

describe('bundling', () => {
	const bigHunks = Array.from(
		{ length: 6 },
		(_, h) =>
			`@@ -${h * 100 + 1},0 +${h * 100 + 1},40 @@\n${Array.from({ length: 40 }, (_, i) => `+const v${h}_${i} = ${'x'.repeat(80)};`).join('\n')}\n`,
	).join('');
	const big = fileDiff('src/big.ts', bigHunks);

	test('a large file is split into parts by hunk, not skipped', () => {
		const groups = bundleDiffs(parseDiffText(big), { budget: 8_000 });
		assert.ok(groups.length > 1);
		assert.match(groups[0]?.label ?? '', /^ts_js_tsx_jsx · src\/big\.ts \(part 1\/\d\)$/);
		assert.deepEqual(groups[0]?.span, { start: 1, end: groups[0]?.span?.end });
		const second = groups[1]!;
		const shown = diffForFiles(big, second.files, 50_000, second.span);
		assert.match(shown, /^<diff files="1" source="untrusted">\ndiff --git a\/src\/big\.ts/);
		assert.doesNotMatch(shown, /@@ -1,0 /, 'only this part’s hunks');
		assert.ok(belongsToGroup(second, finding({ path: 'src/big.ts', startLine: second.span!.start })));
		assert.ok(!belongsToGroup(second, finding({ path: 'src/big.ts', startLine: 1 })));
	});

	test('a large new file (one hunk) is split into valid sub-hunks', () => {
		const lines = Array.from({ length: 600 }, (_, i) => `+const v${i} = ${'y'.repeat(60)};`).join('\n');
		const added = fileDiff('src/new.ts', `@@ -0,0 +1,600 @@\n${lines}\n`, 'new file mode 100644\n');
		const groups = bundleDiffs(parseDiffText(added), { budget: 10_000 });
		assert.ok(groups.length >= 4, `${groups.length} parts`);
		assert.equal(groups[0]?.span?.start, 1);
		assert.equal(groups.at(-1)?.span?.end, 600);
		for (let i = 1; i < groups.length; i += 1) {
			assert.equal(groups[i]?.span?.start, (groups[i - 1]?.span?.end ?? 0) + 1, 'parts are contiguous');
		}
		const part = diffForFiles(added, ['src/new.ts'], 10_000, groups[1]?.span);
		const header = /@@ -0,0 \+(\d+),(\d+) @@/.exec(part);
		assert.equal(Number(header?.[1]), groups[1]?.span?.start);
		assert.equal(
			rightSideLines(part.replace(/^[\s\S]*?(?=@@)/, '').replace(/\n<\/diff>$/, ''))[0],
			groups[1]?.span?.start,
		);
	});

	test('small files pack by size and path; tests come last', () => {
		const diff = ['src/b/x.ts', 'src/a/y.ts', 'src/a/y.spec.ts', 'src/a/z.ts']
			.map((p) => fileDiff(p, '@@ -0,0 +1 @@\n+export const v = 1;\n'))
			.join('');
		const groups = prepareReview(diff).groups;
		assert.deepEqual(
			groups.map((g) => [g.label, g.files]),
			[
				['ts_js_tsx_jsx', ['src/a/y.ts', 'src/a/z.ts', 'src/b/x.ts']],
				['tests', ['src/a/y.spec.ts']],
			],
		);
	});
});

describe('profile', () => {
	test('valid YAML is applied; invalid content falls back with a warning', () => {
		const { profile } = parseProfile(
			'reviewTests: false\nsummaryOnly: [ts_js_tsx_jsx.dead-code]\nseverity:\n  python.security-sensitive-code: critical\n',
		);
		assert.equal(profile.reviewTests, false);
		assert.equal(profiledSeverity(finding({ ruleId: 'ts_js_tsx_jsx.dead-code', severity: 'medium' }), profile), 'low');
		assert.equal(profiledSeverity(finding({ ruleId: 'python.security-sensitive-code' }), profile), 'critical');
		assert.equal(profiledSeverity(finding({ severity: 'medium' }), profile), 'medium', 'no ruleId: unchanged');
		assert.match(parseProfile('reviewTests: maybe').warning ?? '', /\.pr-review\.yml ignored \(invalid\)/);
		assert.match(parseProfile('a: [').warning ?? '', /not YAML/);
		assert.equal(parseProfile(undefined).warning, undefined);
	});

	test('a disabled rule doc leaves its files out, listed as skipped by the profile', () => {
		const prepared = prepareReview(fileDiff('lab/a.m', '@@ -0,0 +1 @@\n+x = 1;\n'), {
			...parseProfile('disable: [matlab]').profile,
		});
		assert.equal(prepared.groups.length, 0);
		assert.deepEqual(prepared.skipped, [{ path: 'lab/a.m', reason: 'profile' }]);
	});
});

describe('re-reviews and SARIF', () => {
	test('since the last review: new, still open, gone', () => {
		const a = { ...finding({ startLine: 3, content: 'still here' }), fingerprint: 'aaa' };
		const b = { ...finding({ startLine: 4, content: 'fixed now' }), fingerprint: 'bbb' };
		const c = { ...finding({ startLine: 5, content: 'brand new' }), fingerprint: 'ccc' };
		const text = sinceLastReviewSection([a, c], [a, b]);
		assert.match(text, /1 new · 1 still open · 1 gone/);
		assert.match(text, /\*\*Gone\*\*\n- `src\/a\.ts:4` fixed now/);
		assert.equal(sinceLastReviewSection([a], undefined), '');
	});

	test('findings export as SARIF 2.1.0 with fingerprints and levels', () => {
		const sarif = findingsToSarif({
			version: '1.0.0',
			findings: [
				{ ...finding({ startLine: 11, endLine: 11, ruleId: 'ts.x', content: 'bad' }), fingerprint: 'f1' },
				finding({ startLine: 0, severity: 'low', category: 'style', content: 'file-level' }),
			],
		}) as {
			version: string;
			runs: { results: Record<string, unknown>[]; tool: { driver: { rules: { id: string }[] } } }[];
		};
		assert.equal(sarif.version, '2.1.0');
		const [run] = sarif.runs;
		assert.deepEqual(
			run?.tool.driver.rules.map((r) => r.id),
			['category.style', 'ts.x'],
		);
		assert.equal(run?.results[0]?.['level'], 'error');
		assert.deepEqual(run?.results[0]?.['partialFingerprints'], { 'architectureMcp/v1': 'f1' });
		assert.equal(run?.results[1]?.['level'], 'note');
		assert.doesNotMatch(JSON.stringify(run?.results[1]), /region/, 'file-level: no line region');
	});
});
