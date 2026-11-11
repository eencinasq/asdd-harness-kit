/**
 * Builds throwaway repos for e2e tests:
 *  - a reviewed repo (with `origin` remote, `main` + `feature` branches, its own `.semgrep/`) whose
 *    PR #42 is served by the fake `gh` in ./bin;
 *  - a Semgrep "spec" repo with mmlc-style architecture/standards packs for the dashboard tools.
 * Nothing touches GitHub or the user's real state directories.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const FAKE_GH_BIN = path.join(import.meta.dirname, 'bin');
export const PR_NUMBER = 42;

const git = (cwd: string, ...args: string[]): string =>
	execFileSync(
		'git',
		['-c', 'user.name=e2e', '-c', 'user.email=e2e@example.com', '-c', 'commit.gpgsign=false', ...args],
		{
			cwd,
			encoding: 'utf8',
		},
	);

const write = (root: string, files: Record<string, string>): void => {
	for (const [rel, text] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		fs.writeFileSync(path.join(root, rel), text);
	}
};

export const tmpDir = (prefix: string): string => fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));

/** `.semgrep` of the reviewed repo: flags console.log and explicit any in TS. */
const REVIEWED_REPO_RULES = `rules:
  - id: demo.no-console-log
    languages: [typescript]
    severity: WARNING
    message: Use the logger instead of console.log.
    pattern: console.log(...)
  - id: demo.no-explicit-any
    languages: [typescript]
    severity: ERROR
    message: Do not use explicit any.
    pattern-regex: ':\\s*any\\b'
`;

export type ReviewedRepo = {
	readonly repo: string;
	readonly ghState: string;
	readonly headSha: string;
	/** Line numbers (RIGHT side) added by the PR. */
	readonly added: { readonly appTs: readonly number[]; readonly utilPy: readonly number[] };
};

export const createReviewedRepo = (options: { withSemgrep?: boolean } = {}): ReviewedRepo => {
	const origin = tmpDir('mcp-origin');
	git(origin, 'init', '-q', '--bare', '-b', 'main');

	const repo = tmpDir('mcp-reviewed-repo');
	git(repo, 'init', '-q', '-b', 'main');
	write(repo, {
		// biome-ignore lint/suspicious/noTemplateCurlyInString: this is TypeScript source written into the fixture repo
		'src/app.ts': ['export const greet = (name: string) => {', '\treturn `hi ${name}`;', '};', ''].join('\n'),
		'src/util.py': ['def add(a, b):', '    return a + b', ''].join('\n'),
		'package-lock.json': '{"lockfileVersion": 3}\n',
		// Review profile on the base branch: test files are skipped, as the lifecycle tests expect.
		'.pr-review.yml': 'reviewTests: false\n',
		...(options.withSemgrep === false ? {} : { '.semgrep/architecture/rules.yml': REVIEWED_REPO_RULES }),
	});
	git(repo, 'add', '-A');
	git(repo, 'commit', '-q', '-m', 'base');
	git(repo, 'remote', 'add', 'origin', origin);
	git(repo, 'push', '-q', 'origin', 'main');

	git(repo, 'checkout', '-q', '-b', 'feature');
	write(repo, {
		// lines 4-7 added
		'src/app.ts': [
			'export const greet = (name: string) => {',
			// biome-ignore lint/suspicious/noTemplateCurlyInString: fixture source code
			'\treturn `hi ${name}`;',
			'};',
			'export const parse = (raw: any) => {',
			'\tconsole.log("parsing", raw);',
			'\treturn JSON.parse(raw);',
			'};',
			'',
		].join('\n'),
		// lines 3-4 added
		'src/util.py': ['def add(a, b):', '    return a + b', 'def run(expr):', '    return eval(expr)', ''].join('\n'),
		'package-lock.json': '{"lockfileVersion": 3, "packages": {}}\n',
		'src/app.spec.ts': "import { greet } from './app';\n",
	});
	git(repo, 'add', '-A');
	git(repo, 'commit', '-q', '-m', 'feature');
	const headSha = git(repo, 'rev-parse', 'HEAD').trim();
	const diff = git(repo, 'diff', 'main...feature');
	// Like GitHub: the PR commit is only reachable as refs/pull/<n>/head (e.g. a fork PR). The local
	// checkout stays on main and does not have it: the review must fetch it, and never scan main.
	git(repo, 'push', '-q', 'origin', `HEAD:refs/pull/${PR_NUMBER}/head`);
	git(repo, 'checkout', '-q', 'main');
	git(repo, 'branch', '-q', '-D', 'feature');
	git(repo, 'reflog', 'expire', '--expire=now', '--all');
	git(repo, 'gc', '-q', '--prune=now');

	const ghState = tmpDir('mcp-fake-gh');
	fs.writeFileSync(path.join(ghState, 'diff.patch'), diff);
	fs.writeFileSync(
		path.join(ghState, 'pr.json'),
		JSON.stringify({
			number: PR_NUMBER,
			title: 'Add parse helper and expression runner',
			baseRefName: 'main',
			headRefName: 'feature',
			headRefOid: headSha,
			url: `https://github.com/acme/demo/pull/${PR_NUMBER}`,
			author: { login: 'octocat' },
			body: 'Adds a parse helper.\n\nCloses #7',
			files: ['src/app.ts', 'src/util.py', 'package-lock.json', 'src/app.spec.ts'].map((p) => ({ path: p })),
		}),
	);
	// The issue the PR closes (gh issue view 7).
	fs.writeFileSync(
		path.join(ghState, 'issue-7.json'),
		JSON.stringify({
			number: 7,
			title: 'Parse raw payloads',
			url: 'https://github.com/acme/demo/issues/7',
			body: [
				'We need to parse raw JSON payloads.',
				'',
				'## Acceptance criteria',
				'- [ ] A `parse` helper turns a raw JSON string into an object',
				'- [ ] Invalid JSON returns a typed error instead of throwing',
				'- [ ] An expression runner evaluates simple arithmetic',
				'',
				'## Definition of done',
				'- Unit tests for parse',
			].join('\n'),
		}),
	);
	return { repo, ghState, headSha, added: { appTs: [4, 5, 6, 7], utilPy: [3, 4] } };
};

