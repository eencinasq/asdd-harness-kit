/**
 * Offline evaluation of the PR reviewer (see eval/README.md).
 *   pnpm eval prepare [cases-dir]           → eval/out/<case>.md: the review groups (rules + diff) of each case
 *   pnpm eval check [cases-dir]             → every case can score (labels on added lines, known rules, fields set)
 *   pnpm eval score <results.json> [cases-dir] [--json <file>] [--baseline <file>] [--max-drop <points>]
 *                                           → precision / recall / F1, per language and category; exit 1 on a regression
 *   pnpm eval harvest <review-dir> [--out <dir>] [--language <name>]
 *                                           → a case from a published review, outside the repository by default
 * results.json: { "<case id>": [{ "path": "...", "startLine": 4, "endLine": 4, "ruleId": "..." }, ...] }
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { diffForFiles } from '../src/pr-review/context/review-context.ts';
import { formatRulesBlock, prepareReview } from '../src/pr-review/engine/index.ts';
import { caseFromReview, ruleIdsIn, validateCase } from '../src/pr-review/metrics/eval-cases.ts';
import {
	compareWithBaseline,
	DEFAULT_MAX_DROP,
	type EvalCase,
	formatEval,
	type ProducedFinding,
	scoreCase,
	summarizeEval,
} from '../src/pr-review/metrics/eval-score.ts';

const root = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(root, '../..');
const argv = process.argv.slice(2);
const [command] = argv;

/** `--name value` options, and the positional arguments without them. */
const option = (name: string): string | undefined => {
	const i = argv.indexOf(`--${name}`);
	return i >= 0 ? argv[i + 1] : undefined;
};
const positional = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));

const casesDir = (arg: string | undefined) => path.resolve(arg ?? path.join(root, 'eval/cases'));

const loadCases = (dir: string): { file: string; evalCase: EvalCase }[] =>
	fs
		.readdirSync(dir)
		.filter((f) => f.endsWith('.json'))
		.toSorted()
		.map((file) => ({ file, evalCase: JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as EvalCase }));

const fail = (message: string): never => {
	console.error(message);
	process.exit(1);
};

if (command === 'prepare') {
	const out = path.join(root, 'eval/out');
	fs.mkdirSync(out, { recursive: true });
	for (const { evalCase: c } of loadCases(casesDir(positional[0]))) {
		const prepared = prepareReview(c.diff);
		const text = [
			// Never the description, the labels, the language or the category: they would give the answer away.
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
} else if (command === 'check') {
	const ruleIds = ruleIdsIn(path.join(root, 'src/pr-review/engine/rules/rule_docs'));
	const cases = loadCases(casesDir(positional[0]));
	let bad = 0;
	for (const { file, evalCase } of cases) {
		const problems = validateCase(evalCase, file, ruleIds);
		if (problems.length) {
			bad += 1;
			for (const p of problems) console.error(`${file}: ${p}`);
		}
	}
	const clean = cases.filter((c) => c.evalCase.expected?.length === 0).length;
	const languages = new Set(cases.map((c) => c.evalCase.language)).size;
	console.log(`${cases.length} case(s), ${languages} language(s), ${clean} clean; ${bad} with problems`);
	if (bad) process.exit(1);
} else if (command === 'score' && positional[0]) {
	const cases = loadCases(casesDir(positional[1])).map((c) => c.evalCase);
	const results = JSON.parse(fs.readFileSync(path.resolve(positional[0]), 'utf8')) as Record<string, ProducedFinding[]>;
	const summary = summarizeEval(cases.map((c) => scoreCase(c, results[c.id] ?? [])));
	console.log(formatEval(summary));
	const json = option('json');
	if (json) {
		const { precision, recall, f1, byLanguage, byCategory } = summary;
		const saved = { at: new Date().toISOString(), cases: cases.length, precision, recall, f1, byLanguage, byCategory };
		fs.writeFileSync(path.resolve(json), `${JSON.stringify(saved, null, 2)}\n`);
		console.log(`\nSummary written to ${json} (use it as --baseline for the next run).`);
	}
	const baselineFile = option('baseline');
	if (baselineFile) {
		const baseline = JSON.parse(fs.readFileSync(path.resolve(baselineFile), 'utf8'));
		const maxDrop = Number(option('max-drop') ?? DEFAULT_MAX_DROP);
		const comparison = compareWithBaseline(summary, baseline, maxDrop);
		console.log(['', `Against ${baselineFile}:`, ...comparison.lines.map((l) => `- ${l}`)].join('\n'));
		if (comparison.regressed) process.exit(1);
	}
} else if (command === 'harvest' && positional[0]) {
	const dir = path.resolve(positional[0]);
	const read = (rel: string) => {
		const file = path.join(dir, rel);
		return fs.existsSync(file)
			? fs.readFileSync(file, 'utf8')
			: fail(`${file} not found: harvest needs a published review folder`);
	};
	const stateRoot =
		process.env['PR_REVIEW_ROOT'] ??
		path.join(process.env['XDG_STATE_HOME'] ?? path.join(os.homedir(), '.local/state'), 'pr-review');
	const out = path.resolve(option('out') ?? path.join(stateRoot, 'eval-cases'));
	// Real diffs are the client's code: never into this (public) repository unless asked for explicitly.
	if ((out === repoRoot || out.startsWith(`${repoRoot}${path.sep}`)) && !argv.includes('--allow-repo')) {
		fail(
			`Refusing to write a harvested case inside ${repoRoot}: real diffs are client code. Pass --allow-repo if this repository is private.`,
		);
	}
	const id = `${path.basename(path.dirname(dir))}-${path.basename(dir)}`;
	const language = option('language');
	const evalCase = caseFromReview({
		id,
		diff: read('diff.patch'),
		original: read('.original/comments.md'),
		published: read('comments.md'),
		...(language ? { language } : {}),
	});
	fs.mkdirSync(out, { recursive: true });
	fs.writeFileSync(path.join(out, `${id}.json`), `${JSON.stringify(evalCase, null, 2)}\n`);
	console.log(
		`${id}: ${evalCase.expected.length} defect(s), ${evalCase.noise?.length ?? 0} known noise → ${path.join(out, `${id}.json`)}`,
	);
	console.log('Check the labels: a published comment is a defect a human agreed with, not every defect of the change.');
} else {
	console.error(
		'usage: pnpm eval prepare [cases-dir] | check [cases-dir] | score <results.json> [cases-dir] [--json f] [--baseline f] [--max-drop n] | harvest <review-dir> [--out dir] [--language l]',
	);
	process.exit(2);
}
