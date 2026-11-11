/**
 * Offline evaluation of the PR reviewer (see eval/README.md).
 *   pnpm eval prepare [cases-dir]           → eval/out/<case>.md: the review groups (rules + diff) of each case
 *   pnpm eval score <results.json> [cases-dir]  → precision / recall / F1 against the labelled defects
 * results.json: { "<case id>": [{ "path": "...", "startLine": 4, "endLine": 4, "ruleId": "..." }, ...] }
 */
import fs from 'node:fs';
import path from 'node:path';

import { diffForFiles } from '../src/pr-review/context/review-context.ts';
import { formatRulesBlock, prepareReview } from '../src/pr-review/engine/index.ts';
import {
	type EvalCase,
	formatEval,
	type ProducedFinding,
	scoreCase,
	summarizeEval,
} from '../src/pr-review/metrics/eval-score.ts';

const root = path.resolve(import.meta.dirname, '..');
const [command, first, second] = process.argv.slice(2);

const loadCases = (dir: string): EvalCase[] =>
	fs
		.readdirSync(dir)
		.filter((f) => f.endsWith('.json'))
		.toSorted()
		.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as EvalCase);

if (command === 'prepare') {
	const cases = loadCases(path.resolve(first ?? path.join(root, 'eval/cases')));
	const out = path.join(root, 'eval/out');
	fs.mkdirSync(out, { recursive: true });
	for (const c of cases) {
		const prepared = prepareReview(c.diff);
		const text = [
			// Never the description or the labels: they would give the answer away.
			`# Case ${c.id}`,
			'',
			'Review each group. Report findings as JSON: [{ "path", "startLine", "endLine", "ruleId", "severity", "content" }].',
			...prepared.groups.map((g, i) =>
				[
					`## Group ${i} — ${g.label}`,
					formatRulesBlock(g.files, g.ruleMarkdown),
					diffForFiles(c.diff, g.files, undefined, g.span),
				].join('\n\n'),
			),
		].join('\n');
		fs.writeFileSync(path.join(out, `${c.id}.md`), text);
		console.log(`${c.id}: ${prepared.groups.length} group(s) → eval/out/${c.id}.md`);
	}
} else if (command === 'score' && first) {
	const cases = loadCases(path.resolve(second ?? path.join(root, 'eval/cases')));
	const results = JSON.parse(fs.readFileSync(path.resolve(first), 'utf8')) as Record<string, ProducedFinding[]>;
	console.log(formatEval(summarizeEval(cases.map((c) => scoreCase(c, results[c.id] ?? [])))));
} else {
	console.error('usage: pnpm eval prepare [cases-dir] | pnpm eval score <results.json> [cases-dir]');
	process.exit(2);
}