/** Published reviews recorded by the fake gh. */
export const publishedReviews = (ghState: string): Array<{ endpoint: string; payload: Record<string, any> }> => {
	const file = path.join(ghState, 'reviews.jsonl');
	if (!fs.existsSync(file)) return [];
	return fs
		.readFileSync(file, 'utf8')
		.trim()
		.split('\n')
		.map((line) => JSON.parse(line));
};

/**
 * Semgrep spec repo (ANALYSIS_REPO_ROOT) with mmlc-style packs. Expected results:
 *   boundaries  mmlc.arch.boundary.no-infra-in-domain  ERROR    1 violation  (src/domain/order.ts)
 *   boundaries  mmlc.arch.boundary.no-ui-in-domain     ERROR    clean
 *   standards   mmlc.std.no-explicit-any               WARNING  2 violations (domain + app)
 *   standards   mmlc.std.no-console-log                INFO     1 violation  (src/app/main.ts)
 */
export const createSemgrepSpecRepo = (): string => {
	const root = tmpDir('mcp-semgrep-spec');
	git(root, 'init', '-q', '-b', 'main');
	write(root, {
		'.semgrep/architecture/01-boundaries.yml': `rules:
  - id: mmlc.arch.boundary.no-infra-in-domain
    languages: [typescript]
    severity: ERROR
    message: >-
      Domain code must not import
      infrastructure.
    metadata:
      category: architecture
      mmlc:
        adr: ADR-0010
    paths:
      include:
        - "src/domain/**"
    pattern-regex: from ['"][^'"]*infrastructure
  - id: mmlc.arch.boundary.no-ui-in-domain
    languages: [typescript]
    severity: ERROR
    message: Domain code must not import UI.
    metadata:
      category: architecture
      mmlc:
        adr: ADR-0037
    paths:
      include:
        - "src/domain/**"
    pattern-regex: from ['"][^'"]*/ui/
`,
		'.semgrep/standards/coding-standards.yml': `rules:
  - id: mmlc.std.no-explicit-any
    languages: [typescript]
    severity: WARNING
    message: Avoid explicit any.
    metadata:
      category: coding-standard
    pattern-regex: ':\\s*any\\b'
  - id: mmlc.std.no-console-log
    languages: [typescript]
    severity: INFO
    message: Use the logger.
    metadata:
      category: coding-standard
    pattern: console.log(...)
`,
		'src/domain/order.ts': [
			"import { db } from '../infrastructure/db';",
			'export const total = (items: any) => db.sum(items);',
			'',
		].join('\n'),
		'src/infrastructure/db.ts': 'export const db = { sum: (x: number[]) => x.length };\n',
		'src/app/main.ts': ['export const start = (cfg: any) => {', '\tconsole.log(cfg);', '};', ''].join('\n'),
	});
	git(root, 'add', '-A');
	git(root, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'spec');
	return root;
};

export const hasSemgrep = (): boolean => {
	try {
		execFileSync('semgrep', ['--version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
};
