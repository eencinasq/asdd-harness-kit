import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evidenceLocations, locationProblems, prSecurityFindingProblem, securityBlock, securityLens } from './lens.ts';

const diff = (file: string, added: readonly string[]): string =>
	[
		`diff --git a/${file} b/${file}`,
		`--- a/${file}`,
		`+++ b/${file}`,
		'@@ -1,1 +1,3 @@',
		...added.map((l) => `+${l}`),
	].join('\n');

test('security-review REQ-007: an auth controller building SQL gets the web/auth and attack-class checklists', () => {
	const files = ['src/auth/login.controller.ts'];
	const lens = securityLens(
		files,
		diff(files[0]!, [
			'router.post("/login", async (req, res) => {',
			'  db.query(`SELECT * FROM u WHERE n=${req.body.n}`);',
		]),
	);
	const ids = lens.surfaces.map((s) => s.id);
	assert.ok(ids.includes('auth'), JSON.stringify(ids));
	assert.ok(ids.includes('injection'), JSON.stringify(ids));
	assert.ok(ids.includes('http-handler'), JSON.stringify(ids));
	assert.ok(lens.checklists.includes('web-protocol-and-auth'));
	assert.ok(lens.checklists.includes('attack-classes'));
	const block = securityBlock(lens);
	assert.match(block, /^<security>/);
	assert.match(block, /web-protocol-and-auth/);
	assert.match(block, /category "security"/);
	assert.match(block, /file:line/);
	assert.ok(block.length <= 2000, `block is bounded (${block.length})`);
});

test('security-review REQ-007: CI workflows and dependency manifests route to supply chain', () => {
	const lens = securityLens(['.github/workflows/ci.yml', 'package.json'], '');
	assert.ok(lens.checklists.includes('supply-chain-and-release'));
});

test('security-review REQ-007: a docs-only group gets no security block', () => {
	const lens = securityLens(['docs/intro.md'], diff('docs/intro.md', ['Welcome to the project.']));
	assert.deepEqual(lens.surfaces, []);
	assert.equal(securityBlock(lens), '');
});

test('security-review REQ-008: a security finding needs a principal/boundary and a file:line', () => {
	assert.equal(prSecurityFindingProblem({ category: 'bug' }), null, 'other categories are untouched');
	assert.match(prSecurityFindingProblem({ category: 'security' }) ?? '', /no evidence/);
	assert.match(
		prSecurityFindingProblem({ category: 'security', evidence: 'src/a.ts:12 reads the body' }) ?? '',
		/principal or trust boundary/,
	);
	assert.match(
		prSecurityFindingProblem({ category: 'security', evidence: 'An unauthenticated caller controls the query.' }) ?? '',
		/file:line/,
	);
	assert.equal(
		prSecurityFindingProblem({
			category: 'security',
			evidence:
				'An unauthenticated caller controls req.query.name (src/api.ts:5), joined into the query at src/db.ts:12.',
		}),
		null,
	);
});

test('pr-security-baseline REQ-004 evidenceLocations: file:line refs, URLs ignored, ./ normalized', () => {
	assert.deepEqual(
		evidenceLocations(
			'Untrusted req.query.file (./src/api/run.js:2) reaches exec at src/api/run.js:2-3; docs at https://example.com:8080/x and lib/util.py:10.',
		),
		[
			{ file: 'src/api/run.js', line: 2 },
			{ file: 'lib/util.py', line: 10 },
		],
	);
	assert.deepEqual(evidenceLocations('no location here'), []);
});

test('pr-security-baseline REQ-004 locationProblems: missing file, line past the end, outside the repo', () => {
	const contents = new Map<string, string | undefined>([
		['src/api/run.js', 'line 1\nline 2\n'],
		['src/gone.js', undefined],
	]);
	assert.deepEqual(locationProblems([{ file: 'src/api/run.js', line: 2 }], contents), []);
	assert.deepEqual(locationProblems([{ file: 'src/api/run.js', line: 99 }], contents), [
		'src/api/run.js:99 is past the end of the file at the PR head (2 lines)',
	]);
	assert.deepEqual(locationProblems([{ file: 'src/gone.js', line: 1 }], contents), [
		'src/gone.js:1 does not exist at the PR head',
	]);
	assert.deepEqual(locationProblems([{ file: '../etc/passwd', line: 1 }], contents), [
		'../etc/passwd:1 is outside the repository',
	]);
	assert.deepEqual(locationProblems([{ file: 'src/api/run.js', line: 0 }], contents), [
		'src/api/run.js:0 is not a line number',
	]);
});
