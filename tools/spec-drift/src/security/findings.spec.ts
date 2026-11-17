import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { severityOf, validateSecurityFindings } from './findings.ts';

const repo = (): string => {
	const root = mkdtempSync(path.join(tmpdir(), 'sec-findings-'));
	mkdirSync(path.join(root, 'src'), { recursive: true });
	writeFileSync(path.join(root, 'src/api.ts'), Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n'));
	return root;
};

const needsValidation = (fingerprint: string, file = 'src/api.ts', line = 12) => ({
	verdict: 'needs_validation',
	fingerprint,
	title: 'Tenant id taken from the request body',
	description: 'An authenticated user of tenant A can read tenant B records.',
	claimed_root_cause: 'The handler trusts req.body.tenantId instead of the session tenant.',
	trace: [
		{ kind: 'entrypoint', file, line: 3, scope: 'POST /records', description: 'Untrusted body enters here.' },
		{ kind: 'sink', file, line, scope: 'db.query', description: 'Query filtered by the body tenant.' },
	],
	evidence: [{ file, line, description: 'tenantId read from req.body.' }],
	blockers: ['Needs a two-tenant fixture to demonstrate.'],
	validation_plan: { local: 'Seed two tenants, call POST /records with the other tenant id.' },
});

const confirmed = (fingerprint: string) => ({
	verdict: 'confirmed',
	fingerprint,
	title: 'Path traversal in file download',
	description: 'An unauthenticated caller reads any file under the server root.',
	root_cause: 'The name is joined to the base dir without normalisation.',
	intended_behavior: 'Only files inside the downloads dir are served.',
	trace: [
		{ kind: 'entrypoint', file: 'src/api.ts', line: 5, scope: 'GET /download', description: 'name query param.' },
		{ kind: 'sink', file: 'src/api.ts', line: 9, scope: 'fs.readFile', description: 'joined path is read.' },
	],
	evidence: [{ file: 'src/api.ts', line: 9, description: 'path.join(base, name) without a containment check.' }],
	conditions: [{ kind: 'authentication_level', description: 'None required.' }],
	execution: {
		attacker_perspective: 'Anonymous HTTP client.',
		payloads: ['../../etc/passwd'],
		instructions: ['GET /download?name=../../etc/passwd'],
		observed_result: 'The fixture returned the passwd file in the sandbox.',
	},
	remediation: { strategy: 'Resolve the path and reject it unless it stays inside the base dir.' },
	severity: {
		likelihood: { score: 'high', reason: 'Unauthenticated.' },
		impact: { score: 'high', reason: 'Arbitrary file read.' },
		overall_severity: 'high',
	},
	confidence: { score: 'high', reason: 'Reproduced locally.' },
});

test('security-review REQ-004: valid findings pass and come back sorted by fingerprint', () => {
	const root = repo();
	try {
		const res = validateSecurityFindings([needsValidation('b/tenant'), confirmed('a/traversal')], root);
		assert.deepEqual(res.errors, []);
		assert.equal(res.ok, true);
		assert.deepEqual(
			res.findings.map((f) => f.fingerprint),
			['a/traversal', 'b/tenant'],
		);
		assert.equal(severityOf(res.findings[0]), 'high');
		assert.equal(severityOf(res.findings[1]), undefined);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('security-review REQ-004: the vendored validator rejects a finding without trace order or a validation plan', () => {
	const root = repo();
	try {
		const bad = needsValidation('x/one');
		bad.trace = [bad.trace[1], bad.trace[0]] as typeof bad.trace;
		bad.validation_plan = {} as typeof bad.validation_plan;
		const res = validateSecurityFindings([bad], root);
		assert.equal(res.ok, false);
		assert.ok(
			res.errors.some((e) => /trace\[0\]\.kind: must be "entrypoint"/.test(e)),
			res.errors.join('\n'),
		);
		assert.ok(
			res.errors.some((e) => /validation_plan: requires at least one/.test(e)),
			res.errors.join('\n'),
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('security-review REQ-004: evidence must point at an existing repo file and a line inside it', () => {
	const root = repo();
	try {
		const missing = validateSecurityFindings([needsValidation('m/file', 'src/nope.ts')], root);
		assert.ok(
			missing.errors.some((e) => /src\/nope\.ts does not exist in the repository/.test(e)),
			missing.errors.join('\n'),
		);
		const pastEnd = validateSecurityFindings([needsValidation('m/line', 'src/api.ts', 99)], root);
		assert.ok(
			pastEnd.errors.some((e) => /line 99 is past the end of src\/api\.ts \(30 lines\)/.test(e)),
			pastEnd.errors.join('\n'),
		);
		const leaving = validateSecurityFindings([needsValidation('m/esc', '../outside.ts')], root);
		assert.equal(leaving.ok, false, 'paths leaving the repo are refused');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('security-review REQ-004: a non-array submission is refused', () => {
	assert.equal(validateSecurityFindings({ not: 'an array' }, tmpdir()).ok, false);
});
