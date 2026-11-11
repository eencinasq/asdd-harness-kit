/** Prepare → interactive group coverage → comments.md, end to end without gh/network. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCommentsMarkdown } from './comments/comments-format.ts';
import { activateNextGroup, completeGroup, initProgress, nextGroupBrief } from './coverage/coverage.ts';
import {
	findingsToCommentsMarkdown,
	loadSystemRules,
	parseDiffText,
	prepareReview,
	resolveFindings,
} from './engine/index.ts';

const sampleDiff = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,3 @@
 keep
-old
+new
+extra
diff --git a/src/b.py b/src/b.py
index 111..222 100644
--- a/src/b.py
+++ b/src/b.py
@@ -1 +1,2 @@
 line
+added
diff --git a/package-lock.json b/package-lock.json
index 111..222 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1 +1 @@
-x
+y
`;

test('interactive PR review flow covers every group and drafts comments', () => {
	const rules = loadSystemRules();
	const ts = rules.resolveDetail('src/a.ts');
	const py = rules.resolveDetail('src/b.py');
	assert.equal(ts.docId, 'ts_js_tsx_jsx.md');
	assert.equal(py.docId, 'python.md');
	assert.ok(ts.text.includes('Correctness') || ts.text.length > 50);

	const prepared = prepareReview(sampleDiff);
	assert.equal(prepared.selected.length, 2);
	assert.ok(prepared.skipped.some((s) => s.path.includes('package-lock')));
	assert.ok(prepared.groups.length >= 2, 'ts and py should split by rule');
	assert.ok(prepared.groups.every((g) => g.ruleMarkdown.length > 0));

	const units = {
		fileCount: prepared.files.length,
		selectedCount: prepared.selected.length,
		groups: prepared.groups.map((g) => ({
			label: g.label,
			files: g.files,
			ruleDocId: g.ruleDocId,
			rulePattern: g.rulePattern,
			ruleMarkdown: g.ruleMarkdown,
		})),
		skipped: prepared.skipped,
		rightLinesByPath: prepared.rightLinesByPath,
	};

	let progress = initProgress(units);
	progress = activateNextGroup(progress);
	assert.equal(progress.activeGroupIndex, 0);
	assert.equal(progress.groups[0]?.status, 'reviewing');

	// Idempotent next
	const again = activateNextGroup(progress);
	assert.equal(again.activeGroupIndex, 0);
	assert.equal(again.groups[0]?.status, 'reviewing');

	const brief0 = nextGroupBrief(progress, units);
	assert.equal(brief0.group?.index, 0);

	const fileDiffs = parseDiffText(sampleDiff);
	const { resolved } = resolveFindings(
		[
			{
				path: 'src/a.ts',
				content: 'Prefer clearer name',
				startLine: 2,
				endLine: 2,
				severity: 'high',
				category: 'maintainability',
			},
		],
		fileDiffs,
	);
	assert.equal(resolved.length, 1);

	assert.ok(progress.groups.length >= 2, 'expected ts + py rule groups');
	const tsGroup = progress.groups.find((g) => g.files.includes('src/a.ts'));
	assert.ok(tsGroup, 'ts file should land in a rule group');
	assert.equal(tsGroup.ruleDocId, 'ts_js_tsx_jsx.md');

	// Finish groups in activation order; attach findings only to the ts group
	while (!progress.complete) {
		progress = activateNextGroup(progress);
		const idx = progress.activeGroupIndex;
		assert.ok(idx !== null);
		const group = progress.groups.find((g) => g.index === idx);
		assert.ok(group);
		const forThis = group.files.includes('src/a.ts') ? resolved : [];
		progress = completeGroup(progress, {
			groupIndex: idx,
			newFindings: forThis,
			replaceGroupFindings: true,
		}).progress;
	}

	assert.equal(progress.complete, true);
	assert.equal(progress.findings.length, 1);

	const md = findingsToCommentsMarkdown({
		pr: 99,
		repo: 'acme/demo',
		headSha: 'abc123',
		findings: progress.findings,
	});
	const parsed = parseCommentsMarkdown(md);
	assert.equal(parsed.comments.length, 1);
	assert.equal(parsed.meta.event, 'REQUEST_CHANGES');
});
